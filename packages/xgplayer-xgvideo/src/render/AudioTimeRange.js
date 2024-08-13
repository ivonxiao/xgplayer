import { logger } from '../utils'

const TOLERANCE = 0.5
export default class AudioTimeRange {
  constructor (parent) {
    this.TAG = 'AudioTimeRange'
    this._parent = parent
    this._buffers = []
    this._duration = 0
    this._baseDts = 0
    this._lastBuffer = null
  }

  get isLive () {
    return this._parent.isLive
  }

  get duration () {
    return this._duration
  }

  set duration (v) {
    this._duration = v
  }

  get buffered () {
    if (this.isLive) {
      return {
        length: this._duration ? 1 : 0,
        start: () => 0,
        end: () => this._duration
      }
    }

    const buffers = this._mergeBufferRanges()
    return {
      length: buffers.length,
      start: (i) => {
        const buffer = buffers[i]
        return buffer ? buffer.start : 0
      },
      end: (i) => {
        const buffer = buffers[i]
        return buffer ? buffer.end : Infinity
      }
    }
  }

  resetDts (dts) {
    this._baseDts = dts
  }

  _transitionSamples (audioBufferSource) {
    const { numberOfChannels, length } = audioBufferSource

    const transitionCount = 512

    for (let channel = 0; channel < numberOfChannels; channel++) {
      const audioData = audioBufferSource.getChannelData(channel)
      for (let i = 0; i < transitionCount; i++) {
        /* fadein */
        audioData[i] = (audioData[i] * i) / transitionCount
      }

      for (let i = length - transitionCount; i < length; i++) {
        /* fadeout */
        audioData[i] = (audioData[i] * (length - i)) / transitionCount
      }
    }
  }

  append (source, duration, startDts, delay) {
    if (this._baseDts === -1) {
      this._baseDts = startDts
    }
    this._transitionSamples(source)
    const start = (startDts - this._baseDts) / 1000
    const end = start + duration
    const buffer = {
      start,
      end,
      startDts,
      source,
      duration,
      delay
    }

    logger.log(this.TAG, `add new buffer range, startDts:${startDts}, [${buffer.start} , ${buffer.end}]`)

    // todo: 去重,排序
    if (!this._buffers.filter((x) => x.start === start).length) {
      this._buffers.push(buffer)
    } else {
      console.error('音频重复')
      return
    }

    if (this.isLive) {
      this._duration = end
    }

    return buffer.start
  }

  deletePassed (time) {
    this._buffers = this._buffers.filter((x) => x.start >= time)
    return this._buffers[0]
  }

  canSeek (time) {
    const last = this._buffers[this._buffers.length - 1]
    if (!last) return false
    if (last.start < time) return false
    return true
  }

  _mergeBufferRanges () {
    const buffers = this._buffers.slice().sort((a, b) => (a.start > b.start ? 1 : -1))
    const len = buffers.length
    const ret = []
    if (!len) return ret

    let last = {
      start: buffers[0].start,
      end: buffers[0].end
    }

    for (let i = 1; i < len; i++) {
      const c = buffers[i]
      if (Math.abs(last.end - c.start) < TOLERANCE) {
        last.end = c.end
      } else {
        ret.push(last)
        last = {
          start: c.start,
          end: c.end
        }
      }
    }
    ret.push(last)
    return ret
  }

  getBuffer (time) {
    if (this.isLive) {
      return this._buffers.shift()
    }
    const buffer = this._buffers.filter((x) => x.start < time + TOLERANCE && x.end > time + TOLERANCE)[0]
    logger.log(this.TAG, `get audio buffer , currentTime:${time} ,buffer:[${buffer && buffer.start} , ${buffer && buffer.end}]`)

    if (time === 0 && !buffer) return this._buffers[0]

    return buffer
  }

  hasBuffer () {
    return !!(this._buffers?.length)
  }
}
