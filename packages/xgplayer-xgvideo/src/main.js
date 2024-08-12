/* eslint-disable no-unused-vars */
/* eslint-disable prefer-promise-reject-errors */
/* eslint-disable no-undef */
import NoSleep from './helper/nosleep'
import { playSlienceAudio, pauseSlienceAudio } from './helper/audio-helper'
import { logger, debounce } from './utils'
import {
  softDecodeSupported,
  setDecodeCapacity,
  getDecodeCapacaity,
  getDeviceCapacity,
  decodeCapacity
} from './config'
import {
  updateVV,
  persistenceDisabledStatus,
  getDisabledStatus,
  cleanDisabledStatus
} from './disabled'
import TimeLine from './TimeLine'
import Events, { VIDEO_EVENTS, VIDEO_EVENTS_ARR } from './events'
import Analyse from './analyse'
import decoderCache from './decoder/wasm/DecoderCache'

// for flv hw decode
const VIDEO_DECODE_MODE_VALUE = '7'

const SINGLE_TRACK_TYPE = {
  LOW_LATENCY: 1,
  NO_AUDIO: 2,
  NO_VIDEO: 3
}

const Parent = (function () {

  if (typeof HTMLElement !== 'undefined') return HTMLElement

  return function (){ }

})()

export default class XGVideo extends Parent {
  constructor () {
    super()
    this.TAG = 'XGVideo'
    this._proxyProps()
    this._isLive = true
    this._vMeta = null
    this._aMeta = null
    this._resizeObserver = null
    this._eventsBackup = []
    this._hevc = getDecodeCapacaity().preloadDecoder === 'h265'
    if (!this._hevc) {
      this._degradeVideo = document.createElement('video')
    }
    this._debounceSeek = debounce(this._seek.bind(this), 300)
    this._onTouchEnd = this._onTouchEnd.bind(this)
    this.analyse = new Analyse()
  }

  // proxy props used frequently
  _proxyProps () {
    Object.getOwnPropertyNames(XGVideo.prototype).forEach((prop) => {
      if (!/^__/.test(prop)) return
      const p = prop.replace('__', '')
      Object.defineProperty(this, p, {
        get: function () {
          try {
            return this[prop]
          } catch (e) {}
          return 0
        },
        set: function (v) {
          try {
            this[prop] = v
          } catch (e) {}
        }
      })
    })
  }

  static get version () {
    return __VERSION__
  }

  static init ({ h264Url, h264AsmUrl, h265AsmUrl, h265Url, h265ThreadUrl, h265SimdUrl }) {
    XGVideo.h264Url = h264Url
    XGVideo.h265Url = h265Url
    XGVideo.h265AsmUrl = h265AsmUrl
    XGVideo.h264AsmUrl = h264AsmUrl
    XGVideo.h265ThreadUrl = h265ThreadUrl
    XGVideo.h265SimdUrl = h265SimdUrl
  }

  static getDecodeCapacity () {
    return getDecodeCapacaity()
  }

  static getDeviceCapacity () {
    return getDeviceCapacity()
  }

  /**
   *
   * @param {decodeCapacity} capacity
   */
  static setDecodeCapacity (capacity) {
    setDecodeCapacity(capacity)
    if (capacity.preloadDecoder) {
      decoderCache.genDecoder().catch(() => {})
    }
  }

  /**
   * @param {'h264' | 'h265'} codecType 解码器类型
   */
  static genDecoder (codecType) {
    return decoderCache.genDecoder(codecType)
  }

  static decoderCache = decoderCache

  static cleanDisabled () {
    cleanDisabledStatus()
  }

  static isSupported () {
    if (!softDecodeSupported()) return false

    return getDisabledStatus() === false
  }

  addEventListener (eventName, handler, capture) {
    super.addEventListener(eventName, handler, capture)
    if (this._degradeVideo) {
      this._eventsBackup.push([eventName, handler, capture])
    }
  }

  removeEventListener (eventName, handler, capture) {
    super.removeEventListener(eventName, handler, capture)
    if (this._degradeVideo) {
      this._eventsBackup = this._eventsBackup.filter((x) => !(x.eventName === eventName && x.handler === handler && x.capture === capture))
    }
  }

  setAttribute (k, v) {
    super.setAttribute(k, v)
    if (k === 'src') return
    this._degradeVideo?.setAttribute(k, v)
  }

  _init () {
    this.analyse.reset()
    this.timeline = new TimeLine(
      {
        volume: this.volume,
        canvas: this.querySelector('canvas'),
        videoContext: this.videoContext,
        videoDecode: this.videoDecode,
        maxVideoHeight: this.getAttribute('maxVideoHeight'),
        endLevel: parseInt(this.getAttribute('endLevel'))
      },
      this
    )
    logger.log(this.TAG, 'timeline init')
    this._noSleep = new NoSleep()
    this._logFirstFrame = false
    this._playRequest = null
    this._degradeVideoUserGestured = false
    this._bindEvents()
    if (this._vMeta && !this.videoDecode) {
      this.setVideoMeta(this._vMeta)
    }
    if (this._glCtxOptions) {
      this.glCtxOptions = this._glCtxOptions
    }

    if (!this.timeline) return

    if (this.innerDegrade) {
      this.timeline.emit(Events.TIMELINE.INNER_DEGRADE)
    }
    this.timeline.emit(Events.TIMELINE.SET_PLAY_MODE, this._isLive ? 'LIVE' : 'VOD')
    this.timeline.emit(Events.TIMELINE.SET_PLAYBACKRATE, this.playbackRate)
    // eslint-disable-next-line no-self-assign
    this.muted = this.muted
  }

  _bindEvents () {
    this.timeline.on(Events.TIMELINE.PLAY_EVENT, (status, data) => {
      if (status === VIDEO_EVENTS.LOADEDDATA) {
        if (!this.querySelector('canvas')) {
          logger.log(this.TAG, '_bindEvents, appendChild canvas')
          this.appendChild(this.canvas)
        }
        this.canvas.style.display = 'block'
        this.timeline?.emit(Events.TIMELINE.SET_PLAYBACKRATE, this.playbackRate)
      }

      if (status === VIDEO_EVENTS.LOADEDMETADATA || status === VIDEO_EVENTS.RESIZE) {
        Promise.resolve().then(() => {
          this.updateVideoPostion()
        })
      }

      if (status === VIDEO_EVENTS.ERROR) {
        logger.warn(this.TAG, 'detect error:', data?.message)
        this.pause()
        // disabled when error
        this._disabled(true)

        // change error to lowdecode for innerDegrade and webcodec
        if (this.innerDegrade || this.decoderMode === 5) {
          this.degradeInfo = {
            decodeFps: this.decodeFps,
            bitrate: this.bitrate,
            wasmInitCost: this.wasmInitCost,
            fps: this.fps,
            url: this.src,
            msg: data?.message,
            decoderMode: this.decoderMode
          }
          this._innerDispatchEvent('lowdecode')
          return
        }

        this._err = data
      }

      if (status === VIDEO_EVENTS.LOW_DECODE) {
        this._disabled()
        this.degradeInfo = {
          decodeFps: this.decodeFps,
          bitrate: this.bitrate,
          wasmInitCost: this.wasmInitCost,
          fps: this.fps,
          url: this.src,
          decoderMode: this.decoderMode
        }
        this._innerDispatchEvent(VIDEO_EVENTS_ARR[status], this.degradeInfo)
        return
      }

      if (status === VIDEO_EVENTS.LARGE_AV_GAP) {
        this.unsyncInfo = data
      }

      if (status === VIDEO_EVENTS.ENDED) {
        if (this.paused) return
        this.pause()
      }

      if (status === VIDEO_EVENTS.PROGRESS) {
        this._noSleep.toPlay()
      }

      if (status === VIDEO_EVENTS.WAITING) {
        this.analyse.addWaiting()
      }

      if (status === VIDEO_EVENTS.SEEKING) {
        this.analyse.addSeeking()
      }

      if (status === VIDEO_EVENTS.SEEKED) {
        this.analyse.addSeeked()
      }

      this._innerDispatchEvent(VIDEO_EVENTS_ARR[status], data)
    })
  }

  // 监听到error事件或者lowdecode事件
  // error事件时force: true
  _disabled (force) {
    if (!this.innerDegrade && !force) {
      return
    }

    // disabled forever
    // 1. 发生了错误
    if (force) {
      if (getDecodeCapacaity().disabledWhenErrorOccur) {
        persistenceDisabledStatus(1)
      }
      return
    }

    // 根据vv降级评估在 disabled.js中
    if (getDecodeCapacaity().evaluateVVCount) return

    // 2.H264, 对2Mbps以下的流 解码效率不足帧率的60%
    if (this.decodeFps / this.fps <= 0.6 && this.bitrate < 2000000) {
      persistenceDisabledStatus(1)
      return
    }

    persistenceDisabledStatus(2)
  }

  /**
   *  @param {string} url
   */
  degrade (url) {
    const canvasAppended = !!this.querySelector('canvas')
    if (canvasAppended) {
      this.replaceChild(this._degradeVideo, this.canvas)
    } else {
      this.appendChild(this._degradeVideo)
    }

    // 销毁MVideo上的事件
    this._eventsBackup.forEach(([eName, eHandler, capture]) => {
      super.removeEventListener.call(this, eName, eHandler, capture)
      // bind events for degrade video
      this._degradeVideo?.addEventListener(eName, eHandler, capture)
    })

    this._eventsBackup = []

    this.destroy()


    if (url) {
      this._degradeVideo.muted = false
      this._degradeVideo.src = url
      this._degradeVideo.load()
    }
  }

  disconnectedCallback () {
    logger.log(this.TAG, 'video disconnected')
    document.removeEventListener('touchend', this._onTouchEnd, true)
    // true: 复用canvas
    this.destroy(true)
    if (this._resizeObserver) {
      this._resizeObserver.disconnect(this)
    }
  }

  connectedCallback () {
    logger.log(this.TAG, 'video connected to document', performance.now())
    if (!this.timeline) {
      this._init()
    }
    this.style.width = '100%'
    this.style.height = '100%'
    this.style.position = 'absolute'
    this.style.left = '0px'
    this.style.top = '0px'
    document.addEventListener('touchend', this._onTouchEnd, true)

    if (ResizeObserver) {
      this._resizeObserver = new ResizeObserver(entries => {
        if (!this.timeline?.ready) return
        this.updateVideoPostion()
      })
      this._resizeObserver.observe(this)
    }
  }

  _onTouchEnd () {
    playSlienceAudio()
    this._degradeVideoInteract()
    if (this._noSleep) {
      this._noSleep.enable()
    }
  }

  _degradeVideoInteract () {
    // Note
    if (this._degradeVideo && (this.innerDegrade === 1 || this.innerDegrade === 3)) {
      if (this._degradeVideoUserGestured) return
      const req = this._degradeVideo.play()
      req &&
        req
          .then(() => {
            this._degradeVideo.pause()
            this._degradeVideoUserGestured = true
          })
          .catch((e) => {
            console.log('degrade video: ', e.message)
          })
    }
  }

  play (forceDestroy) {
    if (!this.timeline) return

    logger.log(this.TAG, `play() called, ready:${this.timeline.ready}, paused:${this.timeline.paused}, force:${forceDestroy}`)

    this._degradeVideoInteract()

    let _waitingTimer = 0

    // live: reset timeline when replay
    // vod: play direct
    if ((this.timeline.ready && this.timeline.paused) || forceDestroy) {
      forceDestroy = forceDestroy || this._isLive
      this._playRequest = null
      if (forceDestroy) {
        this.destroy()
        this._init()
        _waitingTimer = setTimeout(() => {
          try { this._innerDispatchEvent('waiting') } catch (e) {}
        }, 300)
      } else {
        // vod play
        this.timeline.emit(Events.TIMELINE.DO_PLAY)
        this._innerDispatchEvent('play')
        return Promise.resolve()
      }
    }

    // donoting when playing
    if (!this._playRequest && this.timeline.ready && !this.timeline.paused) {
      return Promise.resolve()
    }

    logger.log(this.TAG, 'request play!')

    this._playRequest =
      this._playRequest ||
      new Promise((resolve, reject) => {
        this.timeline._paused = false
        this._innerDispatchEvent('play')
        this._noSleep.enable()
        this.timeline.once('ready', () => {
          logger.log(this.TAG, 'timeline emit ready')
          clearTimeout(_waitingTimer)
          this.timeline.play().then(resolve).catch(reject).finally(() => {
            this._playRequest = null
          })
        })
      })
    this.autoplay = true
    return this._playRequest
  }

  pause () {
    this._playRequest = null
    if (this.timeline) {
      this.timeline.pause()
    }
    try {
      this._noSleep.disable()
      pauseSlienceAudio()
    } catch (e) {}
  }

  load () {
  }
  /** *************** api  */

  appendBuffer (videoTrack, audioTrack) {
    if (!this.timeline || this._err) return
    if (!this._logFirstFrame) {
      const vSam0 = videoTrack && videoTrack.samples[0]
      const aSam0 = audioTrack && audioTrack.samples[0]

      if (!vSam0 && !aSam0) return

      if (vSam0 || aSam0) {
        const vDuration = (videoTrack?.duration) / (videoTrack?.formatTimescale || Infinity)
        const aDuration = audioTrack?.duration / (audioTrack?.formatTimescale || Infinity)
        logger.warn(this.TAG, `video firstDts:${vSam0 && vSam0.dts} , audio firstDts:${aSam0 && aSam0.dts} videoTrack.duration=${vDuration}, audioTrack.duration=${aDuration}`)
        this._logFirstFrame = true
        if (vDuration || aDuration) {
          this.setPlayMode('VOD')
          this.timeline.emit(Events.TIMELINE.SET_PLAY_MODE, this._isLive ? 'LIVE' : 'VOD')
          this.duration = Math.min(vDuration || aDuration, aDuration || vDuration)
        }
        this.analyse.addFirstData()
      }

      // single track
      if (this.lowlatency) {
        logger.warn(this.TAG, 'single track! type=', SINGLE_TRACK_TYPE.LOW_LATENCY)
        this.timeline.emit(Events.TIMELINE.SINGLE_TRACK, SINGLE_TRACK_TYPE.LOW_LATENCY)
      }

      if (!audioTrack.exist()) {
        logger.warn(this.TAG, 'single track! type=', SINGLE_TRACK_TYPE.NO_AUDIO)
        this.timeline.emit(Events.TIMELINE.SINGLE_TRACK, SINGLE_TRACK_TYPE.NO_AUDIO)
      }

      if (!videoTrack.exist()) {
        logger.warn(this.TAG, 'single track! type=', SINGLE_TRACK_TYPE.NO_VIDEO)
        this.timeline.emit(Events.TIMELINE.SINGLE_TRACK, SINGLE_TRACK_TYPE.NO_VIDEO)
      }
    }

    if (videoTrack.formatTimescale) {
      videoTrack.samples.forEach(x => {
        x.dts = Math.floor(x.dts / videoTrack.formatTimescale * 1000)
        x.pts = Math.floor(x.pts / videoTrack.formatTimescale * 1000)
      })
    }

    if (audioTrack.formatTimescale) {
      audioTrack.samples.forEach(x => {
        x.dts = Math.floor(x.dts / audioTrack.formatTimescale * 1000)
        x.pts = Math.floor(x.pts / audioTrack.formatTimescale * 1000)
      })
    }

    this.timeline.appendBuffer(videoTrack, audioTrack)
  }

  setAudioMeta (meta) {
    this._aMeta = meta
    this.timeline.emit(Events.TIMELINE.SET_METADATA, 'audio', meta)
  }

  setVideoMeta (meta) {
    if (!this._isLive && this._vMeta) return
    this.timeline.emit(Events.TIMELINE.SET_METADATA, 'video', meta)
    this._vMeta = meta
  }

  setDecodeMode (v) {
    this.setAttribute('decodeMode', v)
  }

  setPlayMode (v) {
    this._isLive = v === 'LIVE'
  }

  endOfStream () {
    if (!this.currentTime) return
    this.timeline?.emit(Events.TIMELINE.END_OF_STREAM)
  }

  updateVideoPostion () {
    this.timeline?.emit(Events.VIDEO.UPDATE_VIDEO_FILLTYPE, this.xgfillType, this.containerLayout)
  }

  /** *************** api end */

  _innerDispatchEvent (type, data) {
    this.dispatchEvent(new CustomEvent(type, { detail: data }))
  }

  destroy (disconnect) {
    if (!this.timeline) return
    this._noSleep.destroy()
    logger.log(this.TAG, 'call destroy')
    this.timeline.emit(Events.TIMELINE.DESTROY, disconnect)
    if (this.querySelector('video')) {
      this.removeChild(this.querySelector('video'))
    }
    this.timeline = null
    this._err = null
    this._noSleep = null
    this._eventsBackup = []
  }

  updateObjectPosition (left, top) {
    this.timeline.emit(Events.VIDEO.UPDATE_VIDEO_COVER_POSITION, this.containerLayout, left, top)
    if (this._degradeVideo) {
      this._degradeVideo.style.objectPosition = `${left * 100}% ${top * 100}%`
    }
  }

  setVideoDecode () {
    logger.log(this.TAG, 'set videoDecode', this.videoDecode)
    if (this.videoDecode && this.timeline && this.timeline.videoRender) {
      this.timeline.videoRender.videoDecode = this.videoDecode
    }
  }

  get live () {
    return this._isLive
  }

  get lowlatency () {
    return this.getAttribute('lowlatency') === 'true'
  }

  set lowlatency (val) {
    this.setAttribute('lowlatency', val)
  }

  get autoplay () {
    return this.getAttribute('autoplay') === 'true'
  }

  set autoplay (v) {
    this.setAttribute('autoplay', v)
  }

  get __canvas () {
    return this.timeline.canvas
  }

  get __ended () {
    return Math.abs(this.currentTime - this.duration) < 0.5
  }

  get __width () {
    return this.getAttribute('width') || this.videoWidth
  }

  set __width (val) {
    const pxVal = typeof val === 'number' ? `${val}px` : val
    this.setAttribute('width', pxVal)
    this.canvas.width = val
  }

  get __height () {
    return this.getAttribute('height')
  }

  set __height (val) {
    const pxVal = typeof val === 'number' ? `${val}px` : val
    this.setAttribute('height', pxVal)
    this.canvas.height = val
  }

  get __videoWidth () {
    return this.canvas.width
  }

  get __videoHeight () {
    return this.canvas.height
  }

  get __volume () {
    return Number(this.getAttribute('volume'))
  }

  set __volume (v) {
    if (v <= 0) {
      v = 0
    }
    if (v >= 1) {
      v = 1
    }
    this.setAttribute('volume', v)
    if (this.muted) return
    this.timeline.emit(Events.TIMELINE.UPDATE_VOLUME, v)
  }

  get __muted () {
    return this.getAttribute('muted') === 'true'
  }

  set __muted (v) {
    this.setAttribute('muted', v)
    this._degradeVideoInteract()
    this._noSleep.enable()
    this.timeline.emit(Events.TIMELINE.UPDATE_VOLUME, v ? 0 : this.volume)
  }

  get __currentTime () {
    if (!this.timeline) return 0
    const c = this.timeline.currentTime
    const d = this.timeline.duration
    return Math.min(c, d)
  }

  set __currentTime (v) {
    this._debounceSeek(v)
  }

  _seek (v) {
    if (!this.timeline) return
    if (!this.buffered.length) {
      this.play()
    }
    if (this.paused && !this._isLive && v === 0) {
      this.play()
    }
    this.timeline.seek(Number(v))
  }

  get __duration () {
    if (this._isLive) return Infinity
    return this.timeline.duration
  }

  set __duration (v) {
    this.timeline.emit(Events.TIMELINE.SET_VIDEO_DURATION, v)
    this._innerDispatchEvent('durationchange')
  }

  get __seeking () {
    return this.timeline.seeking
  }

  get __paused () {
    return this.timeline.paused
  }

  get __fps () {
    return this.timeline.fps
  }

  get __decodeFps () {
    return this.timeline.decodeFps
  }

  get __decodeCost () {
    return parseInt(this.timeline.decodeCost)
  }

  get __renderCost () {
    return this.timeline.renderCost
  }

  get __wasmInitCost () {
    return this.timeline.wasmInitCost
  }

  get __totalSize () {
    return this.timeline.totalSize
  }

  get __bitrate () {
    return this.timeline.bitrate
  }

  get __gopLength () {
    return this.timeline.gopLength
  }

  get __readyState () {
    return this.timeline.readyState
  }

  get __buffered () {
    return this.timeline.buffered
  }

  get __decoderMode () {
    return this.timeline.decoderMode
  }

  get src () {
    return this.getAttribute('src') || ''
  }

  get currentSrc () {
    return this.getAttribute('src') || ''
  }

  set src (val) {
    logger.log(this.TAG, 'set src ', val)
    this.setAttribute('src', val)
    this._vMeta = null
    this.play(true)
    if (!this.timeline) {
      this._init()
    }
    this._innerDispatchEvent('loadstart')
    updateVV()
  }

  set playbackRate (v) {
    this.setAttribute('playbackrate', v)
    this.timeline?.emit(Events.TIMELINE.SET_PLAYBACKRATE, v)
  }

  get playbackRate () {
    return parseFloat(this.getAttribute('playbackrate') || 1)
  }

  get networkState () {
    return 1
  }

  get preloadTime () {
    const attrPreloadTime = this.getAttribute('preloadtime')
    if (attrPreloadTime) {
      const preloadTime = Number.parseFloat(attrPreloadTime)
      if (preloadTime > 0 && !Number.isNaN(preloadTime)) {
        return preloadTime
      }
    }
    return Infinity
  }

  set preloadTime (val) {
    if (val && Number(val) > 0) {
      this.setAttribute('preloadtime', val)
    }
  }

  get innerDegrade () {
    const v = this.getAttribute('innerdegrade')
    return parseInt(v)
  }

  set __glCtxOptions (v) {
    this._glCtxOptions = v
    this.timeline.emit(Events.TIMELINE.UPDATE_GL_OPTIONS, v)
  }

  get __error () {
    return this._err
  }

  set __error (v) {
    this.timeline.emit(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.ERROR, v)
  }

  get degradeVideo () {
    return this._degradeVideo
  }

  set degradeInfo (v) {
    this._deradeInfo = v
  }

  get degradeInfo () {
    return this._deradeInfo
  }

  set unsyncInfo (v) {
    this._unsyncInfo = v
  }

  get unsyncInfo () {
    return this._unsyncInfo
  }

  get xgfillType () {
    return this.parentNode.getAttribute('data-xgfill')
  }

  get containerLayout () {
    const p = this.parentNode
    return {
      width: p.clientWidth,
      height: p.clientHeight
    }
  }

  get videoDecode () {
    return this.getAttribute('decodeMode') === VIDEO_DECODE_MODE_VALUE
  }

  get audioMedia () {
    return this.timeline?.audioRender?.media
  }

  getStats () {
    return this.analyse.getStats(this)
  }

  getSeekElapses () {
    return this.analyse.seekElapses()
  }

  dump () {
    const buffered = this.buffered
    console.log(buffered)
    return new Array(buffered.length).fill(0).map((_, index) => [buffered.start(index), buffered.end(index)])
  }
}
