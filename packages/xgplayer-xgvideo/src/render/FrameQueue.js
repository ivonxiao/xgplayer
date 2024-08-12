
function _checkClose (f) {
  f.buffer?.close && f.buffer.close()
}

export { _checkClose as checkClose }

export default class FrameQueue {
  constructor (parent) {
    this.TAG = 'FrameQueue'
    this._parent = parent
    this._lastGopId = 0
    this._frames = []
  }

  get currentTimeDts () {
    return this._parent.preciseVideoDts
  }

  get length () {
    return this._frames.length
  }

  get frames () {
    return this._frames
  }

  append (frame) {
    if (!frame.info) {
      _checkClose(frame)
      return
    }
    this._frames.push(frame)
  }

  appendVodFrame (frame) {
    this._frames.push(frame)
  }

  nextFrame () {
    // 低延迟 删掉多余的帧
    const len = this._frames.length
    if (this._parent.noAudio === 1 && len > 3) {
      this._frames = this._frames.slice(len - 2)
    }
    return this._frames[0]
  }

  shift (preciseVideoDts = 0) {
    const next = this._frames.shift()
    this.deletePassed(preciseVideoDts)
    return next
  }

  deletePassed (dts) {
    this._frames = this._frames.filter((x) => {
      const matched = x.info && x.info.dts > dts
      if (matched) {
        return true
      }
      _checkClose(x)
      return false
    })
  }

  empty () {
    this._frames.forEach(x => _checkClose(x))
    this._frames = []
  }

  destroy () {
    this.empty()
    this._lastGopId = 0
  }
}
