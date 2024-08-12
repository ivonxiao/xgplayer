
import DecodeController from '../DecodeController'
import WebCodecWorker from './webcodec-worker.js?worker&inline'
import { logger } from '../../utils'
import { getDecodeCapacaity } from '../../config'

const MAX_DECODE_ONCE_DEFAULT = getDecodeCapacaity().maxDecodeOnceWebcodec

export default class WebCodecDecodeController extends DecodeController {
  TAG = 'WebCodecController'

  _decoderMode = 5

  _maxDecodeOnce = MAX_DECODE_ONCE_DEFAULT

  _continueDecodeThreshold = MAX_DECODE_ONCE_DEFAULT / 2

  _avccpushed = false // metadata信息刷新解码器

  static isSupported () {
    return getDecodeCapacaity().h264WithWebcodec && !!window.VideoDecoder && WebCodecDecodeController.canUse !== false
  }

  get webcodec () {
    return true
  }

  // 部分流下判断单次批量解码是否完成不准确(decoder.decodeQueueSize 还有几帧但是无解码帧输出),
  // 需要判断这种情况继续给decoder帧数据进行解码
  get needToDecode () {
    if (this._inDecoding) {
      this._checkToDecode()
      return 0
    }
    return this._continueDecodeThreshold
  }

  _initWorker () {
    logger.log(this.TAG, 'start init webcodec worker')

    const decoder = new WebCodecWorker()

    decoder.onMessage = (e) => {
      switch (e.data.type) {
        case 'DECODER_READY':
          logger.log(this.TAG, 'webcodec worker ready ')
          this._decoderReady = true
          this._workerMessageCallback({
            type: 'DECODER_READY'
          })
          break
        case 'DECODED':
          this._inDecoding = true
          if (e.data?.info?.id !== this._id) return

          this._workerMessageCallback({
            type: 'RECEIVE_FRAME',
            data: e.data
          })
          break
        case 'BATCH_FINISH_FLAG':
          this._inDecoding = false
          if (!this._workerMessageCallback) return
          this._workerMessageCallback({
            type: 'BATCH_FINISH'
          })
          break
        case 'CHECK_TO_DECODE':
          this._inDecoding = e.data.data
          break
        case 'FAILED':
          this._whenError(e.data.message)
          break
      }
    }

    decoder.onError = (e) => {
      try {
        const v = this._parent?._parent?._parent
        // canvas context 需要从 2d 切换到 webgl,这里提前清除下canvas
        if (v) {
          v.removeChild(v.querySelector('canvas'))
        }
      } catch(e) {}
      this._whenError(e.message)
    }

    decoder.addEventListener('message', decoder.onMessage)

    decoder.addEventListener('error', decoder.onError)

    this._decoderWorker = decoder

    this._initDecoderWithConfiguration(decoder, this._parent.configuration)
  }

  _whenError (message) {
    WebCodecDecodeController.canUse = false
    this._workerErrorCallback(message)
  }

  _initDecoderWithConfiguration (decoder, configuration) {
    decoder.postMessage({
      msg: 'configuration',
      data: {
        codec: this._parent._meta.codec,
        codedHeight: this._parent._meta.height,
        codedWidth: this._parent._meta.width,
        description: configuration
      }
    })
    this._avccpushed = true
  }

  _checkToDecode () {
    this._decoderWorker.postMessage({
      msg: 'checkDecode'
    })
  }

  destroy () {
    let worker = this._decoderWorker
    worker.removeEventListener('message', worker.onMessage)
    worker.removeEventListener('error', worker.onError)
    worker.postMessage({ msg: 'destroy' })
    worker.terminate()
    this._decoderWorker = null
  }
}
