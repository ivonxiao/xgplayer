class DevLogger {
  constructor () {
    try {
      const matched = /xgd=(\d)/.exec(document.cookie)
      this._status = !!matched
      this._level = matched && matched[1]
    } catch (e) {
      this._status = false
    }

    ['group', 'groupEnd', 'log', 'warn', 'error'].forEach((funName) => {
      this[funName] = (arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9, arg10) => {
        if (!this._status) return
        const tagName = arg1
        const args = [arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9, arg10].filter(x => x !== undefined)
        console[funName]('[' + tagName + ']:', ...args)
      }
    })
  }

  /**
     * @return {*|boolean|boolean}
     */
  get enable () {
    return this._status
  }

  /**
     * @return {boolean}
     */
  get long () {
    return this._level === '2'
  }
}
const logger = new DevLogger()

/**
 * @param {number} num
 * @param {number} fixed
 * @return {number}
 */
function debounce (fn, wait) {
  let lastTime = Date.now()
  let timer = null
  let isFirstTime = true

  return (...args) => {
    const now = Date.now()
    if (isFirstTime) {
      lastTime = Date.now()
      isFirstTime = false
      fn(...args)
    }
    if (now - lastTime > wait) {
      lastTime = now
      fn(...args)
    } else {
      if (timer) {
        window.clearTimeout(timer)
      }
      timer = setTimeout(() => {
        fn(...args)
      }, wait)
    }
  }
}

// 组装AvcDecoderConfigurationRecord
// *  configurationVerison = 1  uint(8)
// *  avcProfileIndication      uint(8)
// *  profile_compatibility     uint(8)
// *  avcLevelIndication        uint(8)
// *  reserved   `111111`       bit(6)
// *  lengthSizeMinusOne        uint(2)
// *  reserved   `111`          bit(3)
// *  numOfSPS                  uint(5)
// *  for(numOfSPS)
// *    spsLength               uint(16)
// *    spsNALUnit              spsLength个字节
// *  numOfPPS                  uint(8)
// *  for(numOfPPS)
// *     ppsLength              uint(16)
// *     ppsNALUnit             ppsLength个字节
/**
 * @param {Uint8Array} sps
 * @param {Uint8Array} pps
 */
function getAvcc (sps, pps) {
  if (!sps || !pps) return
  const ret = new Uint8Array(sps.byteLength + pps.byteLength + 11)
  ret[0] = 0x01
  ret[1] = sps[1]
  ret[2] = sps[2]
  ret[3] = sps[3]
  ret[4] = 255
  ret[5] = 225 // 11100001

  let offset = 6

  ret.set(new Uint8Array([(sps.byteLength >>> 8) & 0xff, sps.byteLength & 0xff]), offset)
  offset += 2
  ret.set(sps, offset)
  offset += sps.byteLength

  ret[offset] = 1
  offset++

  ret.set(new Uint8Array([(pps.byteLength >>> 8) & 0xff, pps.byteLength & 0xff]), offset)
  offset += 2
  ret.set(pps, offset)
  return ret
}

function promiseDelayed () {
  let res
  let rej

  const promise = new Promise((resolve, reject) => {
    res = resolve
    rej = reject
  })

  promise.resolve = res
  promise.reject = rej

  return promise
}

export {
  logger,
  debounce,
  getAvcc,
  promiseDelayed
}
