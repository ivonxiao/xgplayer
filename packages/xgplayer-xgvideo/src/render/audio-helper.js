const Alaw2lpcm = [
  -5504, -5248, -6016, -5760, -4480, -4224, -4992, -4736,
  -7552, -7296, -8064, -7808, -6528, -6272, -7040, -6784,
  -2752, -2624, -3008, -2880, -2240, -2112, -2496, -2368,
  -3776, -3648, -4032, -3904, -3264, -3136, -3520, -3392,
  -22016, -20992, -24064, -23040, -17920, -16896, -19968, -18944,
  -30208, -29184, -32256, -31232, -26112, -25088, -28160, -27136,
  -11008, -10496, -12032, -11520, -8960, -8448, -9984, -9472,
  -15104, -14592, -16128, -15616, -13056, -12544, -14080, -13568,
  -344, -328, -376, -360, -280, -264, -312, -296,
  -472, -456, -504, -488, -408, -392, -440, -424,
  -88, -72, -120, -104, -24, -8, -56, -40,
  -216, -200, -248, -232, -152, -136, -184, -168,
  -1376, -1312, -1504, -1440, -1120, -1056, -1248, -1184,
  -1888, -1824, -2016, -1952, -1632, -1568, -1760, -1696,
  -688, -656, -752, -720, -560, -528, -624, -592,
  -944, -912, -1008, -976, -816, -784, -880, -848,
  5504, 5248, 6016, 5760, 4480, 4224, 4992, 4736,
  7552, 7296, 8064, 7808, 6528, 6272, 7040, 6784,
  2752, 2624, 3008, 2880, 2240, 2112, 2496, 2368,
  3776, 3648, 4032, 3904, 3264, 3136, 3520, 3392,
  22016, 20992, 24064, 23040, 17920, 16896, 19968, 18944,
  30208, 29184, 32256, 31232, 26112, 25088, 28160, 27136,
  11008, 10496, 12032, 11520, 8960, 8448, 9984, 9472,
  15104, 14592, 16128, 15616, 13056, 12544, 14080, 13568,
  344, 328, 376, 360, 280, 264, 312, 296,
  472, 456, 504, 488, 408, 392, 440, 424,
  88, 72, 120, 104, 24, 8, 56, 40,
  216, 200, 248, 232, 152, 136, 184, 168,
  1376, 1312, 1504, 1440, 1120, 1056, 1248, 1184,
  1888, 1824, 2016, 1952, 1632, 1568, 1760, 1696,
  688, 656, 752, 720, 560, 528, 624, 592,
  944, 912, 1008, 976, 816, 784, 880, 848
]

const Ulaw2lpcm = [
  -32124, -31100, -30076, -29052, -28028, -27004, -25980, -24956,
  -23932, -22908, -21884, -20860, -19836, -18812, -17788, -16764,
  -15996, -15484, -14972, -14460, -13948, -13436, -12924, -12412,
  -11900, -11388, -10876, -10364, -9852, -9340, -8828, -8316,
  -7932, -7676, -7420, -7164, -6908, -6652, -6396, -6140,
  -5884, -5628, -5372, -5116, -4860, -4604, -4348, -4092,
  -3900, -3772, -3644, -3516, -3388, -3260, -3132, -3004,
  -2876, -2748, -2620, -2492, -2364, -2236, -2108, -1980,
  -1884, -1820, -1756, -1692, -1628, -1564, -1500, -1436,
  -1372, -1308, -1244, -1180, -1116, -1052, -988, -924,
  -876, -844, -812, -780, -748, -716, -684, -652,
  -620, -588, -556, -524, -492, -460, -428, -396,
  -372, -356, -340, -324, -308, -292, -276, -260,
  -244, -228, -212, -196, -180, -164, -148, -132,
  -120, -112, -104, -96, -88, -80, -72, -64,
  -56, -48, -40, -32, -24, -16, -8, 0,
  32124, 31100, 30076, 29052, 28028, 27004, 25980, 24956,
  23932, 22908, 21884, 20860, 19836, 18812, 17788, 16764,
  15996, 15484, 14972, 14460, 13948, 13436, 12924, 12412,
  11900, 11388, 10876, 10364, 9852, 9340, 8828, 8316,
  7932, 7676, 7420, 7164, 6908, 6652, 6396, 6140,
  5884, 5628, 5372, 5116, 4860, 4604, 4348, 4092,
  3900, 3772, 3644, 3516, 3388, 3260, 3132, 3004,
  2876, 2748, 2620, 2492, 2364, 2236, 2108, 1980,
  1884, 1820, 1756, 1692, 1628, 1564, 1500, 1436,
  1372, 1308, 1244, 1180, 1116, 1052, 988, 924,
  876, 844, 812, 780, 748, 716, 684, 652,
  620, 588, 556, 524, 492, 460, 428, 396,
  372, 356, 340, 324, 308, 292, 276, 260,
  244, 228, 212, 196, 180, 164, 148, 132,
  120, 112, 104, 96, 88, 80, 72, 64,
  56, 48, 40, 32, 24, 16, 8, 0
]

const silenceFrame = new Uint8Array([
  0x1, 0x40, 0x22, 0x80, 0xa3, 0x5e, 0xe6, 0x80, 0xba, 0x8, 0x0, 0x0,
  0x0, 0x0, 0x95, 0x0, 0x6, 0xf1, 0xa1, 0xa, 0x5a, 0x5a, 0x5a, 0x5a,
  0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a,
  0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a,
  0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a,
  0x5a, 0x5e
])

function _doubleCheckSampleRateIndex (config, sampleRateIndex) {
  const newIndex = ((config[0] & 0x07) << 1) | (config[1] >>> 7)

  if (newIndex !== sampleRateIndex) {
    return newIndex
  }

  return sampleRateIndex
}

function _constructAdtsHeader (meta, data) {
  let { sampleRateIndex } = meta
  const { channelCount, config } = meta

  sampleRateIndex = _doubleCheckSampleRateIndex(config, sampleRateIndex)

  const adts = new Uint8Array(7)

  // 设置同步位 0xfff 12bit
  adts[0] = 0xff
  adts[1] = 0xf0

  // Object data (没什么人用MPEG-2了，HLS和FLV也全是MPEG-4，这里直接0)  1bit
  // Level always 00 2bit
  // CRC always 1 1bit
  adts[1] = adts[1] | 0x01

  // profile 2bit (meta.originObjectType || meta.objectType)
  adts[2] = 0xc0 & ((2 - 1) << 6)

  // sampleFrequencyIndex
  adts[2] = adts[2] | (0x3c & (sampleRateIndex << 2))

  // private bit 0 1bit
  // chanel configuration 3bit
  adts[2] = adts[2] | (0x01 & (channelCount >> 2))
  adts[3] = 0xc0 & (channelCount << 6)

  // original_copy: 0 1bit
  // home: 0 1bit

  // adts_variable_header()
  // copyrighted_id_bit 0 1bit
  // copyrighted_id_start 0 1bit

  // aac_frame_length 13bit;
  const aacframelength = data.byteLength + 7

  adts[3] = adts[3] | (0x03 & (aacframelength >> 11))
  adts[4] = 0xff & (aacframelength >> 3)
  adts[5] = 0xe0 & (aacframelength << 5)

  // adts_buffer_fullness 0x7ff 11bit
  adts[5] = adts[5] | 0x1f
  adts[6] = 0xfc

  // number_of_raw_data_blocks_in_frame 0 2bit;
  return adts
}

function packageAACToAdts (meta, sample) {
  const buffer = new Uint8Array(sample.data.byteLength + 7)
  const header = _constructAdtsHeader(meta, sample.data)
  buffer.set(header)
  buffer.set(sample.data, 7)
  return buffer
}

function concatAdts (samples, gap = 0) {
  // get length
  let length = 0
  for (let i = 0, k = samples.length; i < k; i++) {
    if (gap && (i % gap === 0)) {
      continue
    }
    length += samples[i].byteLength
  }

  const ret = new Uint8Array(length)
  let offset = 0
  // combile data;
  for (let i = 0, k = samples.length; i < k; i++) {
    if (gap && (i % gap === 0)) {
      continue
    }
    ret.set(samples[i], offset)
    offset += samples[i].byteLength
  }
  return ret
}

/**
 * @param {Uint8Array} data G.711 alaw data
 * @returns {Uint8Array} 16 bit pcm data
 */
function _decodeAlaw (data) {
  const pcm = new Uint8Array(data.length * 2)
  let i = 0
  let j = 0
  while (i < data.length) {
    const frame = Alaw2lpcm[data[i]]
    if (frame === undefined) throw new Error('can not decode g711 alaw data!')
    pcm[j] = frame & 0x00ff
    pcm[j + 1] = frame >> 8
    i += 1
    j += 2
  }

  return pcm
}

/**
 * @param {Uint8Array} data G.711 ulaw data
 * @returns {Uint8Array} 16 bit pcm data
 */
function _decodeUlaw (data) {
  const pcm = new Uint8Array(data.length * 2)
  let i = 0
  let j = 0
  while (i < data.length) {
    // frame is int16
    const frame = Ulaw2lpcm[data[i]]
    if (frame === undefined) throw new Error('can not decode g711 ulaw data!')
    pcm[j] = frame & 0x00ff
    pcm[j + 1] = frame >> 8
    i += 1
    j += 2
  }

  return pcm
}

function decodeG711 (buffer, format) {
  if (format === 'g7110a') {
    return _decodeAlaw(buffer)
  }

  if (format === 'g7110m') {
    return _decodeUlaw(buffer)
  }

  throw new Error(`no supported format=${format} for g711`)
}

function _getSampleCount (byteLength, channel, sampleSize) {
  return byteLength / channel / sampleSize
}

function _uint16ToFloat32 (uint16) {
  return (uint16 >= 0x8000) ? -(0x10000 - uint16) / 0x8000 : uint16 / 0x7FFF
}

/**
 *create AudioBuffer from raw pcm data
* @param {AudioContext} audioCtx
* @param {Uint8Arry} buffer raw pcm buffer data
* @param {number} channel audio channel count
* @param {number} sampleRate  audio samplerate
* @param {number} sampleSize  byte count pre sample
* @returns {AudioBuffer}
*/
function createAudioBufferFromPcm (audioCtx, buffer, channel, sampleRate, sampleSize) {
  const nbSamples = _getSampleCount(buffer.byteLength, channel, sampleSize)
  const audioBuffer = audioCtx.createBuffer(channel, nbSamples, sampleRate)
  const dataView = new DataView(buffer)

  for (let c = 0; c < channel; c++) {
    const nowBuffering = audioBuffer.getChannelData(c)
    let uint
    for (let i = 0; i < nbSamples; i++) {
      uint = dataView.getUint16(i * (2 * channel) + (c * 2), true)
      // uint16 to float32
      nowBuffering[i] = _uint16ToFloat32(uint)
    }
  }

  return {
    audioBuffer,
    duration: nbSamples / sampleRate
  }
}

function checkRefillFrame (samples) {
  const firstDts = samples[0].dts
  const nbSilenceFrame = samples.filter(x => x.dts === firstDts).length

  if (nbSilenceFrame <= 1) return

  for (let i = 0; i < nbSilenceFrame; i++) {
    samples[i].data = silenceFrame
  }
}

export default {
  decodeG711,
  createAudioBufferFromPcm,
  packageAACToAdts,
  concatAdts,
  checkRefillFrame
}
