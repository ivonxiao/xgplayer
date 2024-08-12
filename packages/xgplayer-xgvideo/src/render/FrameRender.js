import { logger } from '../utils'

class FrameRenderCache {
  _queue = []

  TAG = 'FrameRenderCache'

  // canvas 通过glInstance属性与gl context绑定
  cacheCvs (cvs) {
    this._queue.push(cvs)
    logger.log(this.TAG, 'cache canvas!')
  }

  getCachedCvs () {
    const cvs = this._queue.pop()
    if (cvs) {
      logger.log(this.TAG, 'get cached canvas!')
    }
    return cvs
  }
}

const frameRenderCache = new FrameRenderCache()

export default frameRenderCache

class FrameRender {
  constructor (configs, parent) {
    this.TAG = 'FrameRender'
    this.configs = Object.assign({}, configs)
    this.parent = parent
    this.canvas = this.configs.canvas
    this.canvas.glInstance = this
    this.meta = Object.assign({}, this.configs.meta)
    this.frameRenderCache = frameRenderCache
    this._initMeta()
    this._initContextGL()
    if (this.contextGL) {
      this._initProgram()
      this._initBuffers()
      this._initTextures()
    }
  }

  _initMeta () {
    this.chroma = this.meta.chromaFormat
    this.height = this.meta.height
    this.width = this.meta.width
    if (this.canvas.width !== this.meta.width || this.canvas.height !== this.meta.height) {
      this.canvas.width = this.meta.width
      this.canvas.height = this.meta.height
      this.parent.emitResizeEvent()
    }
  }

  _initContextGL () {
    if (this.configs.type === '2d') {
      this.ctx = this.canvas.getContext('2d')
      return
    }
    const canvas = this.canvas
    let gl = null

    const validContextNames = ['webgl', 'experimental-webgl', 'moz-webgl', 'webkit-3d']
    let nameIndex = 0

    while (!gl && nameIndex < validContextNames.length) {
      const contextName = validContextNames[nameIndex]

      try {
        gl = canvas.getContext(contextName, this.configs.glCtxOptions)
        logger.log('FrameRender', 'use=', contextName, this.configs.glCtxOptions)
        break
      } catch (e) {
        gl = null
      }

      if (!gl || typeof gl.getParameter !== 'function') {
        gl = null
      }

      ++nameIndex
    }

    this.contextGL = gl
  }

  _initProgram () {
    const gl = this.contextGL

    // vertex shader is the same for all types
    const vertexShaderScript = [
      'attribute vec4 vertexPos;',
      'attribute vec4 texturePos;',
      'attribute vec4 uTexturePos;',
      'attribute vec4 vTexturePos;',
      'varying vec2 textureCoord;',
      'varying vec2 uTextureCoord;',
      'varying vec2 vTextureCoord;',

      'void main()',
      '{',
      '  gl_Position = vertexPos;',
      '  textureCoord = texturePos.xy;',
      '  uTextureCoord = uTexturePos.xy;',
      '  vTextureCoord = vTexturePos.xy;',
      '}'
    ].join('\n')

    const fragmentShaderScript = [
      'precision highp float;',
      'varying highp vec2 textureCoord;',
      'varying highp vec2 uTextureCoord;',
      'varying highp vec2 vTextureCoord;',
      'uniform sampler2D ySampler;',
      'uniform sampler2D uSampler;',
      'uniform sampler2D vSampler;',
      'uniform mat4 YUV2RGB;',

      'void main(void) {',
      '  highp float y = texture2D(ySampler,  textureCoord).r;',
      '  highp float u = texture2D(uSampler,  uTextureCoord).r;',
      '  highp float v = texture2D(vSampler,  vTextureCoord).r;',
      '  gl_FragColor = vec4(y, u, v, 1) * YUV2RGB;',
      '}'
    ].join('\n')

    const YUV2RGB = [1.16438, 0.0, 1.59603, -0.87079, 1.16438, -0.39176, -0.81297, 0.52959, 1.16438, 2.01723, 0.0, -1.08139, 0, 0, 0, 1]
    const vertexShader = gl.createShader(gl.VERTEX_SHADER)
    gl.shaderSource(vertexShader, vertexShaderScript)
    gl.compileShader(vertexShader)
    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      console.log('Vertex shader failed to compile: ' + gl.getShaderInfoLog(vertexShader))
    }

    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)
    gl.shaderSource(fragmentShader, fragmentShaderScript)
    gl.compileShader(fragmentShader)
    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      console.log('Fragment shader failed to compile: ' + gl.getShaderInfoLog(fragmentShader))
    }

    const program = gl.createProgram()
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.log('Program failed to compile: ' + gl.getProgramInfoLog(program))
    }

    gl.useProgram(program)

    const YUV2RGBRef = gl.getUniformLocation(program, 'YUV2RGB')
    gl.uniformMatrix4fv(YUV2RGBRef, false, YUV2RGB)

    this.shaderProgram = program
  }

  _initBuffers () {
    const gl = this.contextGL
    const program = this.shaderProgram

    const vertexPosBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexPosBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([1, 1, -1, 1, 1, -1, -1, -1]), gl.STATIC_DRAW)

    const vertexPosRef = gl.getAttribLocation(program, 'vertexPos')
    gl.enableVertexAttribArray(vertexPosRef)
    gl.vertexAttribPointer(vertexPosRef, 2, gl.FLOAT, false, 0, 0)

    const texturePosBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, texturePosBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([1, 0, 0, 0, 1, 1, 0, 1]), gl.STATIC_DRAW)

    const texturePosRef = gl.getAttribLocation(program, 'texturePos')
    gl.enableVertexAttribArray(texturePosRef)
    gl.vertexAttribPointer(texturePosRef, 2, gl.FLOAT, false, 0, 0)

    this.texturePosBuffer = texturePosBuffer

    const uTexturePosBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, uTexturePosBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([1, 0, 0, 0, 1, 1, 0, 1]), gl.STATIC_DRAW)

    const uTexturePosRef = gl.getAttribLocation(program, 'uTexturePos')
    gl.enableVertexAttribArray(uTexturePosRef)
    gl.vertexAttribPointer(uTexturePosRef, 2, gl.FLOAT, false, 0, 0)

    this.uTexturePosBuffer = uTexturePosBuffer

    const vTexturePosBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, vTexturePosBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([1, 0, 0, 0, 1, 1, 0, 1]), gl.STATIC_DRAW)

    const vTexturePosRef = gl.getAttribLocation(program, 'vTexturePos')
    gl.enableVertexAttribArray(vTexturePosRef)
    gl.vertexAttribPointer(vTexturePosRef, 2, gl.FLOAT, false, 0, 0)

    this.vTexturePosBuffer = vTexturePosBuffer
  }

  _initTextures () {
    const gl = this.contextGL
    const program = this.shaderProgram
    const yTextureRef = this._initTexture()
    const ySamplerRef = gl.getUniformLocation(program, 'ySampler')
    gl.uniform1i(ySamplerRef, 0)
    this.yTextureRef = yTextureRef

    const uTextureRef = this._initTexture()
    const uSamplerRef = gl.getUniformLocation(program, 'uSampler')
    gl.uniform1i(uSamplerRef, 1)
    this.uTextureRef = uTextureRef

    const vTextureRef = this._initTexture()
    const vSamplerRef = gl.getUniformLocation(program, 'vSampler')
    gl.uniform1i(vSamplerRef, 2)
    this.vTextureRef = vTextureRef

    // fix WebGL: INVALID_OPERATION: texImage2D: ArrayBufferView not big enough for request
    //  texture bound to texture unit 1 is not renderable. It might be non-power-of-2 or have incompatible texture filtering (maybe)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
  }

  _initTexture () {
    const gl = this.contextGL

    const textureRef = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, textureRef)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.bindTexture(gl.TEXTURE_2D, null)

    return textureRef
  }

  _drawPictureGL (data, width, height, yLinesize, uvLinesize) {
    const ylen = yLinesize * height
    let uvlen = (uvLinesize * height) / 2
    if (this.chroma === 444 || this.chroma === 422) {
      uvlen *= 2
    }
    data = new Uint8Array(data)
    const renderData = {
      yData: data.subarray(0, ylen),
      uData: data.subarray(ylen, ylen + uvlen),
      vData: data.subarray(ylen + uvlen, ylen + uvlen + uvlen)
    }
    this._drawPictureGL420(renderData, width, height, yLinesize, uvLinesize)
  }

  _drawPictureGL420 (data, width, height, yLinesize, uvLinesize) {
    const gl = this.contextGL
    const texturePosBuffer = this.texturePosBuffer
    const uTexturePosBuffer = this.uTexturePosBuffer
    const vTexturePosBuffer = this.vTexturePosBuffer

    const yTextureRef = this.yTextureRef
    const uTextureRef = this.uTextureRef
    const vTextureRef = this.vTextureRef

    const yData = data.yData
    const uData = data.uData
    const vData = data.vData

    const yDataPerRow = yLinesize
    const yRowCnt = height

    const uDataPerRow = uvLinesize
    let uRowCnt = height / 2

    if (this.chroma === 422 || this.chroma === 444) {
      uRowCnt = height
    }

    const vDataPerRow = uvLinesize
    const vRowCnt = uRowCnt

    const ratiow = this.canvas.width / this.width
    const ratioh = this.canvas.height / this.height
    let left = 0
    let top = 0
    let w = this.canvas.width
    let h = this.canvas.height
    if (ratiow < ratioh) {
      h = (this.height * this.canvas.width) / this.width
      top = parseInt((this.canvas.height - (this.height * this.canvas.width) / this.width) / 2)
    } else {
      w = (this.width * this.canvas.height) / this.height
      left = parseInt((this.canvas.width - (this.width * this.canvas.height) / this.height) / 2)
    }
    gl.viewport(left, top, w, h)

    const texturePosValues = new Float32Array([1, 0, 0, 0, 1, 1, 0, 1])
    gl.bindBuffer(gl.ARRAY_BUFFER, texturePosBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, texturePosValues, gl.DYNAMIC_DRAW)

    const uTexturePosValues = new Float32Array([1, 0, 0, 0, 1, 1, 0, 1])
    gl.bindBuffer(gl.ARRAY_BUFFER, uTexturePosBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, uTexturePosValues, gl.DYNAMIC_DRAW)

    const vTexturePosValues = new Float32Array([1, 0, 0, 0, 1, 1, 0, 1])
    gl.bindBuffer(gl.ARRAY_BUFFER, vTexturePosBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, vTexturePosValues, gl.DYNAMIC_DRAW)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, yTextureRef)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, yDataPerRow, yRowCnt, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, yData)

    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, uTextureRef)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, uDataPerRow, uRowCnt, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, uData)

    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, vTextureRef)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, vDataPerRow, vRowCnt, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, vData)

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  _drawPicture2d (data) {
    if (!data) {
      return
    }
    if (this.canvas) {
      if (!this.ctx) {
        this.ctx = this.canvas.getContext('2d')
      }
      const width = data.displayWidth || data.width
      const height = data.displayHeight || data.height
      if (this.canvas.height !== height || this.canvas.width !== width) {
        this.canvas.height = height
        this.canvas.width = width
      }
      try {
        this.ctx.drawImage(data.dom || data, 0, 0, width, height)
      } catch (error) {
        console.error(this.TAG, '_drawPicture2d', data, data.dom, error, error.message)
      }
    }
  }

  _resize (width, height) {
    if (this.width !== width || this.height !== height) {
      this.width = width
      this.height = height
      this.canvas.width = width
      this.canvas.height = height
      this.parent.emitResizeEvent()
    }
  }

  render (data, width, height, yLinesize, uvLinesize) {
    this._resize(width, height)
    const gl = this.contextGL
    if (gl) {
      this._drawPictureGL(data, width, height, yLinesize, uvLinesize)
    } else {
      this._drawPicture2d(data)
    }
  }

  resetMeta (meta) {
    this.meta = Object.assign({}, meta)
  }

  updateBind (parent, meta) {
    this.parent = parent
    this.resetMeta(meta)
  }

  destroy (disconnect) {
    this.parent = null
    this.canvas.style.display = 'none'
    if (disconnect) {
      if (this.contextGL) {
        this.contextGL.clear(this.contextGL.DEPTH_BUFFER_BIT | this.contextGL.COLOR_BUFFER_BIT)
      }
      frameRenderCache.cacheCvs(this.canvas)
    }
  }
}

export { FrameRender }
