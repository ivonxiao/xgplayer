
export const VIDEO_EVENTS = {
  WAITING: 0,
  CANPLAY: 1,
  PLAY: 2,
  PLAYING: 3,
  PAUSE: 4,
  SEEKING: 5,
  SEEKED: 6,
  LOADEDDATA: 7,
  LOADEDMETADATA: 8,
  TIMEUPDATE: 9,
  DURATION_CHANGE: 10,
  VOLUME_CHANGE: 11,
  PROGRESS: 12,
  ERROR: 13,
  ENDED: 14,
  RESIZE: 15,
  LOADSTART: 16,
  // 自定义
  DECODE_FPS: 17,
  LOW_DECODE: 18,
  LARGE_AV_GAP: 19,
  FIRST_FRAME: 20
}

export const VIDEO_EVENTS_ARR = [
  'waiting',
  'canplay',
  'play',
  'playing',
  'pause',
  'seeking',
  'seeked',
  'loadeddata',
  'loadedmetadata',
  'timeupdate',
  'durationchange',
  'volumechange',
  'progress',
  'error',
  'ended',
  'resize',
  'loadstart',
  // 自定义
  'decodefps',
  'lowdecode',
  'largeavgap',
  'firstframe'
]

export default {
  AUDIO: {
    AUDIO_READY: 'audio_ready',
    AUDIO_NOT_ALLOWED_AUTOPLAY: 'audio_not_allowed_autoplay',
    AUDIO_WAITING: 'audio_waiting',
    AUDIO_SYNC_DTS: 'audio_sync_dts'
  },
  VIDEO: {
    VIDEO_DECODER_INIT: 'video_decode_init',
    VIDEO_READY: 'video_ready',
    VIDEO_WAITING: 'video_waiting',
    AUTO_RUN: 'auto_run',
    DECODE_LOW_FPS: 'decode_low_fps',
    UPDATE_VIDEO_FILLTYPE: 'update_video_filltype',
    UPDATE_VIDEO_COVER_POSITION: 'update_video_cover_position'
  },
  TIMELINE: {
    PLAY_EVENT: 'play_event',
    SET_METADATA: 'set_metadata',
    APPEND_CHUNKS: 'append_chunks',
    START_RENDER: 'start_render',
    DO_PLAY: 'do_play',
    DO_PAUSE: 'do_pause',
    DO_SEEK: 'do_seek',
    SET_PLAYBACKRATE: 'set_playbackrate',
    SYNC_DTS: 'sync_dts',
    RESET_BASE_DTS: 'reset_base_dts',
    UPDATE_VOLUME: 'update_volume',
    SINGLE_TRACK: 'single_track',
    DESTROY: 'destroy',
    READY: 'ready',
    UPDATE_GL_OPTIONS: 'update_gl_options',
    SET_VIDEO_DURATION: 'set_video_duration',
    SET_PLAY_MODE: 'set_play_mode', // vod、live
    UPDATE_CAPABILITY_LEVEL: 'update_capability_level',
    INNER_DEGRADE: 'inner_degrade',
    ADJUST_SEEK_TIME: 'adjust_seek_time',
    CHASE_FRAME: 'chase_frame',
    END_OF_STREAM: 'end_of_stream',
    UPDATE_SEGMENT_END: 'update_segment_end'
  },
  VIDEO_EVENTS: VIDEO_EVENTS,
  DECODE_EVENTS: {
    INIT: 'init',
    READY: 'decoderready',
    REMUX: 'remux',
    INIT_FAILED: 'initfailed',
    DATAREADY: 'dataReady',
    PLAY_FAILED: 'playfailed',
    FRAGMENT_END: 'fragmentEnd',
    APPEND_VIDEO: 'appendVideo',
    FIRST_FRAME: 'firstFrame',
    DECODED: 'decoded',
    RENDE_END: 'rendeEnd',
    CHASE_VIDEO_FRAME: 'chaseVideoFrame',
    CHASE_VIDEO_FRAME_END: 'chaseVideoFrameEnd',
    CHASE_AUDIO_FRAME: 'chaseAudioFrame',
    INIT_SEGMENT: 'initSegment',
    MEDIA_SEGMENT: 'mediaSegment',
    FRAME_MAX_COUNY: 'frameMaxCount',
    FRAME_MIN_COUNY: 'frameMinCount'
  }
}
