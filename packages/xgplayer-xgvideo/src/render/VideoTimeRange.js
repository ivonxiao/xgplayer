import { logger } from '../utils'

const TOLERANCE = 0.1
const MAX_TOLERANCE = 1

export default class VideoTimeRange {
  constructor (parent) {
    this.TAG = 'VideoTimeRange'
    this._parent = parent
    this._baseDts = 0
    this._lastDuration = 0
    this._duration = 0
    this._bitrate = 0
    this._totalSize = 0
    /**
     * buffers说明
     * type buffer = {
     *    start:number,
     *    end:number,
     *    duration:number,
     *    frames:Array<frame>
     * }
     * type buffers = Array<buffer>
     *
     */
    this._buffers = []

    /**
     *  对直播数据,只存在_currentFrameQueue的概念,数据只在一个队列中消费
     *  对点播,每个分片按 gop 大小作为一个buffer结构,存在_buffers概念,_currentFrameQueue为当前
     *    正在播放的buffer.frames
     */
    this._currentFrameQueue = []

    /**
     * 对点播,帧数据被渲染后当前帧不能被丢弃,需要一个索引标识正在渲染的帧
     */
    this._frameIndexInQueue = 0
    this._delayEstimateList = []

    /**
     * 对直播 seek是追帧需要参考的关键帧队列
     */
    this._keyframeQueue = []
  }

  get isLive () {
    return this._parent.isLive
  }

  get baseDts () {
    return this._baseDts
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

  get bufferStart () {
    return this._buffers[0]?.start || 0
  }

  get frameLength () {
    return this._currentFrameQueue.length
  }

  get keyFrameLength () {
    return this._keyframeQueue.length
  }

  get totalSize () {
    return this._totalSize
  }

  get bitrate () {
    return this._bitrate
  }

  set bitrate (v) {
    this._bitrate = v
  }

  get lastDuration () {
    return this._lastDuration
  }

  get frames () {
    return this._currentFrameQueue
  }

  // no audio 时
  getCurrentTime (cDts) {
    return this._lastDuration + (cDts - this._baseDts) / 1000
  }

  resetDts (dts) {
    this._baseDts = dts
  }

  _mergeBufferRanges () {
    const buffers = this._buffers.sort((a, b) => (a.start > b.start ? 1 : -1))
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

  _caclBaseDts (frame) {
    if (this._baseDts !== -1) return
    if (!frame) return
    this._baseDts = frame.dts
    logger.log(this.TAG, 'set baseDts: ', this._baseDts, 'frame len:', this._currentFrameQueue.length)
  }

  // for live + no audio
  _updateDuration (frames) {
    const len = frames.length
    const last = frames[len - 1]

    for (let i = 0; i < len; i++) {
      const f = frames[i]
      if (f && f.options && f.options.meta) {
        const pre = frames[i - 1] || this._currentFrameQueue[this._currentFrameQueue.length - 1]
        if (pre) {
          this._lastDuration += (pre.dts - this._baseDts) / 1000
        } else {
          this._lastDuration = this._duration
        }
        logger.log(this.TAG, 'updateBaseDts,record lastDuration:', this._lastDuration)
        this._baseDts = f.dts
        break
      }
    }

    if (last) {
      this._duration = (last.dts - this._baseDts) / 1000 + this._lastDuration
    }
  }

  _estimateBitRate (frames) {
    let len = frames.length
    if (len <= 2) {
      this._delayEstimateList = this._delayEstimateList.concat(frames)
      len = this._delayEstimateList.length
      if (len <= 30) return
      frames = this._delayEstimateList
      this._delayEstimateList = []
    }
    let sum = 0
    for (let i = 0; i < len; i++) {
      const f = frames[i]
      sum += f.data ? f.data.length : f.units.reduce((all, c) => (all += c.byteLength), 0)
    }
    this._totalSize += sum
    const delta = frames[len - 1].dts - frames[0].dts

    const bitrate = sum / delta // KB/s
    this._bitrate = parseInt(bitrate * 8000) // bps
  }

  _beforeAppendVodBuffer (frames) {
    if (!frames.length) return

    const gops = []
    let chunk = []

    // 按gop分割frame
    for (let i = 0, l = frames.length; i < l; i++) {
      if (frames[i].keyframe) {
        gops.push(chunk)
        chunk = []
      }
      chunk.push(frames[i])
    }

    if (chunk.length) {
      gops.push(chunk)
    }

    gops.forEach(c => this._appendVodBuffer(c))
  }

  _appendVodBuffer (frames) {
    if (!frames.length) return

    const frame0 = frames[0]
    const frameN = frames[frames.length - 1]
    const start = (frame0.dts - this._baseDts) / 1000
    const end = (frameN.dts - this._baseDts) / 1000

    if (logger.enable) {
      logger.log(this.TAG, `add new buffer range [${start} , ${end}]`)
    }

    if (this._buffers.filter(x => start >= x.start && end <= x.end).length) return

    this._buffers.push({
      start,
      end,
      duartion: end - start,
      frames: frames.slice()
    })

    this._buffers.sort((a, b) => (a.start > b.start ? 1 : -1))

    this._afterAppendVodBuffer()
  }

  _afterAppendVodBuffer () {
    const hasBufferNotStartWidthKey = this._buffers.filter(x => !x.frames[0]?.keyframe).length

    if (!hasBufferNotStartWidthKey) return

    const oldGops = this._buffers
    const nbGop = this._buffers.length
    const gops = []
    let lastGop = this._buffers[0]

    // 合并非关键帧开始的中间buffer
    for (let i = 1; i < nbGop; i++) {
      if (!oldGops[i].frames[0]?.keyframe) {
        lastGop.frames = lastGop.frames.concat(oldGops[i].frames)
        lastGop.end = oldGops[i].end
        lastGop.duartion = lastGop.end - lastGop.start
      } else {
        gops.push(lastGop)
        lastGop = oldGops[i]
      }
    }

    gops.push(lastGop)

    this._buffers = gops
  }

  _recordKeyframes (frames) {
    frames.forEach((f) => {
      if (f.keyframe) {
        const position = (f.dts - this._baseDts) / 1000
        this._keyframeQueue.push({
          position,
          frame: f
        })
      }
    })

    this._keyframeQueue = this._keyframeQueue.sort((a, b) => a.position > b.position ? 1 : -1)

    if (this.isLive && this._keyframeQueue.length > 40) {
      this._keyframeQueue.splice(0, 20)
    }
  }

  toAnnexBNalu (frames) {
    frames.forEach((sample) => {
      const nals = sample.units
      if (!nals) return
      const nalsLength = nals.reduce((len, current) => {
        return len + 4 + current.byteLength
      }, 0)
      const newData = new Uint8Array(nalsLength)
      let offset = 0
      nals.forEach((nal) => {
        newData.set([0, 0, 0, 1], offset)
        offset += 4
        newData.set(nal, offset)
        offset += nal.byteLength
      })
      sample.units = null
      sample.data = newData
    })
  }

  append (frames, needUpdateDuration, concatUnits) {
    if (concatUnits) {
      this.toAnnexBNalu(frames)
    }

    this._caclBaseDts(frames[0])

    if (needUpdateDuration) {
      this._updateDuration(frames)
    }

    this._estimateBitRate(frames)

    this._recordKeyframes(frames)

    if (this.isLive) {
      this._currentFrameQueue = this._currentFrameQueue.concat(frames)
      return
    }

    this._beforeAppendVodBuffer(frames)
  }

  updateSegmentEnd (end) {
    const last = this._buffers[this._buffers.length - 1]
    if (!last) return

    if (Math.abs(last.end - end) < 0.5) return

    last.end = end

    last.duartion = end - last.start

    logger.log(this.TAG, 'video data lack, reset end:', end)
  }

  getFrame (index = 0) {
    let f
    if (this.isLive) {
      return this._currentFrameQueue.shift()
    }

    // the current frame to play
    f = this._currentFrameQueue[this._frameIndexInQueue]

    // the current buffer range play finish
    if (!f) {
      // get the last frame
      f = this._currentFrameQueue[--this._frameIndexInQueue]

      if (!f) return

      // switch to next buffer range followed
      const got = this.switchBuffer((f.dts - this._baseDts) / 1000, this._frameIndexInQueue++, index)

      if (!got) return

      return this.getFrame(++index)
    }
    this._frameIndexInQueue++
    return f
  }

  getFramesForPreciseSeek (preciseDts) {
    return this._currentFrameQueue.filter(x => x.dts <= preciseDts)
  }

  updateFrameIndexForPreciseSeek (index) {
    this._frameIndexInQueue = index
  }

  // swith to new buffer range for vod
  switchBuffer (time, currentIndex = 0, stackSize = 0) {
    if (stackSize >= 20) return

    time = time || this.bufferStart // buffered.start(0)

    const buffer = this._buffers.filter((x) => x.start < time + TOLERANCE && x.end >= time + TOLERANCE)[0]

    /**
     * 考虑场景
     * gop过大未完全下载完、currentFrameQueue为正在下载gop的部分数据并且已播放完，
     * 此时switchBuffer，还是当前gop范围内，只需要此gop后半部分没有播放过的数据
     */

    if (!buffer) {
      // fixme 有时候流中间前后两帧dts差距比较大
      const next = this._buffers.find(x => x.start >= time)
      if (next && (next.start - time) < MAX_TOLERANCE) {
        this._currentFrameQueue = next.frames.slice(0)
        this._frameIndexInQueue = 0
        return next
      }
      return
    }

    if (buffer.frames[0].dts >= time) {
      this._currentFrameQueue = buffer.frames.slice(0)
      this._frameIndexInQueue = 0
      logger.log(this.TAG, `switch video buffer, time:${time} , buffer:[${buffer.start} , ${buffer.end}], index=0`)
      return buffer
    }

    // keep frameIndexInQueue
    if (buffer.frames.length > currentIndex) {
      this._currentFrameQueue = buffer.frames.slice(0)
      logger.log(this.TAG, `switch video buffer, in the same gop and more frame got, time:${time} , buffer:[${buffer.start} , ${buffer.end}], index=${currentIndex}`)
      return buffer
    }

    logger.log(this.TAG, `switch video buffer, in the same gop and no more frame got, time:${time} , buffer:[${buffer.start} , ${buffer.end}], index=${currentIndex}`)
  }

  getSeekStartPosition (time, preloadTime = 2) {
    let last
    this._keyframeQueue.forEach((keyframe) => {
      if (keyframe.position <= time) {
        last = keyframe
      }
    })
    if (!last) {
      return
    }
    if (time - last.position < preloadTime) return last
  }

  nextFrame () {
    return this._currentFrameQueue[0]
  }

  deletePassed (dts) {
    this._currentFrameQueue = this._currentFrameQueue.filter((x) => x.dts >= dts)
  }

  getDtsOfTime (time) {
    const delta = time - this._lastDuration
    return this._baseDts + delta * 1000
  }

  clean () {
    this._currentFrameQueue = []
  }

  destroy () {
    this._currentFrameQueue = []
    this._buffers = []
  }
}
