
let EleName = 'xg-video'

let simdCanused = false

try {
  simdCanused = WebAssembly && WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]))
} catch (e) {}

let decodeCapacity = {
  // 拉流ready之前提前初始化解码器worker
  preloadDecoder: false, // 'h264' | 'h265' | false

  reuseWasmDecoder: true,

  reuseMseForAudio: false,

  preciseSeek: 0, // 单位s, 对时长小于 preciseSeek 的视频精准seek

  // 允许webcodec解码264流
  h264WithWebcodec: true,

  lowDecodeThreshold: 100, // N帧持续解码效率 < fps 触发降级事件

  wasmFallbackToAsm: false,

  audioWithMse: true,

  canUseThreadMode: false,

  disabledWhenErrorOccur: true,

  disabledDuration: 3600 * 12, // s // 12h，某些场景下的禁用时间

  // 评估H265播放数量, 在evaluateVVCount个数 播放下
  // 解码效率不足的比例超过disabledByLowdecodePrecent 禁用H265播放
  evaluateVVCount: 0,

  disabledByLowdecodePrecent: 0.5,

  // internal
  maxDecodeOnceWasm: simdCanused ? 6 : 8,
  maxDecodeOnceFirstTime: 8,
  maxDecodeOnceWebcodec: 20
}

export { decodeCapacity }

export function getEleName () {
  return EleName
}

export function setEleName (name) {
  EleName = name
}

export function setDecodeCapacity (cap) {
  decodeCapacity = Object.assign({}, decodeCapacity, cap)
}

export function getDecodeCapacaity () {
  return decodeCapacity
}

export function getDecoderUrls () {
  const Ele = typeof customElements !== 'undefined' && customElements.get(EleName)

  if (!Ele) return {}

  return {
    H264_DECODER_URL: Ele.h264Url,
    ASM_H264_DECODER_URL: Ele.h264AsmUrl,
    H265_DECODER_URL: Ele.h265Url,
    H265_THREAD_DECODER_URL: Ele.h265ThreadUrl,
    H265_SIMD_DECODER_URL: Ele.h265SimdUrl,
    ASM_H265_DECODER_URL: Ele.h265AsmUrl
  }
}

export function simdSupported () {
  if (typeof customElements === 'undefined') return false

  const Ele = customElements.get(EleName)
  return simdCanused && !!Ele?.h265SimdUrl
}

export function threadSupported () {
  if (typeof customElements === 'undefined') return false

  const Ele = customElements.get(EleName)
  return !!window.SharedArrayBuffer && !!Ele?.h265ThreadUrl
}

let _softDecodeSupport = false

try {
  _softDecodeSupport = localStorage?.getItem?.('_sds') === '1'
} catch (e) {}

export function softDecodeSupported () {
  if (typeof customElements === 'undefined') return false

  if (_softDecodeSupport) return true

  let webAudioEnable = false
  let webglEnable = false

  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    let ctx = new AudioContext()
    ctx.close()
    ctx = null
    webAudioEnable = true
  } catch (e) {}

  try {
    let cvs = document.createElement('canvas')
    const validContextNames = ['webgl', 'experimental-webgl', 'moz-webgl', 'webkit-3d']
    for (let i = 0; i < validContextNames.length; i++) {
      let glCtx = cvs.getContext(validContextNames[i])
      if (glCtx) {
        glCtx = null
        cvs = null
        webglEnable = true
        break
      }
    }
    _softDecodeSupport = webAudioEnable && webglEnable && !!WebAssembly
    localStorage.setItem('_sds', _softDecodeSupport ? 1 : 0)
  } catch (e) {}

  return _softDecodeSupport
}

export function getDeviceCapacity () {
  return {
    simd: simdCanused,
    thread: threadSupported(),
    nbCpu: navigator.hardwareConcurrency
  }
}
