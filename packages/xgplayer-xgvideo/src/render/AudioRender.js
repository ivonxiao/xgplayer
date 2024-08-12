import { AudioCodecType } from 'xgplayer-transmuxer'
import Events, { VIDEO_EVENTS } from '../events'
import { initBgSilenceAudio, playSlienceAudio } from '../helper/audio-helper'
import { logger } from '../utils'
import AudioHelper from './audio-helper'
import AudioTimeRange from './AudioTimeRange'
import BaseRender from './BaseRender'

const MEDIA_ERR_DECODE = 3

const ERROR_MSG = {
  INIT_AUDIO_ERR: 'create new AudioContext error',
  DECODE_ERR: 'audio data decode error'
}

export default class AudioRender extends BaseRender {
  constructor (config, parent) {
    super(config, parent)
    this.TAG = 'AudioRender'
    this._timeRange = new AudioTimeRange(this)
    this._lastTimeLineTime = 0 // 用于seek时记录seek位置,audioCtx重新实例化，audioCtx.currentTime从0开始
    this._sampleQueue = []
    this._source = null
    this._audioCanAutoplay = true
    this._lastBuffer = null
    this._inDecoding = false
    this._endOfStream = false
    this._delay = 0
    this._isSourceBufferEnd = -1
    this._onSourceBufferEnded = this._onSourceBufferEnded.bind(this)
    this._initAudioCtx(config.volume || 0.6)
    this._bindEvents()
  }

  get baseDts () {
    return this._timeRange._baseDts
  }

  get currentTime () {
    if (!this._audioCtx) return 0
    return this._lastTimeLineTime + this._audioCtx.currentTime
  }

  get preloadTime () {
    return this.isLive ? 1 : 0
  }

  get timescale () {
    return 1000
  }

  get buffered () {
    return this._timeRange.buffered
  }

  get ctxState () {
    return this._audioCtx.state
  }

  get audioCanAutoplay () {
    return this._audioCanAutoplay
  }

  resume () {
    if (this._audioCtx && this._audioCtx.state === 'suspended') {
      return this._audioCtx.resume().catch((e) => {})
    }
  }

  canSeek (time) {
    return this._timeRange.canSeek(time)
  }

  doPause = this._doPause

  _assembleErr (msg) {
    const err = new Error(msg)
    err.code = MEDIA_ERR_DECODE
    return err
  }

  _emitTimelineEvents (e, v, d) {
    this._parent?.emit?.(e, v, d)
  }

  _initAudioCtx (volume) {
    logger.log(this.TAG, 'init audioCtx')
    const AudioContext = window.AudioContext || window.webkitAudioContext
    this._audioCtx = new AudioContext()
    if (!this._audioCtx) {
      logger.warn(this.TAG, 'create webaudio error!')
      // AudioRender instantiate  by Timeline, and timeline error handler no bind that time
      // so emit sync here
      setTimeout(() => {
        this._emitTimelineEvents(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.ERROR, this._assembleErr(ERROR_MSG.INIT_AUDIO_ERR))
      })
      return
    }
    this._gainNode = this._audioCtx.createGain()
    this._gainNode.gain.value = volume
    this._gainNode.connect(this._audioCtx.destination)
    this._audioCanAutoplay = this._audioCtx.state === 'running'
    logger.log(this.TAG, 'webAudio state:', this._audioCtx.state)
    initBgSilenceAudio()
    this._bindAudioCtxEvent()
    return this._audioCtx.suspend()
  }

  _bindAudioCtxEvent () {
    this._onStateChange = () => {
      if (!this._audioCtx) return
      if (this._audioCtx.state === 'running' && this._ready) {
        this._emitTimelineEvents(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.PLAYING)
      }
    }
    this._audioCtx.addEventListener('statechange', this._onStateChange)
  }

  _bindEvents () {
    super._bindEvents()
    this._parent.on(Events.DECODE_EVENTS.CHASE_AUDIO_FRAME, this._doChaseFrame.bind(this))

    this._parent.on(Events.TIMELINE.UPDATE_VOLUME, (v) => {
      if (!this._gainNode) return
      this._gainNode.gain.value = Number.isFinite(v) ? v : 1
      this._emitTimelineEvents(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.VOLUME_CHANGE)
    })

    this._parent.on(Events.TIMELINE.END_OF_STREAM, () => {
      this._endOfStream = true
      if (!this.noAudio && !this._timeRange?.hasBuffer()) {
        this?._emitTimelineEvents(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.ENDED)
      }
    })
  }

  // receive new compressed samples
  _appendChunk (_, audioTrack) {
    if (this.noAudio) return

    if (!this._meta) {
      this._meta = audioTrack
      logger.warn(this.TAG, 'audio set metadata', this._meta)
    }

    const { samples } = audioTrack
    if (samples.length) {
      this._sampleQueue = this._sampleQueue.concat(samples)
      audioTrack.samples = []
      const { codecType } = this._meta

      if (this._inDecoding) return

      switch (codecType) {
        case AudioCodecType.AAC:
          this._decodeAACWrapper()
          break
        case AudioCodecType.G711PCMA:
        case AudioCodecType.G711PCMU:
          this._decodeG711()
          break
        default:
          logger.warn(this.TAG, 'unsupported codec type:', codecType)
          break
      }
    }
  }

  _resetDts (dts, type) {
    if (type === 'video') return
    this._timeRange.resetDts(dts)
  }

  _doPlay () {
    if (this.noAudio || this._parent.seeking) {
      return
    }

    if (!this._source && this.currentTime) {
      this._startRender()
      return
    }
    this.resume()
  }

  _doPause () {
    if (this.noAudio) {
      return
    }
    this._audioCtx.suspend()
  }

  _reInitAudioCtx (time) {
    this._lastTimeLineTime = time
    this._lastBuffer = null
    this._lastAudioBufferInfo = null
    this._delay = 0

    // for seek continuous
    if (!(this._ready && this._audioCtx.currentTime)) {
      return Promise.resolve()
    }

    const volume = this._gainNode.gain.value

    return this._audioCtx.close().then(() => {
      this._audioCtx.removeEventListener('statechange', this._onStateChange)
      this._audioCtx = null
      if (this._source) {
        this._source.removeEventListener('ended', this._onSourceBufferEnded)
      }
      this._source = null
      return this._initAudioCtx(volume)
    })
  }

  // seek for vod
  _doSeek (time) {
    this._reInitAudioCtx(time)
      .then(() => {
        this._getAudioBuffer(true)
      })
      .catch((e) => {})
  }

  // for live
  _doChaseFrame ({ position }) {
    const next = this._timeRange.deletePassed(position)
    if (!next) return
    logger.log(this.TAG, '_doChaseFrame', 'startTime:', next.start, 'buffeLength:', this.buffered.end(0) - next.start)
    this._reInitAudioCtx(next.start)
      .then(() => {
        this._startRender()
        this._emitTimelineEvents(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.TIMEUPDATE)
      })
      .catch((e) => {})
  }

  async _decodeAACWrapper () {
    const len = this._sampleQueue.length
    const samp0 = this._sampleQueue[0]
    const sampLast = this._sampleQueue[len - 1]
    const duration = (sampLast.dts - samp0.dts) / this.timescale

    if (duration < 1) return

    // 对于长分片进行切割
    const nbChunk = parseInt(duration / 3 - 1) || 1
    const nbChunkSample = parseInt(len / nbChunk)
    const chunks = []

    for (let i = 0; i < nbChunk; i++) {
      if (i < nbChunk - 1) {
        chunks.push(this._sampleQueue.slice(i * nbChunkSample, (i + 1) * nbChunkSample))
      } else {
        chunks.push(this._sampleQueue.slice(i * nbChunkSample))
      }
    }

    this._sampleQueue = []

    this._inDecoding = true

    try {
      await this._decodeCycle(chunks)
      if (!this._isLive) {
        const buffers = this._timeRange._buffers
        const last = buffers[buffers.length - 1]

        if (last) {
          this._emitTimelineEvents(Events.TIMELINE.UPDATE_SEGMENT_END, last.end)
        }
      }
    } catch (e) {
      this._emitTimelineEvents(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.ERROR, this._assembleErr(`ERROR_MSG.DECODE_ERR:${e && e.message}`))
    }

    this._inDecoding = false
  }

  async _decodeCycle (chunks) {
    const c = chunks.shift()

    if (!c) return

    await this._decodeAAC(c)

    await this._decodeCycle(chunks)
  }

  _decodeAAC (sampleQueue) {
    const samp0 = sampleQueue[0]
    let delay = 0

    AudioHelper.checkRefillFrame(sampleQueue)

    const adtss = sampleQueue.map((sample) => {
      return AudioHelper.packageAACToAdts(this._meta, sample)
    })

    const chunkBuffer = AudioHelper.concatAdts(adtss, 0)

    return new Promise((resolve, reject) => {
      const req = this._audioCtx.decodeAudioData(
        chunkBuffer.buffer,
        (uncompress) => {
          if (!this._timeRange) return

          if (this._lastAudioBufferInfo && this.isLive) {
            const info = this._lastAudioBufferInfo
            const endTime = info.dts + info.duration
            delay = samp0.dts - endTime
            if (delay > 1) {
              // 把丢掉音频帧的时长加上
              this._timeRange._duration += delay / 1000

              logger.log(this.TAG, '_decodeAAC', 'audio data dts is not continue, last end dts:', endTime, ',now start Dts:', samp0.dts, 'delay:', delay)
            }
          }

          this._lastAudioBufferInfo = {
            duration: Math.floor(uncompress.duration * 1000),
            dts: samp0.dts
          }

          const start = this._timeRange.append(uncompress, uncompress.duration, samp0.dts, delay / 1000)

          if (!this._ready) {
            // init background Audio ele

            const littleMatch = Math.abs(start + uncompress.duration - this.currentTime) < 0.5

            const canEmit = this.isLive || !littleMatch
            if (canEmit) {
              this._ready = true
              logger.log(this.TAG, '_decodeAAC', 'set ready true start=', start)
              this.emit(Events.AUDIO.AUDIO_READY, start)
            }
          }
          this._emitTimelineEvents(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.PROGRESS)
          this._emitTimelineEvents(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.DURATION_CHANGE)
          resolve()
        },
        reject
      )
      if (req.catch) {
        req.catch(reject)
      }
    })
  }

  _decodeG711 () {
    const len = this._sampleQueue.length
    const samp0 = this._sampleQueue[0]
    const sampLast = this._sampleQueue[len - 1]
    const less = (sampLast.dts - samp0.dts) / this.timescale < 0.5

    if (less) return

    const byteLength = this._sampleQueue.reduce((all, c) => {
      all += c.data.byteLength
      return all
    }, 0)

    const g711Buffer = new Uint8Array(byteLength)

    let startDts = 0
    let offset = 0

    this._sampleQueue.forEach((x, index) => {
      if (index === 0) {
        startDts = x.dts
      }
      g711Buffer.set(x.data, offset)
      offset += x.data.byteLength
    })

    this._sampleQueue = []

    try {
      const { codecType, channelCount, sampleSize, sampleRate } = this._meta
      const pcmBuffer = AudioHelper.decodeG711(g711Buffer, codecType)
      const { audioBuffer, duration } = AudioHelper.createAudioBufferFromPcm(this._audioCtx, pcmBuffer.buffer, channelCount, sampleRate, sampleSize / 8)
      const start = this._timeRange.append(audioBuffer, duration, startDts, 0)
      if (!this._ready) {
        this._ready = true
        logger.log(this.TAG, '_decodeG711', 'set ready true')
        this.emit(Events.AUDIO.AUDIO_READY, start)
      }
      this._emitTimelineEvents(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.PROGRESS)
      this._emitTimelineEvents(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.DURATION_CHANGE)
    } catch (e) {
      this._emitTimelineEvents(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.ERROR, this._assembleErr(`ERROR_MSG.DECODE_ERR:${e && e.message}`))
    }
  }

  _onSourceBufferEnded () {
    this._isSourceBufferEnd = true
    if (logger.long) {
      logger.log(this.TAG, `source play end! currentTime:${this.currentTime} , duration:${this.duration}`)
    }
    this._startRender()
  }

  // 不精准seek,调整seek点到当前buffer开始位置
  // 两个来源: 1. seek的位置存在buffer,_getAudioBuffer中直接执行
  //          2. seek位置无buffer，等待下载,decodeAudioData()执行完后 监听 AUDIO_READY
  _ajustSeekTime (time) {
    const buffer = this._timeRange.getBuffer(time, 0)
    if (buffer) {
      logger.log(this.TAG, 'ajust seek time to:', buffer.start)
      this._lastTimeLineTime = buffer.start
    }
  }

  _getAudioBuffer (inSeeking) {
    if (!this._timeRange) return
    const buffer = this._timeRange.getBuffer(this._lastBuffer ? this._lastBuffer.end : this.currentTime, 0)
    if (!buffer) {
      // check end
      if ((this._endOfStream || !this._isLive) && this.currentTime - this.duration > -0.5) {
        this._emitTimelineEvents(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.TIMEUPDATE)
        this._emitTimelineEvents(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.ENDED)
        return
      }
      this._ready = false
      this._audioCtx.suspend()
      this.emit(Events.AUDIO.AUDIO_WAITING)
      if (inSeeking) {
        if (!this._onAudioReady) {
          this._onAudioReady = (time) => {
            this._ajustSeekTime(time)
          }
        }
        this.removeListener(Events.AUDIO.AUDIO_READY, this._onAudioReady)
        this.once(Events.AUDIO.AUDIO_READY, this._onAudioReady)
      }
      return
    }
    if (inSeeking) {
      this._ajustSeekTime(buffer.start)
      this.emit(Events.AUDIO.AUDIO_READY)
      return
    }
    return buffer
  }

  _startRender (from) {
    if (this.noAudio) return

    // from为video,表示由videoRender触发waiting后，又继续播放
    if (from === 'video' && this.isLive && this._ready && !this._isSourceBufferEnd) {
      console.log(this.TAG, '_startRender, audio currentTime', this.currentTime, 'from:', from, '_isSourceBufferEnd:', this._isSourceBufferEnd, 'ready:', this._ready)
      this._doPlay()
      return
    }
    const buffer = this._getAudioBuffer()

    if (!buffer) return
    if (this._audioCtx.state === 'suspended') {
      this._audioCtx.resume().catch((e) => {})
      playSlienceAudio()
    }
    this._lastBuffer = buffer
    this._source = null

    const _source = this._audioCtx.createBufferSource()
    _source.buffer = buffer.source
    _source.loop = false

    // 保存引用,移动浏览器下,对source的回收机制有差异，不保存引用会提前回收,导致ended事件不触发
    this._source = _source

    _source.addEventListener('ended', this._onSourceBufferEnded)
    _source.connect(this._gainNode)

    // 音频丢帧时会导致currentTime与buffer的startDts值不一致，这时候需要对currentTime进行校正
    if (buffer.delay && buffer.delay > 0.001) {
      this._delay += buffer.delay
    }

    this.startDts = buffer.startDts

    try {
      this._isSourceBufferEnd = false
      _source.start()
    } catch (e) {}

    if (buffer.startDts) {
      this._emitTimelineEvents(Events.TIMELINE.SYNC_DTS, buffer.startDts)
    }
  }

  _destroy () {
    logger.log(this.TAG, 'destroy audio...')
    if (this._source) {
      this._source.removeEventListener('ended', this._onSourceBufferEnded)
    }
    if (this._audioCtx && this.ctxState !== 'closed') {
      this._audioCtx.close()
    }
    this._audioCtx = null
    this._sampleQueue = null
    this._timeRange = null
    this._parent = null
    this.removeAllListeners()
  }
}
