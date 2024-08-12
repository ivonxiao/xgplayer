/* eslint-disable no-undef */
import { logger, getAvcc } from '../utils'
import BaseRender from './BaseRender'
import VideoTimeRange from './VideoTimeRange'
import FrameQueue, { checkClose } from './FrameQueue'
import frameRenderCache from './FrameRender'
import DecodeEstimate from './DecodeEstimate'
import TickTimer from './TickTimer'
import Events, { VIDEO_EVENTS } from '../events'

const HAVE_NOTHING = 0
const HAVE_METADATA = 1
const HAVE_CURRENT_DATA = 2
const HAVE_FUTURE_DATA = 3
const HAVE_ENOUGH_DATA = 4

const MEDIA_ERR_DECODE = 3

export default class VideoBaseRender extends BaseRender {
  constructor (config, parent) {
    super(config, parent)
    this._timeRange = new VideoTimeRange(this)
    this._decodeEstimate = new DecodeEstimate(this)
    this._frameQueue = new FrameQueue(this) // the queue of uncompressed frame
    this._lastTimeupdate = 0
    this._renderCost = 0
    this._canAutoPlay = true
    this._videoDecode = false
    this._inSeeking = false
    this._frameRender = null
    this._configuration = null
    this._render = this._render.bind(this)
    this._tickTimer = new TickTimer(this._render)
    this._initCanvas(config)
    this._bindEvents()
  }

  get canAutoPlay () {
    return this._canAutoPlay
  }

  get canvas () {
    return this._canvas
  }

  get timescale () {
    return 1000
  }

  get fps () {
    return this._decodeEstimate.fps || (this._meta && this._meta.fpsNum / this._meta.fpsDen) || 24
  }

  get decodeFps () {
    return this._decodeEstimate.decodeFps
  }

  get decodeCost () {
    return this._decodeEstimate.decodeCost
  }

  get renderCost () {
    return this._renderCost
  }

  get totalSize () {
    return this._timeRange.totalSize
  }

  get bitrate () {
    return this._timeRange.bitrate
  }

  set bitrate (v) {
    this._timeRange.bitrate = v
  }

  get gopLength () {
    return this._decodeEstimate.gopLength
  }

  get is540p () {
    return this._canvas.height < 720
  }

  get buffered () {
    return this._timeRange.buffered
  }

  get inSeeking () {
    return this._inSeeking
  }

  get interval () {
    return Math.floor(1000 / this.fps / this.playbackRate)
  }

  get playbackRate () {
    return this._playbackRate || 1
  }

  // video first frame dts
  get baseDts () {
    return this._timeRange.baseDts
  }

  // noAudio时使用
  get currentTime () {
    return this._timeRange.getCurrentTime(this.preciseVideoDts)
  }

  get timelinePosition () {
    return this._parent.timelinePosition
  }

  set lastTimelinePosition (ts) {
    this._lastTimelinePosition = ts
  }

  // the startTime on timeline of the buffer audioCtx current playing
  // noAudio: the time record by perforamce.now() when play start or restart after waiting or stream changed
  get lastTimelinePosition () {
    return this._lastTimelinePosition || 0
  }

  set audioSyncDts (dts) {
    this._audioDts = dts
  }

  // the first sample's dts of the buffer audioCtx current playing
  get audioSyncDts () {
    return this._audioDts || this.baseDts
  }

  // the precise video dts sync to timeline time
  get preciseVideoDts () {
    return this.audioSyncDts + Math.floor((this.timelinePosition - this.lastTimelinePosition) * 1000)
  }

  get readyState () {
    const len = this._frameQueue.length || (this.currentTime ? 1 : 0)
    if (!len) return HAVE_NOTHING
    if (len >= 8) return HAVE_ENOUGH_DATA
    if (len >= 4) return HAVE_FUTURE_DATA
    if (len >= 2) return HAVE_CURRENT_DATA
    return HAVE_METADATA
  }

  get isHevc () {
    return !!((this._meta || {}).codec === 'hev1.1.6.L93.B0')
  }

  // 区分软硬解
  get videoDecode () {
    return this._videoDecode
  }

  get decoderMode () {
    return this._decodeController?.decoderMode
  }

  // AvcDecoderConfigurationRecord
  get configuration () {
    if (this._configuration) return this._configuration
    this._configuration = this._meta.configuration || getAvcc(this._meta?.sps[0], this._meta?.pps[0])
    return this._configuration
  }

  set configuration (meta) {
    this._configuration = meta.configuration || getAvcc(meta.sps[0], meta.pps[0])
  }

  /** ************ video render 独有的需要在 timeline调用的方法 *************************/

  setSeekingStatus (v) {
    this._inSeeking = v
  }

  getDtsOfTime (time) {
    return this._timeRange.getDtsOfTime(time)
  }

  updateReady () {
    this._whenReady()
  }

  forceRender () {
    this._render(true)
  }

  // 根据time寻找最近的关键帧
  getSeekStartPosition (time, preloadTime) {
    return this._timeRange.getSeekStartPosition(time, preloadTime)
  }

  canSeek () {
    throw new Error('need override by children')
  }

  emitResizeEvent () {
    this?._emitTimelineEvents(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.RESIZE)
  }
  /** ************ video render 独有的需要 timeline调用的方法 end *************************/

  _assembleErr (msg, subCode) {
    const err = new Error(msg)
    err.code = MEDIA_ERR_DECODE
    err.subCode = subCode
    return err
  }

  _emitTimelineEvents (e, v, d) {
    this._parent?.emit(e, v, d)
  }

  _initCanvas (config) {
    if (config.canvas) {
      // 已有canvas子类元素
      this._canvas = config.canvas
    } else {
      this._canvas = frameRenderCache.getCachedCvs() || document.createElement('canvas')
    }
    this._canvas.style.margin = 'auto'
    this._canvas.style.position = 'absolute'
    this._canvas.style.pointerEvents = 'none'
  }

  _bindEvents () {
    super._bindEvents()

    const ajustCanvasPostion = ({ width, height }, left = 0, top = 0) => {
      const { width: cvsWidth, height: cvsHeight } = this._canvas
      const scaleCvsWidth = height * cvsWidth / cvsHeight
      const scaleCvsHeight = width * cvsHeight / cvsWidth
      const deltaX = width - scaleCvsWidth
      const deltaY = height - scaleCvsHeight
      const pX = deltaX * left + 'px'
      const pY = deltaY * top + 'px'
      this._canvas.style.left = pX
      this._canvas.style.top = pY
      logger.warn(this.TAG, `cvsWidth=${cvsWidth}, cvsHeight=${cvsHeight}, scaleCvsWidth=${scaleCvsWidth}, scaleCvsHeight=${scaleCvsHeight}`)
      logger.warn(this.TAG, `cover position: deltaX=${deltaX}, deltaY=${deltaY}, width=${width}, height=${height}, pX=${pX}, pY=${pY}`)
    }

    this._parent.on(Events.VIDEO.UPDATE_VIDEO_FILLTYPE, (type, { width, height }) => {
      const { width: cvsWidth, height: cvsHeight } = this._canvas
      const isGapX = !width || width / height > cvsWidth / cvsHeight // 左右有黑边
      logger.warn(this.TAG, 'UPDATE_VIDEO_FILLTYPE isGapX =', isGapX, 'type =', type, cvsWidth, cvsHeight, width, height)

      this._canvas.style.maxWidth = 'initial'
      this._canvas.style.maxHeight = 'initial'

      if (type === 'cover') {
        // align with width
        if (isGapX) {
          this._canvas.style.left = 0
          this._canvas.style.top = 0
          this._canvas.style.height = 'auto'
          this._canvas.style.width = '100%'
          ajustCanvasPostion({ width, height }, 0, 0.5)
          return
        }
        // align with height
        this._canvas.style.left = 0
        this._canvas.style.top = 0
        this._canvas.style.width = 'auto'
        this._canvas.style.height = '100%'
        ajustCanvasPostion({ width, height }, 0.5, 0)
        return
      }

      if (type === 'fill') {
        this._canvas.style.width = '100%'
        this._canvas.style.height = '100%'
        return
      }

      this._canvas.style.top = 0
      this._canvas.style.bottom = 0
      this._canvas.style.left = 0
      this._canvas.style.right = 0
      this._canvas.style.maxWidth = '100%'
      this._canvas.style.maxHeight = '100%'
      this._canvas.style.width = 'initial'
      this._canvas.style.height = 'initial'

      if (cvsWidth < width && cvsHeight < height) {
        const percent = cvsWidth / width > cvsHeight / height
        if (percent) {
          this._canvas.style.width = '100%'
        } else {
          this._canvas.style.height = '100%'
        }
      }
    })

    // 容器宽高比 > 视频宽高比， 应该左右移动
    // 容器宽高比 < 视宽高比，应该上下移动
    this._parent.on(Events.VIDEO.UPDATE_VIDEO_COVER_POSITION, ajustCanvasPostion)

    // 同步时机
    // 1. 音频一小段buffer起播时
    // 2. 对noAudio的场景 1. 视频变流时,dts发生变化 2. 卡顿waiting后,_parent.timelinePosition已不准确
    this._parent.on(Events.TIMELINE.SYNC_DTS, (dts) => {
      const nextFrame = this._frameQueue.nextFrame()
      const nextFrameDts = nextFrame && nextFrame.info && nextFrame.info.dts
      this.lastTimelinePosition = this.timelinePosition

      if (this.noAudio) {
        const nextRawFrame = this._timeRange.nextFrame()
        dts = dts || nextFrameDts || (nextRawFrame && nextRawFrame.dts) || 0
      }

      this.audioSyncDts = dts

      // 下一帧视频和音频时间差距较大,对外通知
      if (nextFrameDts && nextFrameDts - dts > 500) {
        this._emitTimelineEvents(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.LARGE_AV_GAP, {
          aDts: dts,
          vDts: nextFrameDts,
          frameLength: this._frameQueue.length,
          currentTime: this._parent.currentTime,
          duration: this._parent.duration
        })
      }

      logger.log(
        this.TAG,
        'audio current buffer play finish, next buffer dts=',
        dts,
        'currentTime:',
        this._parent.currentTime,
        'preciseVideoDts:',
        this.preciseVideoDts,
        'next video frame dts:',
        nextFrameDts,
        'frame length:',
        this._frameQueue.length
      )

      // 点播考虑当前分片音频播放完成，视频解码太慢,要自动切到新buffer
      if (!this._isLive && !this._parent?.seeking) {
        const nextDecodeFrame = this._timeRange.nextFrame()
        if (nextDecodeFrame) {
          const position = (nextDecodeFrame.dts - nextDecodeFrame.baseDts) / 1000
          if (this._parent.currentTime - position > 1) {
            // 音频播完了,视频还有> 1s没解码的话,直接切到新分片
            logger.warn(this.TAG, '丢帧!')
            this.ajustSeekTime(this._parent.currentTime)
          }
        }
      }
    })

    this._parent.on(Events.TIMELINE.UPDATE_GL_OPTIONS, (v) => {
      this._config.glCtxOptions = v
    })

    this._parent.on(Events.TIMELINE.UPDATE_SEGMENT_END, this._updateSegmentEnd.bind(this))

    this.on(Events.VIDEO.AUTO_RUN, this._startRender.bind(this))

    this._parent.on(Events.TIMELINE.SET_PLAYBACKRATE, v => {
      this._playbackRate = v
      // 调整渲染频率
      this._startRender()
    })
  }

  ajustSeekTime () {
    throw new Error('need override by children')
  }

  /** ************ 主流程 *************************/

  _resetDts (dts, type) {
    if (type === 'audio') return
    this._timeRange.resetDts(dts)
  }

  // 接受 metadata,初始化解码器controller
  _setMetadata (type, meta) {
    if (type === 'audio') return
    logger.warn(this.TAG, 'video set metadata')
    this._meta = meta
    const fps = meta && meta.frameRate && meta.frameRate.fps
    if (fps) {
      logger.log(this.TAG, 'detect fps:', fps)
    } else {
      logger.warn(this.TAG, 'no detect fps,start estimate')
    }

    // override
    this._initDecoder()
  }

  _initDecoder () {
    throw new Error('need override by children')
  }

  _whenDecoderReady () {
    throw new Error('need override by children')
  }

  // 接受音视频数据
  _appendChunk () {
    throw new Error('need override by children')
  }

  _startDecode () {
    throw new Error('need override by children')
  }

  _receiveFrame (frame, callback) {
    if (!this._parent || !this._timeRange) {
      return
    }
    const info = frame.info || {}
    this._decodeEstimate.addDecodeInfo(info)

    if (!this._isLive) {
      /**
       * output: 精准seek完成
       */
      if (info.output || info.keyframe) {
        this.setSeekingStatus(false)
        logger.warn(this.TAG, 'set seeking status=', false)
      }

      if (this.inSeeking) {
        logger.log(this.TAG, 'drop frame')
        checkClose(frame)
        return
      }
    }

    if (this._isLive) {
      this._frameQueue.append(frame)
    } else {
      this._frameQueue.appendVodFrame(frame)
    }

    // override
    callback && callback()

    if (!this._ready) {
      if (this.readyState >= HAVE_METADATA) {
        this._whenReady()
      }
    }
  }

  _startRender () {
    logger.log(this.TAG, 'start render')
    this._tickTimer.start(this.interval)
  }

  _render () {
    throw new Error('need override by children')
  }

  _updateSegmentEnd () {
    throw new Error('need override by children')
  }
  /** ************ 主流程 end *************************/

  /** ************** 播放行为 ***********************/
  _whenReady () {
    this._ready = true
    this.emit(Events.VIDEO.VIDEO_READY)

    if (this.noAudio) {
      this._emitTimelineEvents(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.PLAYING)
    }
  }

  _doPlay () {
    this._tickTimer.start()
  }

  _doPause () {
    this._tickTimer.stop()
  }

  // 清空解码帧,尝试解码seek位置buffer
  _doSeek () {
    this._ready = false
    this._frameQueue.destroy()
  }

  _doChaseFrame () {
    throw new Error('need override by children')
  }

  /** ************** 播放行为 end ***********************/

  destroy (disconnect) {
    this._tickTimer?.destroy()
    this._timeRange?.destroy()
    this._frameQueue?.destroy()
    this._frameRender?.destroy(disconnect)
    this._tickTimer = null
    this._canvas = null
    this._timeRange = null
    this._frameQueue = null
    this._frameRender = null
    this._decodeEstimate = null
    this._parent = null
    this.removeAllListeners()
  }
}
