
var decoder = null

var frameQueue = []

var receiveFrameTimer = 0

var hasReceiveFrame = false

self.addEventListener('message', function (e) {
  switch (e.data.msg) {
    case 'configuration':
      decoder = new self.VideoDecoder({
        output: function (frame) {
          // console.log('decoded!', decoder.decodeQueueSize, frameQueue.length)

          hasReceiveFrame = true

          if (receiveFrameTimer) {
            clearTimeout(receiveFrameTimer)
          }

          const f = frameQueue.shift()
          if (!f) {
            frame.close()
          } else {
            self.postMessage({
              type: 'DECODED',
              width: frame.displayWidth,
              height: frame.displayHeight,
              info: f,
              buffer: frame
            }, [frame])
          }

          if (decoder.decodeQueueSize === frameQueue.length) {
            self.postMessage({
              type: 'BATCH_FINISH_FLAG'
            })
          }
        },
        error: function (e) {
          console.log('[WebcodecWorker]:', e)
          if (e.message === 'Codec reclaimed due to inactivity.') return
          self.postMessage({
            type: 'FAILED',
            message: e && e.message
          })
        }
      })
      self.VideoDecoder.isConfigSupported(e.data.data)
        .then(function (status) {
          if (status.supported) {
            decoder.configure(e.data.data)
            console.log('[WebcodecWorker]:', 'isConfigSupported', status)
          }
        })
        .then(function () {
          self.postMessage({ type: 'DECODER_READY' })

          // 探测长时间无解码帧输出,降级到wasm
          receiveFrameTimer = setTimeout(() => {
            if (hasReceiveFrame) return
            self.postMessage({ type: 'FAILED', message: 'no frame output' })
          }, 2000)
        })
        .catch(function (e) {
          self.postMessage({
            type: 'FAILED',
            message: e && e.message
          })
        })
      break
    case 'decode':
      var d = e.data.data

      var sampleInfo = e.data.info

      frameQueue.push(sampleInfo)

      var frameSize = d.byteLength - 4

      var dv = new DataView(new ArrayBuffer(4))

      dv.setUint32(0, frameSize, false)

      d.set(new Uint8Array(dv.buffer), 0)

      if (sampleInfo.keyframe) {
        decoder.flush()
      }

      var chunk = new self.EncodedVideoChunk({
        type: sampleInfo.keyframe ? 'key' : 'delta',
        timestamp: sampleInfo.pts,
        data: d
      })
      decoder.decode(chunk)
      break
    case 'destroy':
      if (decoder) {
        decoder.flush()
        decoder.close()
      }
      clearTimeout(receiveFrameTimer)
      break
    case 'checkDecode':
      self.postMessage({
        type: 'CHECK_TO_DECODE',
        data: Math.abs(decoder.decodeQueueSize - frameQueue.length) === 0
      })
      break
    default:
  }
})
