/* eslint-disable func-call-spacing */
/* eslint-disable no-new-func */
/* eslint-disable no-eval */
/* eslint-disable no-undef */
// 目前仅支持yuv420

function shimImportScripts (src) {
  return fetch(src)
    .then(function (res) {
      return res.text()
    })
    .then(function (text) {
      self.exports = {}
      eval(text)
      self.m = exports.m
    })
}

var MAX_STREAM_BUFFER_LENGTH = 1024 * 1024 * 3
var initTs = 0

var Decoder = function (self) {
  this.inited = false
  this.infoId = 0
  this.self = self
  this.meta = this.self.meta
  this.ts = 0
  this.infolist = []
  self.par_broadwayOnBroadwayInited = this.broadwayOnBroadwayInited.bind(this)
  self.par_broadwayOnPictureDecoded = this.broadwayOnPictureDecoded.bind(this)
}

Decoder.prototype.toU8Array = function (ptr, length) {
  return Module.HEAPU8.subarray(ptr, ptr + length)
}

Decoder.prototype.init = function () {
  Module._broadwayInit(0, 1)
  this.offset = Module._broadwayCreateStream(MAX_STREAM_BUFFER_LENGTH)
}

Decoder.prototype.broadwayOnPictureDecoded = function (
  offset,
  width,
  height,
  infoid,
  sliceType
) {
  var info = this.infolist.shift()
  var yRowcount = height
  var uvRowcount = height / 2
  var yLinesize = width
  var uvLinesize = width / 2
  if (this.meta && (this.meta.chromaFormat === 444 || this.meta.chromaFormat === 422)) {
    uvRowcount = height
  }
  if (info && info.preciseSeek) {
    if (!info.output) return
  }

  var data = this.toU8Array(offset, yLinesize * yRowcount + 2 * (uvLinesize * uvRowcount))
  // this.infolist[infoid] = null;
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
  if (this.inited) {
    return
  }
  this.inited = true
  var cost = 0
  if (initTs) {
    cost = performance.now() - initTs
  }
  this.self.postMessage({ msg: 'DECODER_READY', cost })
}

Decoder.prototype.decode = function (data, info) {
  let time = parseInt(new Date().getTime())
  let infoid = time - Math.floor(time / 10e8) * 10e8
  this.infolist.push(info)
  if (info && info.keyframe) {
    this.infolist = [info]
    Module._broadwayFlushStream(infoid)
  }
  Module.HEAPU8.set(data, this.offset)
  Module._broadwayPlayStream(data.length, this.infoId)
}

Decoder.prototype.flush = function () {
  Module._broadwayFlushStream()
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

        if (self.m) {
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
        }

        return new Promise(function (resolve, reject) {
          addOnPostRun(onPostRun.bind(self))

          Module.onRuntimeInitialized = function () {
            resolve()
          }

          Module.onAbort = function (e) {
            reject(e && e.message ? e : new Error('wasm init error'))
          }

          setTimeout(function () {
            reject(new Error('wasm load timeout'))
          }, 6000)
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
  if (!data.msg) {
    self.postMessage({
      msg: 'ERROR:invalid message'
    })
  } else {
    if (data.msg !== 'init' && data.msg !== 'preload' && !decoder) return
    switch (data.msg) {
      case 'preload':
        init(data.url)
        break
      case 'init':
        self.meta = data.meta
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
      case 'flush':
        decoder.flush()
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
}
