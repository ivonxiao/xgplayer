import Plugin, {Events, Util, POSITIONS, Sniffer, STATE_CLASS} from '../../plugin'

class Controls extends Plugin {
  static get pluginName () {
    return 'controls'
  }

  static get defaultConfig () {
    return {
      disable: false,
      autoHide: true, // 是否自动隐藏
      mode: '', // 显示模式， flex和normal
      marginBottom: false, // 控制条是否显示在播放器底部
      initShow: false // 是否初始化的时候就显示
    }
  }

  beforeCreate (args) {
    if (typeof args.player.config.controls === 'boolean') {
      args.config.disable = !args.player.config.controls
    }
    if (!args.config.mode && Sniffer.device === 'mobile') {
      args.config.mode = 'flex'
    }
    if (args.config.marginBottom) {
      args.config.autoHide = false
    }
  }

  afterCreate () {
    const {disable, height, mode, autoHide, marginBottom} = this.config
    if (disable) {
      return
    }

    if (marginBottom) {
      Util.addClass(this.player.root, 'no-overflow-hide')
    }

    mode === 'flex' && this.player.addClass(STATE_CLASS.FLEX_CONTROLS)
    autoHide && this.player.addClass(STATE_CLASS.AUTOHIDE)
    const style = {
      height: `${height}px`
    }
    Object.keys(style).map(key => {
      this.root.style[key] = style[key]
    })
    this.left = this.find('left-grid')
    this.center = this.find('center')
    this.right = this.find('right-grid')
    this.innerRoot = this.find('inner-controls')

    // 切换为小窗状态的时候进度条同步切换
    this.on(Events.MINI_STATE_CHANGE, (isMini) => {
      isMini ? Util.addClass(this.root, 'mini-controls') : Util.removeClass(this.root, 'mini-controls')
    })
  }

  focus () {
    this.player.emit(Events.PLAYER_FOCUS, {autoHide: false})
  }

  unFocus () {
    this.player.emit(Events.PLAYER_FOCUS, {autoHide: true})
  }

  blur () {
    this.player.emit(Events.PLAYER_BLUR, {ignoreStatus: true})
  }

  recoverAutoHide () {
    this.config.autoHide && Util.addClass(this.root, 'control_autohide')
  }

  pauseAutoHide () {
    Util.removeClass(this.root, 'control_autohide')
  }

  show () {
    Util.addClass(this.root, 'show')
  }

  hide () {
    Util.removeClass(this.root, 'show')
  }

  get mode () {
    return this.config.mode
  }

  registerPlugin (plugin, options = {}, name) {
    if (!this.root) {
      return;
    }
    const defaultConfig = plugin.defaultConfig || {}
    if (!options.root) {
      const position = options.config && options.config.position ? options.config.position : defaultConfig.position
      switch (position) {
        case POSITIONS.CONTROLS_LEFT:
          options.root = this.left
          break
        case POSITIONS.CONTROLS_RIGHT:
          options.root = this.right;
          break;
        case POSITIONS.CONTROLS_CENTER:
          options.root = this.center;
          break;
        case POSITIONS.CONTROLS:
          options.root = this.root;
          break;
        default:
          options.root = this.left
      }
      return super.registerPlugin(plugin, options, name)
    }
  }

  destroy () {
  }

  render () {
    if (this.config.disable) {
      return;
    }
    let className = this.config.mode === 'flex' ? 'flex-controls ' : ''
    className += this.config.autoHide ? 'control_autohide' : 'controls_permanent'
    className += this.config.marginBottom ? ' bottom-controls' : ''
    className += this.config.initShow ? ' xgplayer-controls-initshow' : ''
    return `<xg-controls class="xgplayer-controls ${className}" unselectable="on" onselectstart="return false">
    <inner-controls class="inner-controls xg-pos">
      <left-grid class="left-grid">
      </Left-grid>
      <center class="center"></center>
      <right-grid class="right-grid">
      </right-grid>
    </inner-controls>
    </xg-controls>`
  }
}

export default Controls
