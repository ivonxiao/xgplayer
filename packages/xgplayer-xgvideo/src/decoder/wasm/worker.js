/* eslint-disable no-eval */
/* eslint-disable no-undef */

function shimImportScripts (src) {
  return fetch(src)
    .then(function (res) {
      return res.text()
    })
    .then(function (text) {
      // eslint-disable-next-line no-new-func
      self.exports = {}
      eval(text)
      self.m = exports.m
    })
}

var MAX_STREAM_BUFFER_LENGTH = 1024 * 1024
var initTs = 0

var Decoder = function (self) {
  this.inited = false
  this.self = self
  this.meta = self.meta
  this.infolist = []
  self.par_broadwayOnBroadwayInited = this.broadwayOnBroadwayInited.bind(this)
  self.par_broadwayOnPictureDecoded = this.broadwayOnPictureDecoded.bind(this)
}

Decoder.prototype.toU8Array = function (ptr, length) {
  return Module.HEAPU8.subarray(ptr, ptr + length)
}

Decoder.prototype.init = function () {
  Module._broadwayInit()
  this.streamBuffer = this.toU8Array(
    Module._broadwayCreateStream(MAX_STREAM_BUFFER_LENGTH, 0), // 0: 关闭 ffmpeg log,
    MAX_STREAM_BUFFER_LENGTH
  )
}

Decoder.prototype.broadwayOnPictureDecoded = function (
  offset,
  width,
  height,
  yLinesize,
  uvLinesize,
  infoid,
  keyFrame
) {
  let firstFrame = this.infolist[0]
  if (firstFrame && firstFrame.keyframe && !keyFrame) return

  let info = Object.assign({}, this.infolist.shift())
  let yRowcount = height
  let uvRowcount = height / 2
  if (
    this.meta &&
    (this.meta.chromaFormat === 444 || this.meta.chromaFormat === 422)
  ) {
    uvRowcount = height
  }
  var data = this.toU8Array(offset, yLinesize * yRowcount + 2 * (uvLinesize * uvRowcount))
  var datetemp = new Uint8Array(data.length)
  datetemp.set(data)
  var buffer = datetemp.buffer

  this.self.postMessage(
    {
      msg: 'DECODED',
      width,
      height,
      yLinesize,
      uvLinesize,
      info,
      buffer
    },
    [buffer]
  )
}

Decoder.prototype.broadwayOnBroadwayInited = function () {
  this.inited = true
  var cost = 0
  if (initTs) {
    cost = performance.now() - initTs
  }
  this.self.postMessage({ msg: 'DECODER_READY', cost })
}

Decoder.prototype.decode = function (data, info) {
  if (info) {
    this.infolist.push(info)
  }
  if (info && info.keyframe) {
    this.infolist = [info]
  }
  this.streamBuffer.set(data)
  Module._broadwayPlayStream(data.length, 0)
}

Decoder.prototype.destroy = function () {
  Module._broadwayExit()
}

Decoder.prototype.updateMeta = function (meta) {
  this.meta = meta
}

var decoder

function onPostRun () {
  decoder = new Decoder(this)
  decoder.init()
}

var WASM_CDN_PATH_PREFIX = ''

function init (url) {
  WASM_CDN_PATH_PREFIX = url.split('/').slice(0, -1).join('/')
  initTs = performance.now()
  var isDegrade = /asm/.test(url)
  if (!decoder) {
    var task
    if (!self.importScripts) {
      task = shimImportScripts(url)
    } else {
      task = new Promise(function (resolve, reject) {
        if (!self.console) {
          self.console = {
            log: function () {},
            warn: function () {},
            info: function () {},
            error: function () {}
          }
        }
        try {
          self.importScripts(url)
          resolve()
        } catch (e) {
          if (e.message.includes("Module scripts don't support importScripts")) {
            return resolve(shimImportScripts(url))
          }
          reject(e)
        }
      })
    }

    task
      .then(function () {
        if (isDegrade) {
          console.log('auto instance Decoder!')
          return new Promise(function (resolve, reject) {
            setTimeout(function () {
              try {
                onPostRun.call(self)
                resolve()
              } catch (e) {
                reject(e)
              }
            })
          })
        }

        return self
          .m({
            instantiateWasm: function (info, receiveInstance) {
              fetch(`${WASM_CDN_PATH_PREFIX}/decoder.wasm.js`)
                .then(res => res.arrayBuffer())
                .then(buffer => {
                  return WebAssembly.instantiate(buffer, info)
                })
                .then(function (result) {
                  return receiveInstance(result.instance)
                })
            }
          })
          .then(function (Mod) {
            self.Module = Mod
            onPostRun.call(self)
          })
      })
      .catch(function (e) {
        self.postMessage({
          msg: 'INIT_FAILED',
          log: e.message
        })
      })
  }
}

self.onmessage = function (e) {
  var data = e.data
  if ((data.msg !== 'init' && data.msg !== 'preload') && !decoder) return
  switch (data.msg) {
    case 'preload':
      init(data.url)
      break
    case 'init':
      self.meta = data.meta
      self.postMessage({
        msg: 'LOG',
        log: 'worker inited'
      })
      init(data.url)
      break
    case 'updatemeta':
      self.meta = data.meta
      decoder.updateMeta(data.meta)
      break
    case 'initDecoder':
      decoder.decode(data.data)
      break
    case 'decode':
      decoder.decode(data.data, data.info)
      break
    case 'finish_flag':
      self.postMessage({
        msg: 'BATCH_FINISH_FLAG'
      })
      break
    case 'destory':
      decoder.destroy()
      break
    default:
      break
  }
}
