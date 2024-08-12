import { getDecodeCapacaity } from './config'

let vv = 0
let lowdecodeVV = 0
let lowdecodePercent = 0
let disabledHevc = false

export function updateVV () {
  vv++
}

export function getVV () {
  return vv
}

export function updateLowdecodeVV () {
  lowdecodeVV++
}

export function getLowdecodeVV () {
  return lowdecodeVV
}

export function getLowdecodePercent () {
  return lowdecodePercent
}

// 检测 N次播放中降级播放次数占比 > M, 禁用Hevc
export function _getDisabledByEvaluateVV () {
  if (disabledHevc) return true

  // 没指定过评估播放次数
  if (getDecodeCapacaity().evaluateVVCount === 0) return false

  if (vv === getDecodeCapacaity().evaluateVVCount) {
    lowdecodePercent = lowdecodeVV / vv
  }

  if (lowdecodePercent >= getDecodeCapacaity().disabledByLowdecodePrecent) {
    disabledHevc = true
  }

  return disabledHevc
}

/**
 *
 * 指定了内部降级 innerDegrade
 * // 发生错误，后续禁用
 * // 解码效率不足，根据解码效率和fps的对比决定永久禁用、禁用N小时
 * // N: getDecodeCapacaity().disabledDuration
 *
 *
 *
 * H265
 *  // 发生错误
 *  // 多次解码效率不足需要降级
 *  // 检测 N次播放中降级播放次数占比 > M
 *  // N: getDecodeCapacaity().evaluateVVCount
 *  // M: getDecodeCapacaity().disabledByLowdecodePrecent
 *
 *
 */

/**
 *
 * @param {number} type 1: 永久禁用 2: 禁用一定时间
 */
export function persistenceDisabledStatus (type) {
  localStorage.setItem('xgv_dis', type)
  if (type === 2) {
    localStorage.setItem('xgv_dist', new Date().getTime())
  }
}

/**
 * @returns {boolean} false: 可以， true: 禁用
 */
export function getDisabledStatus () {
  if (_getDisabledByEvaluateVV() === true) return true

  const v = localStorage.getItem('xgv_dis')
  if (!v) return false

  if (v === '1') return true

  if (v === '2') {
    let disTime = localStorage.getItem('xgv_dist') || 0
    disTime = Number(disTime)
    const disDuration = (new Date().getTime() - disTime) / 1000

    if (disDuration < getDecodeCapacaity().disabledDuration) {
      return true
    }
    cleanDisabledStatus()
  }
}

export function cleanDisabledStatus () {
  localStorage.removeItem('xgv_dist')
  localStorage.removeItem('xgv_dis')
}
