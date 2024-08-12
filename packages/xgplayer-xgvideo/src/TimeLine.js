import EventEmitter from 'eventemitter3'
import { logger } from './utils'
import AudioRender from './render/AudioRender'
import AudioMseRender from './render/AudioMseRender'
import VideoRenderWithVideo from './render/VideoRenderWithVideo'
import VideoRenderWithDecoder from './render/VideoRenderWithDecoder'
import Events, { VIDEO_EVENTS } from './events'
import { updateLowdecodeVV } from './disabled'
import { getDecodeCapacaity } from './config'

const TOLERANCE = 0.1

export default class TimeLine extends EventEmitter {
  constructor (config, parent) {
    super()
    this.TAG = 'TimeLine'
    this._parent = parent
    this._seeking = false
    this.audioRender = false && AudioMseRender.isSupported() ? new AudioMseRender(config, this) : new AudioRender(config, this)
    this.videoRender = new VideoRenderWithDecoder(config, this)
    this._readyStatus = {
      audio: false,
      video: false
    }
    this._paused = true
    this._switchToMultiWorker = false
    this._lowdecodeEmited = false
    this._startPlayed = false
    this._emitReady = false
    this._lastSeekTime = 0.0001
    this._singleTrack = -1
    this._bindEvent()
    this._decodeVideo = config.video
  }

  get analyse () {
    return this._parent.analyse
  }

  get ready () {
    return this._readyStatus.video && this._readyStatus.audio
  }

  get played () {
    return {
      length: this.currentTime ? 1 : 0,
      start: () => 0,
      end: () => this.currentTime
    }
  }

  get noAudio () {
    return this._singleTrack === 1 || this._singleTrack === 2
  }

  get isLive () {
    return this._parent.live
  }

  get seeking () {
    return this._seeking
  }

  get decodeFps () {
    return this.videoRender.decodeFps
  }

  get decodeCost () {
    return this.videoRender.decodeCost
  }

  get renderCost () {
    return this.videoRender.renderCost
  }

  get wasmInitCost () {
    return this.videoRender.wasmInitCost
  }

  get fps () {
    return this.videoRender.fps
  }

  get totalSize () {
    return this.videoRender.totalSize
  }

  get bitrate () {
    return this.videoRender.bitrate
  }

  get gopLength () {
    return this.videoRender.gopLength
  }

  get currentTime () {
    if (this.noAudio) {
      if (this.paused) {
        return this.videoRender.nextFrameTime
      }
      return this.videoRender.currentTime
    }
    return this.audioRender.currentTime
  }

  get timelinePosition () {
    if (this.noAudio) return performance.now() / 1000 // s
    return this.audioRender.currentTime
  }

  get canvas () {
    return this.videoRender.canvas
  }

  get readyState () {
    return this.videoRender.readyState
  }

  get buffered () {
    if (this.noAudio) return this.videoRender.buffered

    if (this.isLive) return this.audioRender.buffered

    return {
      length: this.audioRender.buffered.length,
      start: (index) => {
        return Math.max(this.audioRender.buffered.start(index), this.videoRender.buffered.start(index))
      },
      end: (index) => {
        return Math.min(this.audioRender.buffered.end(index), this.videoRender.buffered.end(index))
      }
    }
  }

  get duration () {
    if (this.noAudio) return this.videoRender.duration
    if (this.isLive) return this.audioRender.duration
    return Math.min(this.audioRender.duration, this.videoRender.duration)
  }

  get paused () {
    return this._paused
  }

  set paused (v) {
    this._paused = v
  }

  get lowlatency () {
    return this._parent.lowlatency
  }

  get decoderMode () {
    return this.videoRender.decoderMode
  }

  get currentAudioCanAutoplay () {
    return this.audioRender.audioCanAutoplay
  }

  _getController (videoDecode, config) {
    if (videoDecode) {
      return new VideoRenderWithVideo(config, this)
    } else {
      return new VideoRenderWithDecoder(config, this)
    }
  }

  // 播放时间点是否在buffer内
  _checkInBuffer () {
    const buffered = this.buffered

    for (let i = 0, nb = buffered.length; i < nb; i++) {
      if (buffered.start(i) <= this.currentTime + TOLERANCE && buffered.end(i) >= this.currentTime) return true
    }
    return false
  }

  _resetReadyStatus () {
    this._readyStatus.audio = false
    this._readyStatus.video = false
  }

  _bindEvent () {
    this.on(Events.DECODE_EVENTS.REMUX, (remux) => {
      this.videoRender.setRemux(remux)
    })

    // audio chase frame aftrer video chase frame
    this.on(Events.DECODE_EVENTS.CHASE_VIDEO_FRAME_END, (keyframe) => {
      this.emit(Events.DECODE_EVENTS.CHASE_AUDIO_FRAME, keyframe)
    })

    this.audioRender.on(Events.AUDIO.AUDIO_READY, () => {
      logger.log(this.TAG, 'audio ready! seeking=', this._seeking)
      if (this._seeking) {
        // delay to waiting video buffer append finished
        setTimeout(() => {
          try {
            const keyframe = this.videoRender.getSeekStartPosition(this.currentTime, Infinity)
            if (this.audioRender.isMse && keyframe) {
              // 精准seek
              if (getDecodeCapacaity().preciseSeek > this.duration && this.currentTime > TOLERANCE) {
                this.audioRender.seekNoSideEffect({ position: this.currentTime + TOLERANCE })
                this.videoRender.ajustSeekTime(this.currentTime, true)
                return
              }
              // 非精准seek,重启调整起播时间点
              this.audioRender.seekNoSideEffect({ position: keyframe.position + TOLERANCE })
              this.videoRender.ajustSeekTime(keyframe.position)
              return
            }
            this.videoRender.ajustSeekTime(this.currentTime)
          } catch (e) {}
        }, 10)
      }

      if (this._readyStatus.video) {
        this._startRender()
      }

      this._readyStatus.audio = true

      if (this._startPlayed) return
      this.analyse.addAudioReady()
    })

    this.audioRender.on(Events.AUDIO.AUDIO_NOT_ALLOWED_AUTOPLAY, () => {
      if (this._emitReady) {
        this.pause()
      }
    })

    this.audioRender.on(Events.AUDIO.AUDIO_WAITING, () => {
      if (this.noAudio || !this.currentTime) return
      logger.warn(this.TAG, 'lack data, audio waiting,currentTime:', this.currentTime)
      this.emit(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.TIMEUPDATE)
      this.emit(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.WAITING)
      this.emit(Events.TIMELINE.DO_PAUSE)
      this._readyStatus.audio = false
    })

    // only used for no audio exist
    this.videoRender.on(Events.VIDEO.VIDEO_WAITING, () => {
      logger.warn(this.TAG, 'lack data, video waiting')
      this.emit(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.WAITING)
      this.emit(Events.TIMELINE.DO_PAUSE)
      this._readyStatus.video = false
    })

    this.videoRender.on(Events.VIDEO.VIDEO_READY, () => {
      logger.log(this.TAG, 'video ready!')
      if (!this._startPlayed) {
        this.analyse.addVideoReady()
      }
      if (this._readyStatus.audio) {
        this._startRender('video')
      }
      this._readyStatus.video = true
    })

    this.videoRender.on(Events.VIDEO.DECODE_LOW_FPS, () => {
      if (this.currentTime < 2) return

      this.analyse.increaseLowDecodeCount()

      if (!this._lowdecodeEmited) {
        updateLowdecodeVV()
        this._lowdecodeEmited = true
      }
      this.emit(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.LOW_DECODE)
    })

    this.on(Events.TIMELINE.SINGLE_TRACK, (type) => {
      this._singleTrack = type

      if (type === 1 || type === 2) {
        this._readyStatus.audio = true
      }
      if (type === 3) {
        this._readyStatus.video = true
      }
      this.emit(Events.TIMELINE.SYNC_DTS, 0)
    })

    this.on(Events.TIMELINE.DESTROY, () => {
      this.removeAllListeners()
      this.videoRender = null
      this.audioRender = null
    })

    // for vod
    this.on(Events.TIMELINE.DO_PLAY, () => {
      this.emit(Events.TIMELINE.START_RENDER)
      this._paused = false
      this._lastSeekTime = 0.0001

      if (this.noAudio) {
        this.emit(Events.TIMELINE.SYNC_DTS, 0)
      }
    })
  }

  _startRender (from) {
    if (this._parent.error || !this.videoRender) return

    if (this.noAudio) {
      this.emit(Events.TIMELINE.SYNC_DTS, 0)
    }

    // for first frame show
    this.videoRender.forceRender()

    if (!this.isLive && this._paused && this.seeking && this._checkInBuffer()) {
      logger.log(this.TAG, 'set seeking = false')
      this._seeking = false
      this.emit(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.SEEKED)
      logger.groupEnd()
      return
    }

    if (!this._startPlayed) {
      this.analyse.addFirstframe()
      this.emit(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.LOADEDDATA)
      this.emit(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.FIRST_FRAME)
      this._startPlayed = true
    }

    logger.log(this.TAG, 'emit canplay')
    this.emit(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.CANPLAY)

    // for autoplay:false not run
    // opposite emit START_RENDER by play() call index.js
    if (this._parent.autoplay) {
      logger.warn(this.TAG, 'startRender: time=', this.currentTime, 'paused:', this.paused, 'seeking:', this.seeking)
      this.emit(Events.TIMELINE.START_RENDER, from)
    } else {
      this._parent.autoplay = true
      this.emit(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.PAUSE)
    }

    // video & audio render ready
    this.emit(Events.TIMELINE.READY)
    this._emitReady = true

    if (this._seeking && this._checkInBuffer()) {
      logger.log(this.TAG, 'set seeking = false')
      this._seeking = false
      this.emit(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.SEEKED)
      logger.groupEnd()
    }
  }

  // for vod. reset dts when segment discontinue
  _checkHlsTracks (vTrack) {
    const vSamp0 = vTrack?.samples[0]
    if (!vSamp0) {
      if (!this.buffered.length) {
        const e = new Error('lack video sample')
        e.code = 3
        // 暂不支持只有单track
        this.emit(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.ERROR, e)
      }
      return false
    }
    return true
  }

  appendBuffer (videoTrack, audioTrack) {
    this.emit(Events.TIMELINE.APPEND_CHUNKS, videoTrack, audioTrack)
    if (this.noAudio && this._seeking) {
      this.videoRender.ajustSeekTime(this.currentTime)
    }
  }

  play () {
    return new Promise((resolve, reject) => {
      let resumed = this.currentAudioCanAutoplay
      if (this.noAudio) {
        resumed = true
      } else if (this.audioRender) {
        this.audioRender.resume().then(() => {
          logger.log(this.TAG, `audio render resumed, pause status: ${this._paused}, audioCanAutoplay:${this.currentAudioCanAutoplay}`)
          if (this._paused || !this.currentAudioCanAutoplay) {
            resumed = false
            // resume() finish after timer
            this.emit(Events.TIMELINE.DO_PAUSE)
            return
          }
          resumed = true
        }).catch(() => {})
      }

      setTimeout(() => {
        logger.log(this.TAG, `play() timer done, resumed=${resumed}, paused=${this.paused}`)
        if (!resumed) {
          if (!this.paused) {
            logger.log(this.TAG, 'audioCtx can\'t autoplay')
            this.pause()
            // eslint-disable-next-line prefer-promise-reject-errors
            reject({
              name: 'NotAllowedError'
            })
            return
          }
          return
        }
        // 暂时没有和音频不能自动播放合到一起
        if (this.videoRender && !this.videoRender.canAutoPlay) {
          console.warn('video render an\'t autoplay')
          this.pause()
          resolve()
          return
        }

        this._paused = false
        resolve()
      }, this.audioRender.isMse ? 10 : 60)
    })
  }

  pause () {
    if (this._paused || (!this.ready && !this._seeking)) return
    this.emit(Events.TIMELINE.DO_PAUSE)
    this._paused = true
    this.emit(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.PAUSE)
  }

  seek (time) {
    if (this._seeking) {
      logger.groupEnd()
    }

    if (this.isLive) {
      if (this.currentTime < TOLERANCE || !this.currentAudioCanAutoplay || this.paused) return

      /**
       * process of chase frame:
       * 1. find the recently keyframe before time, time - keyframePosition < preloadTime
       * 2. for audio._timeRange, find the recently buffer `A` after keyframePosition, may no exist
       * 3. videoRender flush decoder, empty frameQueue and delete all frames in timeRage before keyframePosition
       * 4. audioRender deleta buffer before `A`,recreate audioCtx
       */
      const keyframe = this.videoRender.getSeekStartPosition(time, this._parent.preloadTime + 1)
      if (keyframe) {
        if (keyframe.position < this.currentTime) return

        const audioCanSeek = this.audioRender.canSeek(keyframe.position)
        const videoCanSeek = this.videoRender.canSeek(keyframe)
        if (!audioCanSeek || !videoCanSeek) {
          logger.log(this.TAG, 'seek, !!!!!!!!!can not seek, audioCanSeek:', audioCanSeek, 'videoCanSeek:', videoCanSeek)
          return
        }
        logger.warn(this.TAG, 'seek, chase frame to time: ', keyframe.position, 'currentTime:', this.currentTime, 'duration:', this.duration)
        if (this.videoRender.videoDecode) {
          this.audioRender.doPause()
          keyframe.position = keyframe.position - 1.5
          this.emit(Events.DECODE_EVENTS.CHASE_VIDEO_FRAME, keyframe)
        } else {
          this.emit(Events.TIMELINE.CHASE_FRAME, keyframe)
        }
      }
      return
    }

    // 连续两次seek到同一位置
    if (this._lastSeekTime === time) return

    // seek后又小范围内调整
    if (time && Math.abs(this._lastSeekTime - time) <= 0.2) return

    this._lastSeekTime = time

    if (time >= this.duration) {
      time = this.duration - 1
    }

    if (time < 0) {
      time = 0
    }

    logger.group(this.TAG, `start seek to:${time}, set seeking status=true`)

    /** seek process for vod:
     *  1. no buffer in seek position, waiting download, then ajust seek time by audioRender, message to videoRender
     *  2. switch buffer direct if there has buffer, then ajust seek time by audioRender, message to videoRender
     *  3. audioRender emit ready、videoRender emit ready
     *  4. timeline listener READY event , dispatch START_RENDER event
     */
    this._seeking = true
    this.videoRender.setSeekingStatus(true)
    if (this.noAudio) {
      this.emit(Events.TIMELINE.SYNC_DTS, this.videoRender.getDtsOfTime(time))
      this.videoRender.ajustSeekTime(time)
    } else {
      this._resetReadyStatus()
    }
    this.emit(Events.TIMELINE.DO_SEEK, time)
    // eslint-disable-next-line no-new
    new Promise(resolve => {
      this.emit(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.SEEKING)
      resolve()
    })
  }
}
