import EventEmitter from 'eventemitter3'
import Events from '../events'

export default class BaseRender extends EventEmitter {
  constructor (config, parent) {
    super()
    this._config = config
    this._parent = parent
    this._meta = null
    this._ready = false
    this._isLive = true
    this._innerDegrade = false
    this._singleTrack = -1
  }

  get analyse () {
    return this._parent.analyse
  }

  get isLive () {
    return this._isLive
  }

  get innerDegrade () {
    return this._innerDegrade
  }

  get noAudio () {
    return this._singleTrack === 1 || this._singleTrack === 2
  }

  get noVideo () {
    return this._singleTrack === 3
  }

  get duration () {
    return this._timeRange.duration
  }

  set duration (v) {
    if (this._timeRange) {
      this._timeRange.duration = v
    }
  }

  _bindEvents () {
    this._parent.on(Events.TIMELINE.APPEND_CHUNKS, this._appendChunk.bind(this))

    this._parent.on(Events.TIMELINE.RESET_BASE_DTS, this._resetDts.bind(this))

    this._parent.on(Events.TIMELINE.START_RENDER, this._startRender.bind(this))

    this._parent.on(Events.TIMELINE.DO_PLAY, this._doPlay.bind(this))

    this._parent.on(Events.TIMELINE.DO_PAUSE, this._doPause.bind(this))

    this._parent.on(Events.TIMELINE.DO_SEEK, this._doSeek.bind(this))

    this._parent.on(Events.TIMELINE.DESTROY, this._destroy.bind(this))

    this._parent.on(Events.TIMELINE.CHASE_FRAME, this._doChaseFrame.bind(this))

    this._parent.on(Events.TIMELINE.SINGLE_TRACK, (type) => {
      this._singleTrack = type
    })

    this._parent.on(Events.TIMELINE.SET_PLAY_MODE, (v) => {
      this._isLive = v === 'LIVE'
    })

    this._parent.on(Events.TIMELINE.INNER_DEGRADE, () => {
      this._innerDegrade = true
    })

    // for vod
    this._parent.on(Events.TIMELINE.SET_VIDEO_DURATION, (v) => {
      this.duration = v
    })
  }
}
