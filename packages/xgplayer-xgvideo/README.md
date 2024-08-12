# xgplayer-xgvideo

## 简介

xgplayer-xgvideo模块实现自定义的HTML Element，功能上对齐 HTMLVideoElement, 实现对H264、H265视频编码、AAC音频编码的视频流的解码和渲染播放。此模块需配合 [xgplayer](https://v3.h5player.bytedance.net/) 官方 [flv插件](https://v3.h5player.bytedance.net/plugins/extension/xgplayer-flv.html)、[hls插件](https://v3.h5player.bytedance.net/plugins/extension/xgplayer-hls.html)、MP4插件使用。

这里以`软解播放`代指使用xgplayer-xgvideo实现的自定义元素来播放的播放方式


## 能力介绍

- *H265流播放*
- *H5下防止浏览器播放劫持*
- 配合 xgplayer-flv实现flv直播流播放
- 配合 xgplayer-hls实现hls直播流、点播流播放
- 配合 xgplayer-encrypted-mp4、xgplayer-mp4实现加密、非加密265,264流播放
- H264编码格式支持 
    - 对支持[WebCodec](https://www.w3.org/TR/webcodecs/)的环境通过WebCodec实现解码
    - 不支持WebCodec的环境通过WebAssembly版本ffmpeg H264解码器实现解码
- H265编码格式支持
    - 对支持WebAssembly SIMD的浏览器(chrome >=91)采用simd优化版本解码器解码
    - 对支持SharedArrayBuffer的环境(chrome 70-90)采用多线程版本解码器
    - 单线程版本bytevc1解码器
- AAC、G.711编码格式支持
    - 对支持[MSE](https://www.w3.org/TR/media-source-2/)的环境通过MSE + video方式实现音频播放
    - 对不支持MSE的环境通过WebAudio实现音频播放

## 快速开始

```

// 创建自定义的HTMLElement, 默认元素名为'xg-video'
import XGVideo from "@byted/xgplayer-xgvideo" 

document.createElement('xg-video') // <xg-video></xg-video>

```


### flv直播流播放

```javascript
import Player from "xgplayer"
import FlvPlugin from "xgplayer-flv"
import XGVideo from "@byted/xgplayer-xgvideo"
import "xgplayer/dist/xgplayer.min.css"

if(!XGVideo.isSupported()){
    alert('not supported')
}

const player = new Player({
    url,
    id,
    isLive: true,
    autoplay: true,
    plugins: [FlvPlugin],
    mediaType: 'xg-video'
})

player.on('canplay', ()=>{
    // do something
})

```

### hls流播放
```javascript
import Player from "xgplayer"
import HlsPlugin from "xgplayer-hls"
import XGVideo from "@byted/xgplayer-xgvideo"
import "xgplayer/dist/xgplayer.min.css"

if(!XGVideo.isSupported()){
    alert('not supported')
}

const player = new Player({
    url,
    id,
    isLive: true, // 直播流true、点播流false
    autoplay: true,
    plugins: [HlsPlugin],
    mediaType: 'xg-video'
})

```

## 与插件配合

xgplayer-flv、xgplayer-hls默认采用MSE + video实现播放，当播放配置指定`mediaType:'软解播放元素'`时解码和渲染工作由软解播放元素接管

```javascript
import Player from "xgplayer"
import FlvPlugin from "xgplayer-flv"
import XGVideo from "@byted/xgplayer-xgvideo"
import "xgplayer/dist/xgplayer.min.css"


// 先检测是否支持
if(!XGVideo.isSupported()) {
    alert('not supported')
}

const player = new Player({
    url,
    id,
    isLive: true
    autoplay: true,
    plugins: [FlvPlugin],
    mediaType: 'xg-video',
    flv: {
        loadTime: 5000,
        retryCount: 2,
        targetLatency: 3,
        innerDegrade: 1,
        backupURL: 'xxx.m3u8'
    }
})

```

flv、hls播放指定的配置参数、事件等说明见官方 [flv插件](https://v3.h5player.bytedance.net/plugins/extension/xgplayer-flv.html#api)、[hls插件](https://v3.h5player.bytedance.net/plugins/extension/xgplayer-hls.html#api)

### 降级控制

软解播放可能因为解码效率过低导致播放卡顿、解码出错，flv、hls插件内置了降级逻辑，可以自动降级到video播放(`目前只支持降级到video元素直接播放m3u8，用于H5下`)。 配置如下

| 属性名 | 取值 | 说明 |
| ------ | -------- | ----- |
| innerDegrade | 1 | 指定降级到video播放m3u8，用于h5下，需要同时指定backupURL,指定一个m3u8地址 |
| backupURL | hls播放地址 | 指定一个降级的m3u8地址 |



## 静态方法

#### isSupported
> 检测软解播放是否支持，取决于环境对WebAssembly、Webgl的支持情况以及播放过程中的降级情况.

**每次实例化新播放器之前都要先判断是否支持，因为当前播放实例可能解码效率过低、播放出错等原因禁止后续对软解的使用**

可能导致不能让软解继续使用的原因包括

- flv、hls插件指定了配置参数innerDegrade && 播放过程中解码效率持续低于帧率 (默认大约5s)

- 由于解码器初始化、worker出错、webgl 实例化出错、音频播放出错等导致的 error发生

- XGVideo.setDecodeCapacity({disabledByLowdecodePrecent: 0.6}) 设置了此值，并且解码效率不足的播放VV / 播放VV >  disabledByLowdecodePrecent

```typescript

static isSupported: () => boolean


function createPlayer () {
    return new Player({
        id,
        url,
        plugins: [FlvPlugin],
        mediaType: XGVideo.isSupported() ? 'xg-video' : 'video'
    })

}

```


### setDecodeCapacity
> 开放一些解码相关的自定义配置

```typescript

static setDecodeCapacity: (capacity) => boolean

XGVideo.setDecodeCapacity({
    preloadDecoder: 'h265',
    wasmFallbackToAsm: false
})

```

可配置的能力

| 配置字段 | 默认值 | 含义 |
| ------ | -------- | ----- |
| preloadDecoder | false | 预加载和初始化解码器，可设置 'h264'、'h265', 在初始化播放之前并行加载解码器 |
| reuseWasmDecoder | true | 切换流地址、销毁播放实例后再新建等场景下是否复用已有的解码器worker |
| h264WithWebcodec | true | 对支持webcodec的环境通过webcodec解码H264流 |
| wasmFallbackToAsm | true | wasm初始化、解码出错、worker出错时候降级到asm版本解码器 |
| audioWithMse | true | 对支持Mse的环境通过 video+MSE 播放音频 |
| reuseMseForAudio | false | 多个播放实例时 复用音频播放的video+MSE |
| preciseSeek | 0 | 对视频时长 < 指定值(单位s) 的视频开启精准seek |
| evaluateVVCount | 0 | 评估播放次数, N次播放中解码不足占比超过一定阈值，当前单页内禁用 |
| disabledWhenErrorOccur | true | 播放发生错误时，是否禁用后续软解使用 |
| disabledByLowdecodePrecent | 0.5 | 解码效率不足的播放VV / 播放VV > 此设置值时，后续播放禁用软解，isSupported() 返回 false |
| lowDecodeThreshold | 100 | 评判解码效率不足，播放过程中每5帧解码的数据计算一次解码效率的平均值(decodeFps), decodeFps < fps 当做一次解码效率不足。连续解码效率不足的次数 > lowDecodeThreshold / 5 时，对外抛出解码不足事件。 以默认值100,帧率25fps为例，大约 100 / 25 = 4s 连续的解码效率不足时对外抛事件 |
| disabledDuration| 300 * 12 // 12h | 非永久禁用下的禁用时间 |


### getDeviceCapacity
> 获取浏览器环境和解码相关的几个能力支持状态

```typescript

type DeviceCapacity = {
    simd: boolean, // 当前浏览器是否支持simd模式解码
    thread: boolean, // 当前浏览器是否支持多线程模式解码
    nbCpu: number, // 当前设备的逻辑cpu数量 (4核8线程、6核12线程等)
}

static getDeviceCapacity: () => DeviceCapacity

```

**使用方可以根据这几个字段的支持情况大体划分高、中端机**


### genDecoder
> 初始化一个解码器

```typescript

static genDecoder: ('h264' | 'h265') => Promise<void>

```


#### init
> 指定H264、H265解码器文件cdn地址, `内部包不需要使用方自己指定`

```typescript

type Resource = {
    h264Url: string,
    h264AsmUrl: string,
    h265Url: string,
    h265ThreadUrl: string,
    h265SimdUrl: string,
    h265AsmUrl: string
}

static init: (re: Resource) => boolean

```

#### setEleName
> 指定软解播放元素标签名，默认为*xg-video*, 配合xgplayer在页面创建 `<xg-video></xg-video>`元素用于播放

```typescript

static setEleName: (name: string) => void

```

```javascript
import XGVideo from "@byted/xgplayer-xgvideo"

XGVideo.setEleName('test-video')

new Player({
    mediaType:'test-video'
})

```

## 事件

自定义元素事件触发对齐video元素，包括

- `loadedmetadata`
- `loadeddata`
- `canplay`
- `play`
- `playing`
- `waiting`
- `pause`
- `seeking`
- `seeked`
- `timeupdate`
- `durationchange`
- `volumechange`
- `progress`
- `error`
- `ended`
- `resize`

这些事件会经过xgplayer代理，通过`player.on()` `player.off()` 监听和卸载，具体见[媒体事件](媒体事件)

除此之外，新增lowdecode事件

### 解码效率低事件

触发场景：

1. 解码效率过低不足矣支持播放时触发
2. 播放配置中指定了innerDegrade参数，当解码出错时触发，报错信息存在如下msg字段中。如果不指定内部降级，解码出错以error事件形式抛出

```typescript

type LowDecodeEvent = {
    decodeFps: string, // 当前解码效率
    bitrate: // 视频码率,
    wasmInitCost: // wasm初始化耗时,加载 + 实例化,
    fps: // 视频帧率,
    url: // 流地址,
    msg?: // 软解出错信息
    decoderMode: // 当前解码器模式
}

player.on('lowdecode', (e: LowDecodeEvent) => {

    // 或者 player.video.getStats() 获取播放统计信息

})
```

### error事件

监听到error事件时，可以通过player.video.error获取错误信息

```typescript

type XGVideoError = {
    code: 3,
    subCode: SubCode,
    message: string
}

type SubCode = 
1 |   // 解码器加载失败、解码worker出错等
2 |  // webgl context初始化失败
3 // 音频播放失败

xgvideo.addEventListener('error', () => {
    // xgvideo.error
})

```



## 属性

自定义元素属性触发对齐video元素，包括

- `autoplay`
- `videoWidth`
- `videoHeight`
- `currentTime`
- `duration`
- `volume`
- `muted`
- `paused`
- `seeking`
- `buffered`
- `ended`
- `readyState`

除此之外，新增如下属性

| 属性名 | 类型 | 含义 |
| ------ | -------- | ----- |
| decodeFps | number | 最近10帧视频的平均解码效率，反应设备解码性能 |
| decodeCost | number | 最近一帧的解码耗时 |
| bitrate | number | 最近30帧视频的平均码率 |
| fps | number | 视频帧率 |

```javascript

// player.video.decodeFps
// player.video.bitrate

```

### getStats()
> 获取视频起播各阶段耗时统计、码率、帧率、分辨率、解码效率等信息，播放过程中可以按频率获取，用于埋点上报等

```typescript

type PlayStatus = {
    width: number,
    height: number,
    bitrate: number,
    decodeFps: number,
    fps: number,
    decoderMode: DecoderMode,
    vv: number,
    lowdecodeVV: number,
    currentLowDecodeCount: number,
    h265FailureRate: number,
    bootStats: Array<{action:BootStat, dot: number}>
}

enum DecoderMode {
    THREAD: 1,
    SIMD: 2,
    NORMAL: 3
}

enum BootStat {
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


player.video.getStats(): PlayStatus

```

#### PlayStatus 字段说明

| 属性名 | 类型 | 含义 |
| ------ | -------- | ----- |
| width | number | 视频分辨率宽度 |
| height | number | 视频分辨率高度 |
| bitrate | number | 最近1s下载视频的平均码率 |
| decodeFps | number | 最近5帧画面的平均解码效率 |
| fps | number | 视频帧率 |
| decoderMode | number | 解码器模式，1: thread, 2: simd |
| vv | number | 当前用户播放量 |
| lowdecodeVV | number | 当前用户解码效率不足播放数 |
| currentLowDecodeCount | number | 当前视频解码效率不足次数 |
| h265FailureRate | number | 播放上面 setDecodeCapacity()中设置evaluateVVCount次视频后，计算降级率 |
| bootStats | BootStat | 首帧前xgVideo内部各阶段耗时统计 |


#### BootStat 阶段说明

| 阶段  | 含义 |
| ------ | ----- |
| FIRST_DATA |  xgvideo播放实例第一次接受到数据 |
| AUDIO_MSE_OPEN_START | 音频播放的内部video元素开始和mse实例绑定 |
| AUDIO_MSE_OPEND |  音频播放的mse实例触发open事件 |
| AUDIO_FIRSTTIME_APPENDED |  音频播放第一次数据添加完成 |
| AUDIO_READY |  音频播放准备完成 |
| WASM_WORKER_INIT | wasm解码器worker开始初始化 |
| WASM_WORKER_READY | wasm解码器worker初始化完成 |
| FIRST_FRAME_TODECODE | 视频首帧开始解码 |
| VIDEO_READY | 视频首帧解码完成 |
| FIRST_FRAME | 首帧展示完成 |
| WAITIGN | 播放触发waiting时触发 |
| SEEKING | 播放触发seek时触发 |
| SEEKED | 播放seek后开始播放触发|


### getSeekElapses
> 获取播放进度seek到seek完成的耗时，数组结构




## 解码效率

### [使用注意点](https://bytedance.feishu.cn/docs/doccnIHDdHiddyZoWBTyAwMGTec)