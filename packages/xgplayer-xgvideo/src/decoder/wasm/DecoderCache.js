import HevcWorker from './hevc-worker.js?worker&inline'
import HevcThreadWorker from './hevc-worker-thread.js?worker&inline'
import AvcWorker from './worker.js?worker&inline'
import { getDecodeCapacaity, getDecoderUrls, threadSupported, simdSupported } from '../../config'

import { promiseDelayed, logger } from '../../utils'

class DecoderCache {
  /**
   * decoder实例属性
   * decoder.id
   * decoder.using
   * decoder.ready
   * decoder.isHevc
   */
  _queue = []

  _pendingDecoder = null

  TAG = 'DecoderCache'

  genDecoder (codecType) {
    return this._initDecoder(codecType)
  }

  _initDecoder (codecType) {
    const { preloadDecoder, maxDecodeOnceWasm } = getDecodeCapacaity()
    codecType = codecType || preloadDecoder
    const {
      H264_DECODER_URL,
      H265_SIMD_DECODER_URL,
      H265_DECODER_URL,
      H265_THREAD_DECODER_URL
    } = getDecoderUrls()

    let decoder
    let url
    let mode = 1

    if (codecType === 'h265') {
      if (simdSupported()) {
        decoder = new HevcWorker()
        url = H265_SIMD_DECODER_URL
        mode = 2
      } else if (threadSupported() && getDecodeCapacaity().canUseThreadMode) {
        decoder = new HevcThreadWorker()
        url = H265_THREAD_DECODER_URL
        mode = 1
      } else {
        decoder = new HevcWorker()
        url = H265_DECODER_URL
        mode = 3
      }
    }

    if (codecType === 'h264') {
      decoder = new AvcWorker()
      url = H264_DECODER_URL
      mode = 3
    }

    if (!decoder) return Promise.resolve()

    let p = promiseDelayed()

    decoder.postMessage({
      msg: 'preload',
      batchDecodeCount: maxDecodeOnceWasm,
      url
    })

    this._pendingDecoder = decoder
    // 初始属性
    decoder.id = Date.now() + parseInt(Math.random() * 1000)
    decoder.isHevc = codecType === 'h265'
    decoder.using = false
    decoder.ready = false

    logger.log(this.TAG, 'start init decoder worker, id=', decoder.id, 'hevc=', decoder.isHevc, 'mode=', mode)

    const onSuccess = (e) => {
      this._pendingDecoder = null
      const { msg } = e.data

      if (msg === 'DECODER_READY' || msg === 'INIT_FAILED') {
        decoder.removeEventListener('message', onSuccess)
        decoder.removeEventListener('error', onError)
      }

      switch (msg) {
        case 'DECODER_READY':
          logger.log(this.TAG, 'decoder worker inited!, id=', decoder.id, 'cost:', e.data.cost)
          decoder.ready = true
          // ready之前可能有xgvideo实例使用了此解码器
          if (!decoder.using) {
            this._queue.push(decoder)
          }
          p.resolve()
          break
        case 'INIT_FAILED':
          logger.log(this.TAG, 'decoder worker init failed!', e.data.log)
          p.reject(e.data.log)
          break
      }
    }

    const onError = (e) => {
      decoder.removeEventListener('message', onSuccess)
      decoder.removeEventListener('error', onError)
      p.reject(e?.message)
    }

    decoder.addEventListener('message', onSuccess)
    decoder.addEventListener('error', onError)

    return p
  }

  cacheDecoder (decoder) {
    decoder.using = false
    decoder.ready = true
    if (!decoder.id) {
      decoder.id = Date.now() + parseInt(Math.random() * 1000)
    }
    this._queue.push(decoder)
    logger.log(this.TAG, 'cache decoder, id=', decoder.id)

    if (getDecodeCapacaity().preloadDecoder !== 'h265') return

    // 当前缓存中只有一个的时候，再新建一个备用
    if (this._queue.filter(x => !x.using && x.isHevc).length === 1) {
      this.genDecoder('h265')
    }
  }

  /**
   * 1. 正在初始化还没完成的decoder
   * 2. 已经缓存的decoder
   */
  getCachedDecoder (isHevc) {
    let decoderIndex = this._queue.findIndex(x => !x.using && x.isHevc === isHevc)
    let decoder

    if (decoderIndex !== -1) {
      decoder = this._queue.splice(decoderIndex, 1)[0]
    }

    if (!decoder && this._pendingDecoder) {
      decoder = this._pendingDecoder
      this._pendingDecoder = null
    }

    if (!decoder) return

    decoder.using = true

    logger.warn(this.TAG, `get cached decoder, id=${decoder.id}, ready=${decoder.ready}`)

    return decoder
  }
}

export {
  DecoderCache
}

export default new DecoderCache()
