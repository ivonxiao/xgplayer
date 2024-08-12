
import { FMP4Remuxer } from 'xgplayer-transmuxer'
import { MSE } from 'xgplayer-streaming-shared'
import { logger } from '../utils'
import Events, { VIDEO_EVENTS } from '../events'
import BaseRender from './BaseRender'
import { getDecodeCapacaity } from '../config'

const AUDIO_ERROR_SUBCODE = 3

const CODEC_MAP = {
  'mp4a.40.5': 1,
  'mp4a.40.2': 2
}

const JUMP_GAP_STEP = 0.05

class MediaCache {
  _queue = []

  constructor () {
    if (typeof document !== 'undefined') {
      this._tempMedia = document.createElement('video')
    }
  }

  get tempMedia () {
    return this._tempMedia
  }

  get hasCached () {
    return this._queue.findIndex(x => x.codec === 1) !== -1 &&
    this._queue.findIndex(x => x.codec === 2) !== -1
  }

  /**
   *
   * @param {number} codec
   */
  getCachedMedia (codec) {
    const index = this._queue.findIndex(x => x.codec === codec)

    if (index !== -1) {
      return this._queue.splice(index, 1)[0]
    }
    return null
  }

  cacheMedia ({ codec, media, mse }) {
    const codecNb = CODEC_MAP[codec]

    // 丢弃已经关闭的mediasource
    this._queue = this._queue.filter(x => {
      if (x.mse && !x.mse.isOpened) {
        x.mse.unbindMedia()
      }
      return x.mse?.isOpened
    })

    if (!codec || this._queue.filter(x => x.codec === codecNb).length > 2) {
      mse?.endOfStream()
      mse?.unbindMedia()
      return
    }

    this._queue.push({
      codec: codecNb,
      media,
      mse
    })
  }
}

const mediaCache = new MediaCache()

export default class AudioMseRender extends BaseRender {
    _media

    _isTempMedia = false

    _mse

    _remuxer = null

    _codec = ''

    _sourceCreated = false

    _needInitSegment = true

    _seekNoSideEffect = false

    _startRendered = false

    _firstTimeAppendedBuffer = false

    _sampleQueue = []

    _inProcessing = false

    _duration = 0

    _mediaCache = mediaCache

    static isSupported () {
      return getDecodeCapacaity().audioWithMse &&
      !!(window.MediaSource) && window.MediaSource.isTypeSupported('video/mp4; codecs="mp4a.40.5"')
    }

    get isMse () {
      return true
    }

    get media () {
      return this._media
    }

    get currentTime () {
      return this._media.currentTime
    }

    get buffered () {
      return this._media.buffered
    }

    get duration () {
      return Number.isNaN(this._media.duration) ? Infinity : this._media.duration
    }

    set duration (d) {
      this._duration = d
      this._updateDuration(d)
    }

    get audioCanAutoplay () {
      return this._audioCanAutoplay || this.noAudio
    }

    constructor (config, parent) {
      super(config, parent)
      this.TAG = 'AudioMseRender'
      this._reuseMse = getDecodeCapacaity().reuseMseForAudio
      this._initMedia()
    }

    _initMedia () {
      if (!this._reuseMse || !mediaCache.hasCached) {
        logger.log(this.TAG, 'init media and mse directly')
        this._media = document.createElement('video')
        this._media.autoplay = true
        this._mse = new MSE()
        this._bindEvents()
        this._bindMediaEvents()
        this._mse.bindMedia(this._media)
        return
      }

      // 使用临时的video占位,等接受到音频metadata后根据codec切换到缓存中的video
      logger.log(this.TAG, 'bind media temporary')
      this._media = mediaCache.tempMedia
      this._bindEvents()
      this._isTempMedia = true
    }

    _switchMedia (codec) {
      const temp = this._media
      const cached = mediaCache.getCachedMedia(CODEC_MAP[codec])
      if (!cached) {
        this._initMedia()
      } else {
        logger.warn(this.TAG, `switch to cached media for audio play! codec=${codec}`)
        this._media = cached.media
        this._mse = cached.mse
        this._bindMediaEvents()
        this._updateDuration(this._duration)
        // fixme: 复用video + mse时不seek不播放
        this._media.currentTime = JUMP_GAP_STEP
        this._sourceCreated = true
        this._audioCanAutoplay = true
        this.analyse.addAudioMseOpend()
      }
      this._media.volume = temp.volume
      this._media.playbackRate = temp.playbackRate
      this._isTempMedia = false
    }

    _getBufferGap () {
      const buffered = this.buffered

      for (let i = 0, nb = buffered.length; i < nb; i++) {
        if (buffered.end(i) < this.currentTime) continue
        return buffered.start(i) - this.currentTime
      }
      return 0
    }

    canSeek () {
      return true
    }

    resume () {
      return this._media.play()
    }

    pause () {
      return this._media.pause()
    }

    seekNoSideEffect (point) {
      this._doChaseFrame(point)
    }

    dump () {}

    _emitTimelineEvents (e, v, d) {
      this._parent?.emit?.(e, v, d)
    }

    _assembleErr (msg, subCode) {
      const err = new Error(msg)
      err.code = 3
      err.subCode = subCode
      return err
    }

    _resetDts = () => {}

    _bindEvents () {
      super._bindEvents()
      this._parent.on(Events.DECODE_EVENTS.CHASE_AUDIO_FRAME, this._doChaseFrame)

      this._parent.on(Events.TIMELINE.UPDATE_VOLUME, (v) => {
        this._media.volume = v
        this._emitTimelineEvents(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.VOLUME_CHANGE)
      })

      this._parent.on(Events.TIMELINE.END_OF_STREAM, () => {
        if (!this.reuseMseForAudio) {
          this._mse?.endOfStream()
        }
      })

      this._parent.on(Events.TIMELINE.SET_PLAYBACKRATE, v => {
        logger.log(this.TAG, 'change playbackrate, ', v)
        this._media.playbackRate = v
      })
    }

    _bindMediaEvents () {
      this._media.addEventListener('canplay', this._onCanplay)

      this._media.addEventListener('playing', this._onPlaying)

      this._media.addEventListener('waiting', this._onWaiting)

      this._media.addEventListener('seeked', this._onSeeked)

      this._media.addEventListener('progress', this._onProgress)

      this._media.addEventListener('ended', this._onEnded)

      this._media.addEventListener('progress', this._onOnceProgress)

      this._media.addEventListener('error', this._onError)
    }

    _onCanplay = () => {
      if (!this._ready) {
        this._ready = true
        this.emit(Events.AUDIO.AUDIO_READY)
      }
    }

    _onPlaying = () => {
      if (!this._parent.ready) return
      this._audioCanAutoplay = true
      this._emitTimelineEvents(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.PLAYING)
    }

    _onWaiting = () => {
      if (this._seekNoSideEffect) return

      try {
        const buffered = this._media.buffered
        const currentTime = this._media.currentTime
        let bufferEnd = 0
        for (let i = 0, l = buffered.length; i < l; i++) {
          if (buffered.start(i) < currentTime && buffered.end(i) > currentTime) {
            bufferEnd = buffered.end(i) - currentTime
          }
        }

        // seeking造成的buffer内 waiting
        if (Math.abs(bufferEnd) > 0.5) return

        // end without mse endofstream
        if (Math.abs(this._media.duration - this._media.currentTime) < 0.3) {
          if (!this._reuseMse) {
            this._mse.endOfStream()
          }
          this?._emitTimelineEvents(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.ENDED)
          return
        }
      } catch (e) {}

      this._ready = false
      this.emit(Events.AUDIO.AUDIO_WAITING)
    }

    _onSeeked = () => {
      if (this._seekNoSideEffect || this._isLive) {
        this._seekNoSideEffect = false
        return
      }
      logger.log(this.TAG, 'seeked')
      if (!this._ready) {
        this._media.pause()
        this._ready = true
        this.emit(Events.AUDIO.AUDIO_READY)
      }
    }

    _onProgress = () => {
      // 新增buffer后存在gap不能起播
      if (this._media.readyState <= 1) {
        const gap = this._getBufferGap()
        // 跳过小gap
        if (gap > 0 && gap < 1) {
          this._media.currentTime += gap + JUMP_GAP_STEP
          logger.warn(this.TAG, 'progress, gap=', gap)
        }
      }
      this._emitTimelineEvents(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.PROGRESS)
      this._emitTimelineEvents(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.DURATION_CHANGE)
    }

    _onEnded = () => {
      logger.log(this.TAG, 'ended!')
      this?._emitTimelineEvents(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.ENDED)
    }

    // 起播gap时
    _onOnceProgress = () => {
      const buffered = this._media.buffered
      if (buffered.length) {
        const startTime = this._media.buffered.start(0)
        if (startTime) {
          this._media.currentTime = startTime + JUMP_GAP_STEP
          logger.log(this.TAG, 'start gap:', startTime)
        }
        this._media.removeEventListener('progress', this._onOnceProgress)
      }
    }

    _onError = () => {
      this._emitTimelineEvents(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.ERROR, this._assembleErr(`audio error: ${this._media.error?.message}`, AUDIO_ERROR_SUBCODE))
    }

    async _updateDuration (d) {
      if (this._mse) {
        if (!this._mse.isOpened) {
          await this._mse.open()
        }
        await this._mse.updateDuration(d)
        logger.log(this.TAG, 'update duration', d)
      }
    }

    // 接受数据
    _appendChunk = (_, audioTrack) => {
      if (this.noAudio) return
      if (!audioTrack.samples.length) return

      if (!this._codec) {
        if (audioTrack.objectType !== 2 && audioTrack.objectType !== 5) {
          this._codec = 'mp4a.40.5'
        } else {
          this._codec = audioTrack.codec
        }
        // check use cached media directly
        if (this._isTempMedia) {
          this._switchMedia(this._codec)
        }
      }

      audioTrack.samples.forEach((s) => {
        s.baseMediaDecodeTime = audioTrack.baseMediaDecodeTime
        this._sampleQueue.push(s)
      })
      audioTrack.samples = []

      if (!this._meta) {
        this._meta = { ...audioTrack, exist: () => true, hasSample: () => true, samples: [] }
        logger.warn(this.TAG, 'audio set metadata', this._meta)
        this._doAppendWrapper()
        return
      }

      // 更新metadata
      if (this._meta.sampleRate !== audioTrack.sampleRate) {
        logger.warn(this.TAG, `discontinue: ${this._meta.sampleRate} -> ${audioTrack.sampleRate}`)
        this._needInitSegment = true
        Object.keys(audioTrack).forEach(k => {
          this._meta[k] = audioTrack[k]
        })
      }

      if (!this._inProcessing && this._sampleQueue.length) {
        this._doAppendWrapper()
      }
    }

    async _doAppendWrapper () {
      this._meta.samples = this._sampleQueue.slice()
      // 设置新buffer在时间轴的开始播放时间
      this._meta.baseMediaDecodeTime = this._meta.samples[0].baseMediaDecodeTime
      this._sampleQueue = []

      try {
        this._inProcessing = true

        const end = await this._doAppend(this._meta)

        if (this.isLive) {
          this._emitTimelineEvents(Events.TIMELINE.UPDATE_SEGMENT_END, end)
        }

        this._inProcessing = false

        if (this._sampleQueue.length) {
          await this._doAppendWrapper()
        }
      } catch (e) {
        this._emitTimelineEvents(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.ERROR, this._assembleErr(`audio error: ${e?.message}`, AUDIO_ERROR_SUBCODE))
      }
    }

    _doAppend = async (audioTrack) => {
      if (!this._remuxer) {
        this._remuxer = new FMP4Remuxer({ samples: [], exist: () => false }, audioTrack)
      }

      const { samples } = audioTrack

      if (!this._sourceCreated) {
        this.analyse.addAudioMseOpenStart()
        await this._mse.open()
        this._sourceCreated = true
        logger.log(this.TAG, `video/mp4;codecs=${this._codec}`)
        this._mse.createSource(audioTrack.type, `video/mp4;codecs=${this._codec}`)
        this.analyse.addAudioMseOpend()
        logger.log(this.TAG, 'sb created!')
        // check autoplay once canplay
        this._checkAutoPlay()
      }

      const remuxResult = this._remuxer.remux(this._needInitSegment)

      if (this._needInitSegment && !remuxResult.audioInitSegment) {
        return
      }

      this._needInitSegment = false

      const p = []
      if (remuxResult.audioInitSegment) p.push(this._mse.append(audioTrack.type, remuxResult.audioInitSegment))
      if (remuxResult.audioSegment) p.push(this._mse.append(audioTrack.type, remuxResult.audioSegment))
      return Promise.all(p)
        .then(() => samples[samples.length - 1].dts / 1000)
        .then(() => {
          if (!this._firstTimeAppendedBuffer) {
            this._firstTimeAppendedBuffer = true
            this.analyse.addAudioFirstTimeAppended()
          }
        })
    }

    _checkAutoPlay () {
      const canplayHandler = () => {
        const originVolume = this._media.volume
        this._media.volume = Math.min(originVolume, 0.1)
        let req = this._media.play()
        // eslint-disable-next-line prefer-promise-reject-errors
        req = req.then ? req : Promise.reject()
        req
          .then(() => {
            logger.log(this.TAG, 'auto play by checkAutoPlay!')
            this._audioCanAutoplay = true
          })
          .catch(() => {
            logger.warn(this.TAG, 'can’t auto play!')
            this._audioCanAutoplay = false
            this.emit(Events.AUDIO.AUDIO_NOT_ALLOWED_AUTOPLAY)
          }).finally(() => {
            this._media.volume = originVolume
            if (!this._startRendered) {
              this._media.pause()
              logger.log(this.TAG, 'auto paused by checkAutoPlay!')
            }
            this._media.removeEventListener('canplay', canplayHandler)
          })
      }
      this._media.addEventListener('canplay', canplayHandler)
    }

    _doPlay = () => {
      this._media.play().catch(() => {})
    }

    _doPause = () => {
      this._media.pause()
    }

    _doSeek = (v) => {
      this._ready = false
      this._media.currentTime = v
    }

    _doChaseFrame = ({ position }) => {
      this._seekNoSideEffect = true
      this._media.currentTime = position
    }

    _startRender = () => {
      logger.log(this.TAG, 'start render')
      this._startRendered = true
      this._media.play().catch(() => {})
    }

    async _destroy () {
      logger.log(this.TAG, 'destroy audio render')
      this._remuxer = null
      this.removeAllListeners()
      this._media.removeEventListener('canplay', this._onCanplay)
      this._media.removeEventListener('playing', this._onPlaying)
      this._media.removeEventListener('waiting', this._onWaiting)
      this._media.removeEventListener('seeked', this._onSeeked)
      this._media.removeEventListener('progress', this._onProgress)
      this._media.removeEventListener('ended', this._onEnded)
      this._media.removeEventListener('progress', this._onOnceProgress)
      this._media.removeEventListener('error', this._onError)
      if (!this._reuseMse) {
        this._mse?.endOfStream()
        await this._mse?.unbindMedia()
      } else {
        this._mse?.clearAllBuffer()
        mediaCache.cacheMedia({
          codec: this._codec,
          media: this._media,
          mse: this._mse
        })
        logger.log(this.TAG, 'cache media for audio play, codec=', this._codec)
      }
      if (this._meta) {
        this._meta.duration = 0
      }
      this._mse = null
      this._media = null
    }
}
