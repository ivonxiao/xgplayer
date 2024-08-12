
import XGVideo from './main'
import { getEleName, setEleName } from './config'

// ffmpeg v4.3
const H264_DECODER_URL = 'https://sf1-cdn-tos.huoshanstatic.com/obj/media-fe/decoder/1.1.1/h264/decoder.js'
const ASM_H264_DECODER_URL = 'https://sf1-cdn-tos.huoshanstatic.com/obj/media-fe/decoder/1.1.1/h264/decoder_asm.js'

const H265_SIMD_DECODER_URL = 'https://sf1-cdn-tos.huoshanstatic.com/obj/media-fe/codec/high/decoder_1656041798666.js'
const H265_THREAD_DECODER_URL = 'https://sf1-cdn-tos.huoshanstatic.com/obj/media-fe/codec/main/decoder.js'
const H265_DECODER_URL = 'https://sf1-cdn-tos.huoshanstatic.com/obj/media-fe/codec/base/decoder.js'
const ASM_H265_DECODER_URL = 'https://sf1-cdn-tos.huoshanstatic.com/obj/media-fe/codec/high/decoder_asm.js'

XGVideo.init({
  h264Url: H264_DECODER_URL,
  h264AsmUrl: ASM_H264_DECODER_URL,
  h265Url: H265_DECODER_URL,
  h265SimdUrl: H265_SIMD_DECODER_URL,
  h265ThreadUrl: H265_THREAD_DECODER_URL,
  h265AsmUrl: ASM_H265_DECODER_URL
})

XGVideo.setEleName = (name) => {
  setEleName(name)

  class Temp extends XGVideo {}

  customElements.get(getEleName()) || customElements.define(getEleName(), Temp)
}

try {
  customElements.get(getEleName()) || customElements.define(getEleName(), XGVideo)
} catch (e) {}

export default XGVideo
