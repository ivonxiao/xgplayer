/* eslint-disable no-undef */
import DecodeController from '../DecodeController'
import HevcWorker from './hevc-worker.js?worker&inline'
import HevcThreadWorker from './hevc-worker-thread.js?worker&inline'
import AvcWorker from './worker.js?worker&inline'
import Events from '../../events'
import { getDecoderUrls, threadSupported, simdSupported, getDecodeCapacaity } from '../../config'
import decoderCache from './DecoderCache'
import { logger } from '../../utils'

const MAX_DECODE_ONCE_DEFAULT = getDecodeCapacaity().maxDecodeOnceWasm

/**
 *  wasm解码器worker管理及数据交互
 */
export default class WasmDecodeController extends DecodeController {
  TAG = 'WasmController'

  _avccpushed = false // metadata信息刷新解码器

  _maxDecodeOnce = MAX_DECODE_ONCE_DEFAULT

  _continueDecodeThreshold = MAX_DECODE_ONCE_DEFAULT / 2

  _wasmInitCost = 0

  _threadSupported = threadSupported() && getDecodeCapacaity().canUseThreadMode

  _simdSuppported = simdSupported()

  /**
   * 1: hevc decode with thread
   * 2: hevc decode with simd
   * 3: hevc | 264 decode
   * 4: hevc | 264 decode with asm.js
   */
  _decoderMode = window.WebAssembly ? 3 : 4

  get wasmInitCost () {
    return this._decoderWorker?._wasmInitCost
  }

  get isHevc () {
    return this._parent?.isHevc
  }

  _selectDecodeWorker () {
    this.analyse.addWasmInit()
    const {
      H264_DECODER_URL,
      H265_DECODER_URL,
      H265_THREAD_DECODER_URL,
      H265_SIMD_DECODER_URL,
      ASM_H264_DECODER_URL,
      ASM_H265_DECODER_URL
    } = getDecoderUrls()

    let url

    logger.log(this.TAG, 'start init wasm worker:', performance.now(), 'hevc:', this.isHevc, 'decoderMode:', this._decoderMode)

    if (this.isHevc) {
      url = this._decoderMode === 1
        ? H265_THREAD_DECODER_URL
        : this._decoderMode === 2
          ? H265_SIMD_DECODER_URL
          : this._decoderMode === 3
            ? H265_DECODER_URL
            : ASM_H265_DECODER_URL

      if (!url) {
        this._workerErrorCallback(`no found decoder url, decodeMode:${this._decoderMode}`)
        return
      }

      return {
        decoder: this._decoderMode === 1 ? new HevcThreadWorker() : new HevcWorker(),
        url
      }
    }

    url = this._decoderMode === 4 ? ASM_H264_DECODER_URL : H264_DECODER_URL

    if (!url) {
      this._workerErrorCallback(`no found decoder url, decodeMode:${this._decoderMode}`)
      return
    }

    return {
      decoder: new AvcWorker(),
      url
    }
  }

  _initWorker () {
    if (this.isHevc) {
      if (this._threadSupported) {
        this._decoderMode = 1
      }
      if (this._simdSuppported) {
        this._decoderMode = 2
      }
    }

    this._initDecodeWorkerInternal()
  }

  // select worker from cache
  // or create new worker when stream ready with metadata
  _initDecodeWorkerInternal () {
    const decoder = decoderCache.getCachedDecoder(this.isHevc)

    // use worker cached direct
    if (decoder) {
      logger.warn(this.TAG, 'select decoder from cache')
      this.analyse.addWasmInit()
      this._avccpushed = false
      this._bindWorkerEvent(decoder)
      this._decoderWorker = decoder
      // 预加载的decoder可能还没初始化完成
      if (decoder.ready) {
        this._decoderReady = true
        this._initDecoderWithConfiguration(decoder, this.meta)
        this._workerMessageCallback({
          type: 'DECODER_READY',
          data: decoder
        })
        logger.log(this.TAG, 'decoder ready!')
      }
      return
    }

    const { decoder: newDecoder, url } = this._selectDecodeWorker() || {}

    if (!newDecoder) return

    this._avccpushed = false
    this._bindWorkerEvent(newDecoder)
    newDecoder.isHevc = this.isHevc
    // 初始化wasm实例
    newDecoder.postMessage({
      msg: 'init',
      meta: this.meta,
      batchDecodeCount: MAX_DECODE_ONCE_DEFAULT,
      url
    })

    this._decoderWorker = newDecoder
  }

  _bindWorkerEvent (decoder) {
    const _whenFail = (msg, from) => {
      logger.log(this.TAG, 'worker failed: ', msg, from)
      this._terminateWorker(decoder)
      this._decoderWorker = null
      if (getDecodeCapacaity().wasmFallbackToAsm === false || this._decoderMode === 4) {
        this._workerErrorCallback(msg)
      } else {
        this._decoderMode = (this._decoderMode === 1 || this._decoderMode === 2) ? 3 : 4 // 使用 asm
        this._initDecodeWorkerInternal()
      }
    }

    decoder._onMessage = (e) => {
      const { msg } = e.data
      switch (msg) {
        case 'DECODER_READY':
          logger.log(this.TAG, 'wasm worker ready!', 'cost:', e.data.cost)
          this._decoderReady = true

          // record  decoder init cost
          decoder._wasmInitCost = parseInt(e.data.cost)

          // preload worker may ready before stream ready!
          if (!this.meta) return

          if (!this._avccpushed) {
            this._initDecoderWithConfiguration(decoder, this.meta)
          }
          this.emit(Events.VIDEO.VIDEO_DECODER_INIT, decoder)
          this._workerMessageCallback({
            type: 'DECODER_READY',
            data: decoder
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
        case 'INIT_FAILED':
          _whenFail(e.data.log, 1)
          break
        default:
      }
    }

    decoder._onError = (e) => {
      _whenFail(e.message, 2)
    }

    decoder.addEventListener('message', decoder._onMessage)
    decoder.addEventListener('error', decoder._onError)
  }

  // init decoder with sps、pps
  _initDecoderWithConfiguration (worker, meta) {
    logger.log(this.TAG, 'init decoder with configuration')
    this._avccpushed = true
    worker.postMessage({
      msg: 'updatemeta',
      meta: meta
    })
    const vps = meta.rawVps || meta.vps[0]
    const sps = meta.rawSps || meta.sps[0]
    const pps = meta.rawPps || meta.pps[0]

    const metadata = [vps, sps, pps].filter(Boolean)

    const size = metadata.reduce((all, c) => (all += c.byteLength + 4), 0)

    const data = new Uint8Array(size)

    let offset = 0
    metadata.forEach(c => {
      data.set([0, 0, 0, 1], offset)
      offset += 4
      data.set(c, offset)
      offset += c.byteLength
    })

    worker.postMessage({
      msg: 'initDecoder',
      data: data
    })
  }

  destroy () {
    if (!this._decoderWorker) return

    if (getDecodeCapacaity().reuseWasmDecoder) {
      this._offWorkerBind(this._decoderWorker)
      decoderCache.cacheDecoder(this._decoderWorker)
      return
    }
    this._terminateWorker(this._decoderWorker)
  }

  _offWorkerBind (worker) {
    worker.removeEventListener('message', worker._onMessage)
    worker.removeEventListener('error', worker._onError)
    worker.postMessage({ msg: 'flush' })
    worker._onMessage = null
    worker._onError = null
    logger.log(this.TAG, 'flush decoder and unbind worker event')
  }

  _terminateWorker (decoder) {
    this._offWorkerBind(decoder)
    decoder.postMessage({ msg: 'destroy' })
    decoder.terminate()
    logger.log(this.TAG, 'destroy decoder worker')
  }
}
