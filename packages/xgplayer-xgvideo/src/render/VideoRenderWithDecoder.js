/* eslint-disable no-undef */
import { logger } from '../utils'
import VideoBaseRender from './VideoBaseRender'
import WebCodecDecodeController from '../decoder/webcodec/WebCodecController'
import WasmDecodeController from '../decoder/wasm/WasmController'
import { FrameRender } from './FrameRender'
import Events, { VIDEO_EVENTS } from '../events'

const DECODER_ERROR_SUBCODE = 1
const WEBGL_ERROR_SUBCODE = 2

export default class VideoRenderWithDecoder extends VideoBaseRender {
  TAG = 'VideoRenderWithDecoder'

  _hideRenderFlag = 0

  _recentMeta = null

  _inChaseFrame = false

  get wasmInitCost () {
    return this._decodeController?.wasmInitCost
  }

  get hevcThread () {
    return this.decodeMode === 1
  }

  get lowlatency () {
    return this._parent.lowlatency
  }

  get nextFrameTime () {
    const nextFrame = this._frameQueue.nextFrame()
    return ((nextFrame && nextFrame.info && nextFrame.info.dts) || 0) / 1000
  }

  /** ************ video render 独有的需要在 timeline调用的方法 *************************/

  // 点播seek切换gop
  ajustSeekTime (time, preciseSeek) {
    logger.log(this.TAG, 'ajust seek time: ', time)
    this._frameQueue.empty()
    this._decodeController?.flushDecoder()
    this._switchVideoBuffer(time, preciseSeek)
  }

  canSeek () {
    return true
  }

  /** ************ video render 独有的需要 timeline调用的方法 end *************************/

  /** ************ 主流程 *************************/
  _appendChunk (videoTrack) {
    if (this.noVideo || !this._timeRange) return

    if (!this._meta) {
      this._emitTimelineEvents(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.LOADEDMETADATA)

      this._recentMeta = this._meta = Object.assign({}, videoTrack, { samples: null })
      logger.warn(this.TAG, 'video set metadata', this._meta, 'configuration:', this.configuration)
      const fps = videoTrack.fpsNum / videoTrack.fpsDen
      if (fps) {
        logger.log(this.TAG, 'detect fps:', fps)
      } else {
        logger.warn(this.TAG, 'no detect fps,start estimate')
      }
      this._selectDecoder()
      this._initDecoder()
    } else if (
      this._recentMeta.width !== videoTrack.width ||
      this._recentMeta.height !== videoTrack.height
    ) {
      // metadata changed
      // 给metadata变化的第一帧数据绑定新metadata数据, 解码到这一帧时先更新解码器
      logger.warn(this.TAG, `metadata changed! width: ${this._recentMeta.width} -> ${videoTrack.width}, height: ${this._recentMeta.height} -> ${videoTrack.height}`)
      const samp0 = videoTrack.samples[0]
      if (samp0) {
        this._recentMeta = samp0.meta = Object.assign({}, videoTrack, { samples: null })
      }
    }

    this._timeRange.append(videoTrack.samples, this._isLive && this.noAudio, !this.videoDecode)

    videoTrack.samples = []

    if (this.inSeeking) return

    if (!this.isLive && !this._timeRange.frameLength) {
      this._switchVideoBuffer(this._parent.currentTime)
    }

    if (!this._ready && this._decodeController?.decoderReady) {
      if (this.noAudio || !this._decodeController?.inDecoding) {
        this._startDecode()
      }
    }

    if (this.noAudio) {
      this._emitTimelineEvents(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.DURATION_CHANGE)
    }
  }

  // select wasm or webcodec
  _selectDecoder () {
    if (!this.isHevc && WebCodecDecodeController.isSupported()) {
      this._decodeController = new WebCodecDecodeController(this)
      this._decodeEstimate.webcodec = true
      return
    }

    this._decodeController = new WasmDecodeController(this)
  }

  _initDecoder () {
    this._decodeController?.init(this._decoderMessageCallback, this._decoderErrorCallback)
  }

  _decoderErrorCallback = (msg) => {
    this._emitTimelineEvents(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.ERROR, this._assembleErr(msg, DECODER_ERROR_SUBCODE))
  }

  _decoderMessageCallback = ({ type, data }) => {
    switch (type) {
      case 'DECODER_READY':
        this.analyse.addWasmReady()
        if (!this._frameRender) {
          const config = Object.assign(this._config, {
            meta: this._meta,
            canvas: this._canvas,
            type: this._decodeController.webcodec ? '2d' : ''
          })
          try {
            if (this._canvas.glInstance) {
              this._frameRender = this._canvas.glInstance
              this._frameRender.updateBind(this, this._meta)
              logger.warn(this.TAG, 'reuse canvas and context')
            } else {
              this._frameRender = new FrameRender(config, this)
              logger.log(this.TAG, 'create frameRender with config', config)
            }
          } catch (e) {
            this._emitTimelineEvents(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.ERROR, this._assembleErr(e && e.message, WEBGL_ERROR_SUBCODE))
          }
        }
        this._startDecode()
        break
      case 'RECEIVE_FRAME':
        if (this._inChaseFrame && !this._decodeController?.webcodec) return
        this._receiveFrame(data)
        break
      case 'BATCH_FINISH':
        this?._decodeEstimate.resetDecodeDot()
        if (this._inChaseFrame) {
          this._inChaseFrame = false
          this._frameQueue.empty()
        }
        if (!this._ready && !this.inSeeking && this._decodeController?.decoderReady) {
          this._startDecode()
        }
        break
      default:
    }
  }

  // 1. decoder初始化预解码几帧
  // 2. render 过程,帧数过少时解码新帧
  _startDecode () {
    this._decodeController?.doDecode()
  }

  _switchVideoBuffer (time, preciseSeek) {
    const buffer = this._timeRange.switchBuffer(time)

    if (buffer) {
      if (this.noAudio) {
        // 更新currentTime
        this._parent.emit(Events.TIMELINE.SYNC_DTS, this.getDtsOfTime(buffer.start))
      }
      if (preciseSeek) {
        this._decodeController?.preciseSeek(time)
        return
      }
      this._startDecode(preciseSeek)
    }
  }

  _checkToDecode () {
    if (this.inSeeking) return
    this._decodeController?.checkToDecode(this._frameQueue.length)
  }

  _render (force) {
    if (this.noVideo) return

    const frame = this._frameQueue && this._frameQueue.nextFrame()
    if (!frame) {
      logger.log(this.TAG, 'lack frame, ', 'inDecoding:', this._decodeController?.inDecoding)
      this._checkToDecode()

      if (this.noAudio) {
        // ended
        if (!this.isLive && Math.abs(this.currentTime - this.duration) < 0.5) {
          this?._emitTimelineEvents(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.TIMEUPDATE)
          this?._emitTimelineEvents(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.ENDED)
          this._timeRange?.clean()
          return
        }

        // waiting
        if (!this._timeRange.frameLength) {
          this._ready = false
          this.emit(Events.VIDEO.VIDEO_WAITING)
        }
      }

      return
    }

    const { info } = frame

    if (!info) {
      this._frameQueue.shift()
      console.error('not info')
      return
    }

    this._renderDts = info.dts
    const _renderDelay = info.dts - this.preciseVideoDts

    if (!force && _renderDelay > 0 && _renderDelay < 60000) {
      // 60s
      return
    }

    this._frameQueue.shift(this.preciseVideoDts)

    if (Math.abs(this._lastTimeupdate - info.dts) > 250) {
      this._emitTimelineEvents(Events.TIMELINE.PLAY_EVENT, VIDEO_EVENTS.TIMEUPDATE, { pts: info.originPts / 90 })
      this._lastTimeupdate = info.dts
    }

    if (logger.long) {
      logger.log(
        this.TAG,
        `render delay:${_renderDelay} , timelinePosition:${this.preciseVideoDts} , dts:${info.dts} , cost:${info.cost} , gopID:${info.gopId} , rest:${this._frameQueue.length}, buffer frame:${this._timeRange.frameLength}`
      )
    }
    const ts = performance.now()

    this._hideRenderFlag++

    if (document.visibilityState === 'visible') {
      this._frameRender.render(frame.buffer, frame.width, frame.height, frame.yLinesize, frame.uvLinesize)
    } else if (this._hideRenderFlag % 15) {
      // 切后台 每15帧渲染一次
      this._frameRender.render(frame.buffer, frame.width, frame.height, frame.yLinesize, frame.uvLinesize)
    }

    if (this._decodeController?.webcodec) {
      frame.buffer.close()
    }

    this._renderCost = performance.now() - ts
    this._checkToDecode()
  }

  _updateSegmentEnd (end) {
    this._timeRange?.updateSegmentEnd(end)
  }

  /** ************ 主流程 end *************************/

  // 直播追帧
  _doChaseFrame ({ frame }) {
    this._inChaseFrame = true
    this._timeRange.deletePassed(frame.dts)
    this._frameQueue.empty()
    if (this.noAudio) {
      // 更新currentTime
      this._parent.emit(Events.TIMELINE.SYNC_DTS, frame.dts)
    }
  }

  _destroy (disconnect) {
    logger.log(this.TAG, 'destroy video render')
    super.destroy(disconnect)
    this._decodeController?.destroy()
    this._decodeController = null
  }
}
