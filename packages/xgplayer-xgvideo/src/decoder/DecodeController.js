
import EventEmitter from 'eventemitter3'
import { getDecodeCapacaity } from '../config'
import { logger } from '../utils'

// 基类decoder, WasmDecoder、WebcodecDecoder继承此类
export default class DecodeController extends EventEmitter {
  /** @type {import('../render/VideoBaseRender').VideoBaseRender} */
  _parent = null

  // worker中解码器准备完成
  _decoderReady = false

  // worker正在解码
  _inDecoding = false

  _toDecodeFirstframe = true

  // 当前流的唯一解码标识
  _id = new Date().getMilliseconds()

  _workerErrorCallback = null

  _workerMessageCallback = null

  _decoderWorker = null

  get analyse () {
    return this._parent.analyse
  }

  get inDecoding () {
    return this._inDecoding
  }

  get decoderMode () {
    return this._decoderMode
  }

  get decoderReady () {
    return this._decoderReady
  }

  get needToDecode () {
    if (this._inDecoding) return 0
    return this._continueDecodeThreshold
  }

  get maxDecodeOnce () {
    return this._maxDecodeOnce
  }

  get meta () {
    return this._parent?._meta
  }

  // update metadata of frame current playing
  set meta (m) {
    if (this._parent) {
      this._parent._meta = m
    }
  }

  constructor (parent) {
    super()
    this._parent = parent
  }

  /**
   * 初始化解码用的worker
   * @param {function} messageCb 从worker接受的消息，回传给parent使用
   * @param {function} errCb worker error处理函数
   */
  init (messageCb, errCb) {
    this._workerMessageCallback = messageCb
    this._workerErrorCallback = errCb

    this._initWorker()
  }

  _initWorker () {
    throw new Error('need override by children')
  }

  checkToDecode (restFrame) {
    if (this.webcodec) {
      if (restFrame <= this.needToDecode) {
        this.doDecode()
      }
      return
    }

    if (!this._inDecoding && restFrame <= this.needToDecode) {
      this.doDecode()
    }
  }

  doDecode () {
    const frameList = this._getFramesToDecode()

    if (!frameList || !frameList.length || !this.meta) return

    if (this._toDecodeFirstframe) {
      this._toDecodeFirstframe = false
      this.analyse.addFirstFrameToDecode()
    }

    if (!this._avccpushed) {
      this._initDecoderWithConfiguration(this._decoderWorker, this.meta)
    }

    if (logger.enable) {
      logger.log(this.TAG, `doDecode ${frameList.length} frames`)
    }

    frameList.forEach((f) => {
      this._doDecodeInternal(f)
    })

    this._inDecoding = true
    this._decoderWorker.postMessage({
      msg: 'finish_flag'
    })
  }

  preciseSeek (time) {
    const preciseDts = time * 1000
    const frameList = this._parent?._timeRange?.getFramesForPreciseSeek(preciseDts)
    const nbFrame = frameList.length

    if (nbFrame < this.maxDecodeOnce) {
      this.doDecode()
      return
    }

    this._parent?._timeRange?.updateFrameIndexForPreciseSeek(nbFrame)

    if (logger.enable) {
      logger.log(this.TAG, `doDecode ${frameList.length} frames for precise seek`)
    }

    frameList.forEach((f, index) => {
      this._doDecodeInternal(f, true, index >= nbFrame - 6)
    })

    this._inDecoding = true
    this._decoderWorker.postMessage({
      msg: 'finish_flag'
    })
  }

  _getFramesToDecode () {
    const { _timeRange, _decodeEstimate } = this._parent

    if (!this._decoderReady || !_timeRange) return

    const rest = _timeRange.frameLength

    if (!rest) return

    let len = this._toDecodeFirstframe ? getDecodeCapacaity().maxDecodeOnceFirstTime : this.maxDecodeOnce

    if (rest === 1) {
      _decodeEstimate.resetDecodeDot(performance.now())
    }

    const frameList = []

    while (len > 0) {
      const sample = _timeRange && _timeRange.getFrame()
      if (!sample) break
      frameList.push(sample)
      if (sample.gopId && sample.gopId - 1 === 0) {
        _decodeEstimate.updateGopCount()
      }
      len--
    }
    return frameList
  }

  /**
   *
   * @param {object} sample 解码的采样数据
   * @param {boolean} preciseSeek 是否属于精准seek流程
   * @param {boolean} lastFrame 精准seek位置处的视频帧
   */
  _doDecodeInternal (sample, preciseSeek, output) {
    if (sample?.meta) {
      // metadata changed! decoder will flushed
      this.meta = sample.meta
      logger.warn(this.TAG, 'detect metadata! flush decoder')
      this._initDecoderWithConfiguration(this.__decoderWorker, sample.meta)
    }

    const info = {
      dts: sample.dts,
      pts: sample.pts || sample.dts + sample.cts,
      keyframe: sample.keyframe,
      gopId: sample.gopId,
      id: this._id
    }

    if (preciseSeek) {
      info.preciseSeek = true
      info.output = output
    }

    const frameData = sample.data.slice()

    this._decoderWorker.postMessage({
      msg: 'decode',
      data: frameData,
      info
    }, [frameData.buffer])
  }

  _initDecoderWithConfiguration () {
    throw new Error('need override by children')
  }

  flushDecoder () {
    this._decoderWorker.postMessage({
      msg: 'flush'
    })
  }

  destroy () {
    throw new Error('need override by children')
  }
}
