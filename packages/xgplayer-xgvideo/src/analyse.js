import { getVV, getLowdecodeVV, getLowdecodePercent } from './disabled'

const AnalyseDots = {
  FIRST_DATA: 1,
  AUDIO_MSE_OPEN_START: 2,
  AUDIO_MSE_OPEND: 3,
  AUDIO_FIRSTTIME_APPENDED: 4,
  AUDIO_READY: 5,
  WASM_WORKER_INIT: 6,
  WASM_WORKER_READY: 7,
  FIRST_FRAME_TODECODE: 8,
  VIDEO_READY: 9,
  FIRST_FRAME: 10,
  WAITIGN: 11,
  SEEKING: 12,
  SEEKED: 13
}

const AnalyseDotsFlat = Object.entries(AnalyseDots)

class Analyse {
    _dot = []

    _currentLowDecodeCount = 0

    getBootStats () {
      const startDot = this._dot[0]?.dot || 0
      return this._dot.map(x => {
        return {
          action: AnalyseDotsFlat.filter(item => item[1] === x.action)[0][1],
          dot: parseInt(x.dot - startDot)
        }
      })
    }

    getStats (v) {
      const bootStats = this.getBootStats()
      return {
        bootStats,
        bitrate: Math.abs(v.bitrate / 1000), // kbps
        decodeFps: v.decodeFps,
        fps: v.fps,
        playbackRate: v.playbackRate,
        firstframe: bootStats.filter(x => x.action === 10)[0]?.dot,
        width: v.videoWidth,
        height: v.videoHeight,
        decoderMode: v.decoderMode,
        vv: getVV(), // 单页内播放vv
        lowdecodeVV: getLowdecodeVV(), // 单页内降级vv
        h265FailureRate: Number((getLowdecodePercent() * 100).toFixed(2)), // 计算 getDecodeCapacaity().evaluateVVCount次播放的降级率
        currentLowDecodeCount: this._currentLowDecodeCount
      }
    }

    seekElapses () {
      const bootStats = this.getBootStats()
      const elapses = []

      let t = 0
      for (let i = 0, l = bootStats.length; i < l; i++) {
        const now = bootStats[i]
        if (now.action === AnalyseDots.SEEKING) {
          t = now.dot
        }

        if (now.action === AnalyseDots.SEEKED) {
          elapses.push(now.dot - t)
        }
      }
      return elapses
    }

    addFirstData () {
      this._dot.push({
        action: AnalyseDots.FIRST_DATA,
        dot: this._getTimestap()
      })
    }

    addAudioBoundMedia () {
      this._dot.push({
        action: AnalyseDots.AUDIO_BOUND_MEDIA,
        dot: this._getTimestap()
      })
    }

    addAudioMseOpenStart () {
      this._dot.push({
        action: AnalyseDots.AUDIO_MSE_OPEN_START,
        dot: this._getTimestap()
      })
    }

    addAudioMseOpend () {
      this._dot.push({
        action: AnalyseDots.AUDIO_MSE_OPEND,
        dot: this._getTimestap()
      })
    }

    addAudioFirstTimeAppended () {
      this._dot.push({
        action: AnalyseDots.AUDIO_FIRSTTIME_APPENDED,
        dot: this._getTimestap()
      })
    }

    addAudioReady () {
      this._dot.push({
        action: AnalyseDots.AUDIO_READY,
        dot: this._getTimestap()
      })
    }

    addWasmInit () {
      this._dot.push({
        action: AnalyseDots.WASM_WORKER_INIT,
        dot: this._getTimestap()
      })
    }

    addWasmReady () {
      this._dot.push({
        action: AnalyseDots.WASM_WORKER_READY,
        dot: this._getTimestap()
      })
    }

    addFirstFrameToDecode () {
      this._dot.push({
        action: AnalyseDots.FIRST_FRAME_TODECODE,
        dot: this._getTimestap()
      })
    }

    addVideoReady () {
      this._dot.push({
        action: AnalyseDots.VIDEO_READY,
        dot: this._getTimestap()
      })
    }

    addFirstframe () {
      this._dot.push({
        action: AnalyseDots.FIRST_FRAME,
        dot: this._getTimestap()
      })
    }

    addWaiting () {
      this._dot.push({
        action: AnalyseDots.WAITIGN,
        dot: this._getTimestap()
      })
    }

    addSeeking () {
      this._dot.push({
        action: AnalyseDots.SEEKING,
        dot: this._getTimestap()
      })
    }

    addSeeked () {
      this._dot.push({
        action: AnalyseDots.SEEKED,
        dot: this._getTimestap()
      })
    }

    _getTimestap () {
      return performance.now()
    }

    increaseLowDecodeCount () {
      this._currentLowDecodeCount++
    }

    reset () {
      this._currentLowDecodeCount = 0
      this._dot = []
    }
}

export default Analyse
