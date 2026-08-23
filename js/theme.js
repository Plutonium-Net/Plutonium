const Theme = (() => {
  const DEFAULT_STATE = window.BrowserThemeState
    ? BrowserThemeState.DEFAULT_THEME_STATE
    : { mode: 'dark', accentColor: '#4285f4', bgPreset: 'minimal' }

  function loadState() {
    return window.BrowserThemeState
      ? BrowserThemeState.loadThemeState()
      : { ...DEFAULT_STATE }
  }

  function saveState(patch) {
    return window.BrowserThemeState
      ? BrowserThemeState.saveThemeState(patch)
      : { ...loadState(), ...patch }
  }

  function getBackgroundPreset(key) {
    return window.BrowserThemeState
      ? BrowserThemeState.getBackgroundPreset(key)
      : {
          key: DEFAULT_STATE.bgPreset,
          label: 'Minimal',
          url: '',
          preview: '',
          dark: { base: '#16181b', surface: '#22262b', surface2: '#1c2024', accent: '#7dd3fc' },
          light: { base: '#eef2f7', surface: '#ffffff', surface2: '#e8edf4', accent: '#3b82f6' },
        }
  }

  function clamp(value) {
    return Math.max(0, Math.min(255, value))
  }

  function hexToRgb(hex) {
    const safe = String(hex || '#000000').trim()
    return {
      r: parseInt(safe.slice(1, 3), 16),
      g: parseInt(safe.slice(3, 5), 16),
      b: parseInt(safe.slice(5, 7), 16),
    }
  }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(value => clamp(Math.round(value)).toString(16).padStart(2, '0')).join('')
  }

  function rgba(hex, alpha) {
    const { r, g, b } = hexToRgb(hex)
    return `rgba(${r},${g},${b},${alpha})`
  }

  function mixHex(a, b, amount) {
    const first = hexToRgb(a)
    const second = hexToRgb(b)
    const weight = Math.max(0, Math.min(1, amount))
    return rgbToHex(
      first.r + (second.r - first.r) * weight,
      first.g + (second.g - first.g) * weight,
      first.b + (second.b - first.b) * weight
    )
  }

  function hexToHsl(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255
    const g = parseInt(hex.slice(3, 5), 16) / 255
    const b = parseInt(hex.slice(5, 7), 16) / 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    let h = 0
    let s = 0
    const l = (max + min) / 2
    if (max !== min) {
      const d = max - min
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break
        case g: h = (b - r) / d + 2; break
        default: h = (r - g) / d + 4
      }
      h /= 6
    }
    return { h: h * 360, s, l }
  }

  function hslToHex(hue, sat, light) {
    const h = (((hue % 360) + 360) % 360) / 360
    const s = Math.max(0, Math.min(1, sat))
    const l = Math.max(0, Math.min(1, light))
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    const channel = t => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1 / 6) return p + (q - p) * 6 * t
      if (t < 1 / 2) return q
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
      return p
    }
    const r = Math.round(channel(h + 1 / 3) * 255)
    const g = Math.round(channel(h) * 255)
    const b = Math.round(channel(h - 1 / 3) * 255)
    return rgbToHex(r, g, b)
  }

  // Semantic status colors: canonical hues (red / green / amber) that inherit
  // the accent's saturation and adapt lightness to the mode, so they always
  // read correctly while staying part of the theme's palette.
  function semanticColors(accent, isLight) {
    const { s: accentSat } = hexToHsl(accent)
    const sat = Math.max(0.55, Math.min(0.85, accentSat))
    return {
      danger: hslToHex(0, sat, isLight ? 0.42 : 0.6),
      success: hslToHex(140, sat, isLight ? 0.38 : 0.56),
      warn: hslToHex(45, sat, isLight ? 0.44 : 0.62),
    }
  }

  function applyVars(vars) {
    const root = document.documentElement
    Object.entries(vars).forEach(([key, value]) => root.style.setProperty(key, value))
  }

  function buildVarsFromPalette(palette, mode, accentOverride) {
    const accent = accentOverride || palette.accent
    const isLight = mode === 'light'
    const base = palette.base
    const surface = palette.surface
    const surface2 = palette.surface2 || mixHex(base, surface, 0.55)
    const text = isLight ? '#000000' : '#ffffff'
    const textSub = isLight ? 'rgba(0,0,0,0.74)' : 'rgba(255,255,255,0.72)'
    const textMuted = isLight ? 'rgba(0,0,0,0.54)' : 'rgba(255,255,255,0.48)'
    const textDim = isLight ? 'rgba(0,0,0,0.42)' : 'rgba(255,255,255,0.38)'
    const border = isLight ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.12)'
    const borderSub = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'
    const divider = isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.15)'
    const hoverColor = isLight ? '#000000' : '#ffffff'
    const tintTarget = isLight ? '#ffffff' : accent

    return {
      '--ui-base': base,
      '--ui-base-rgb': `${hexToRgb(base).r},${hexToRgb(base).g},${hexToRgb(base).b}`,
      '--ui-surface': surface,
      '--ui-surface-2': surface2,
      '--ui-surface-3': rgba(mixHex(surface, tintTarget, isLight ? 0.06 : 0.1), isLight ? 0.92 : 0.94),
      '--ui-surface-4': rgba(mixHex(base, surface, 0.72), isLight ? 0.98 : 0.97),
      '--ui-surface-5': rgba(mixHex(base, surface2, 0.42), isLight ? 0.98 : 0.98),
      '--ui-overlay': rgba(mixHex(base, hoverColor, isLight ? 0.2 : 0.04), isLight ? 0.84 : 0.76),
      '--ui-border': border,
      '--ui-border-sub': borderSub,
      '--ui-addr-bg': rgba(mixHex(surface2, accent, isLight ? 0.08 : 0.15), isLight ? 0.78 : 0.52),
      '--ui-addr-focus': rgba(mixHex(surface, accent, isLight ? 0.12 : 0.22), isLight ? 0.9 : 0.64),
      '--ui-icon-bg': rgba(mixHex(surface2, accent, isLight ? 0.06 : 0.12), isLight ? 0.88 : 0.92),
      '--ui-hover': rgba(hoverColor, isLight ? 0.08 : 0.1),
      '--ui-hover-2': rgba(hoverColor, isLight ? 0.06 : 0.08),
      '--ui-active': rgba(accent, isLight ? 0.18 : 0.2),
      '--ui-pin-remove': rgba(mixHex(base, accent, isLight ? 0.04 : 0.08), 0.96),
      '--ui-toast-bg': rgba(mixHex(surface, accent, isLight ? 0.08 : 0.1), 0.96),
      '--ui-search-bg': rgba(mixHex(base, accent, isLight ? 0.18 : 0.14), isLight ? 0.62 : 0.34),
      '--ui-accent': accent,
      '--ui-accent-rgb': `${hexToRgb(accent).r},${hexToRgb(accent).g},${hexToRgb(accent).b}`,
      '--ui-shadow-rgb': (() => {
        const s = hexToRgb(mixHex('#000000', accent, 0.18))
        return `${s.r},${s.g},${s.b}`
      })(),
      '--ui-text': text,
      '--ui-text-sub': textSub,
      '--ui-text-muted': textMuted,
      '--ui-text-dim': textDim,
      '--ui-divider': divider,
      '--ui-secure': isLight ? '#2f855a' : '#81c995',
      '--ui-star': isLight ? '#d69e2e' : '#f5c542',
      ...(() => {
        const sem = semanticColors(accent, isLight)
        return {
          '--ui-danger': sem.danger,
          '--ui-danger-rgb': `${hexToRgb(sem.danger).r},${hexToRgb(sem.danger).g},${hexToRgb(sem.danger).b}`,
          '--ui-success': sem.success,
          '--ui-success-rgb': `${hexToRgb(sem.success).r},${hexToRgb(sem.success).g},${hexToRgb(sem.success).b}`,
          '--ui-warn': sem.warn,
          '--ui-warn-rgb': `${hexToRgb(sem.warn).r},${hexToRgb(sem.warn).g},${hexToRgb(sem.warn).b}`,
        }
      })(),
    }
  }

  function notifyBackgroundFrame(state) {
    const frame = document.getElementById('browser-bg-frame')
    if (!frame || !frame.contentWindow) return
    frame.contentWindow.postMessage({ type: 'plu_bg_preset', preset: state.bgPreset }, '*')
    frame.contentWindow.postMessage({ type: 'plu_bg_effect', effect: state.bgEffect }, '*')
  }

  function normalizeLegacyPreset(presetKey) {
    const key = String(presetKey || '').trim().toLowerCase()
    if (key === 'light') return 'light'
    return 'dark'
  }

  async function applyState(state, options = {}) {
    const nextState = {
      mode: state.mode || DEFAULT_STATE.mode,
      accentColor: state.accentColor || DEFAULT_STATE.accentColor,
      bgPreset: state.bgPreset || DEFAULT_STATE.bgPreset,
      bgEffect: state.bgEffect || DEFAULT_STATE.bgEffect || 'particles',
    }

    const preset = getBackgroundPreset(nextState.bgPreset)
    if (nextState.mode === 'light') {
      applyVars(buildVarsFromPalette(preset.light, 'light', nextState.accentColor))
    } else {
      applyVars(buildVarsFromPalette(preset.dark, 'dark', nextState.accentColor))
    }

    document.documentElement.dataset.theme = nextState.mode
    document.documentElement.dataset.bgPreset = nextState.bgPreset
    document.documentElement.dataset.bgEffect = nextState.bgEffect

    if (!options.skipSave) {
      saveState(nextState)
    }

    notifyBackgroundFrame(nextState)
    return nextState
  }

  async function applyMode(mode) {
    const state = loadState()
    return applyState({ ...state, mode: normalizeLegacyPreset(mode) })
  }

  async function applyPreset(presetKey) {
    const state = loadState()
    return applyState({ ...state, bgPreset: presetKey })
  }

  async function setAccentColor(accentColor) {
    const state = loadState()
    return applyState({ ...state, accentColor })
  }

  async function setBackgroundPreset(bgPreset) {
    const state = loadState()
    return applyState({ ...state, bgPreset })
  }

  async function setBackgroundEffect(bgEffect) {
    const state = loadState()
    return applyState({ ...state, bgEffect })
  }

  async function refresh() {
    return applyState(loadState(), { skipSave: true })
  }

  async function init() {
    await refresh()
  }

  window.addEventListener('message', event => {
    if (!event.data || typeof event.data !== 'object') return

    if (event.data.type === 'plu_theme_mode' && event.data.mode) {
      applyMode(event.data.mode)
      return
    }

    if (event.data.type === 'plu_theme_preset' && event.data.preset) {
      applyPreset(event.data.preset)
      return
    }

    if (event.data.type === 'plu_theme_accent' && event.data.accentColor) {
      setAccentColor(event.data.accentColor)
      return
    }

    if (event.data.type === 'plu_bg_preset' && event.data.preset) {
      setBackgroundPreset(event.data.preset)
      return
    }

    if (event.data.type === 'plu_bg_effect' && event.data.effect) {
      setBackgroundEffect(event.data.effect)
      return
    }

    if (event.data.type === 'plu_theme_refresh') {
      refresh()
    }
  })

  window.addEventListener('storage', event => {
    if (event.key === 'plu_theme' || event.key === 'plu_settings') {
      refresh()
    }
  })

  return {
    init,
    refresh,
    applyMode,
    applyPreset,
    setAccentColor,
    setBackgroundPreset,
    setBackgroundEffect,
    getState: loadState,
  }
})()

Theme.init()
