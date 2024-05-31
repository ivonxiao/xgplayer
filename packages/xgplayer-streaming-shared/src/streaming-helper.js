export const NEW_ARRAY_MAX_CNT = 10
export function isMediaPlaying (media) {
  return media && !media.paused && !media.ended && media.playbackRate !== 0 && media.readyState !== 0
}

export function getVideoPlaybackQuality (video) {
  if (!video) return {}
  if (typeof video.getVideoPlaybackQuality === 'function') {
    const info = video.getVideoPlaybackQuality()
    return {
      droppedVideoFrames: info.droppedVideoFrames || info.corruptedVideoFrames,
      totalVideoFrames: info.totalVideoFrames,
      creationTime: info.creationTime
    }
  }

  return {
    droppedVideoFrames: video.webkitDroppedFrameCount,
    totalVideoFrames: video.webkitDecodedFrameCount,
    creationTime: performance.now()
  }
}

/**
 * @param {Array.<Uint8Array>} arr
 * @returns
 */
export function concatUint8Array (...arr) {
  arr = arr.filter(Boolean)
  if (arr.length < 2) return arr[0]
  const size = arr.reduce((p, c) => p + c.byteLength, 0)
  const data = newUint8Array(size)
  let prevLen = 0
  arr.forEach((d) => {
    data.set(d, prevLen)
    prevLen += d.byteLength
  })
  return data
}

export function newUint8Array (size) {
  let cnt = 0
  let array
  while (cnt < NEW_ARRAY_MAX_CNT) {
    try {
      array = new Uint8Array(size)
      if (array && array.byteLength > 0) {
        break
      } else {
        cnt++
      }
    } catch (e) {
      if (cnt < NEW_ARRAY_MAX_CNT) {
        cnt++
      } else {
        throw new Error(`new array failed final,${e?.message}`)
      }
    }
  }
  return array
}

export function sleep (t = 0) {
  return new Promise((resolve) => setTimeout(resolve, t))
}
