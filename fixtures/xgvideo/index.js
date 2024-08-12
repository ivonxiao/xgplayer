import Player from 'xgplayer'
import FlvPlugin from 'xgplayer-flv'
// import XGVideo from '../../packages/xgplayer-xgvideo/src/index'

if (!XGVideo.isSupported()) {
  alert('not supported')
}

window.player = new Player({
  url: 'http://127.0.0.1/assets/flv-audio/opus-x264-sintel-1280.mp4.flv',
  id: 'video',
  isLive: false,
  autoplay: true,
  plugins: [FlvPlugin],
})
