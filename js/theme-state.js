const BrowserThemeState = (() => {
  const THEME_KEY = 'plu_theme'
  const SETTINGS_KEY = 'plu_settings'
  const DEFAULT_THEME_STATE = {
    mode: 'dark',
    accentColor: '#e8175d',
    bgPreset: 'minimal',
    bgEffect: 'particles',
    bgImage: '',
  }

  // Animated background effects (Plutonium Vanta + particles engine).
  const BG_EFFECTS = {
    particles: { label: 'Particles', icon: 'fa-circle-nodes' },
    birds:     { label: 'Birds',     icon: 'fa-dove' },
    fog:       { label: 'Fog',       icon: 'fa-smog' },
    waves:     { label: 'Waves',     icon: 'fa-water' },
    clouds:    { label: 'Clouds',    icon: 'fa-cloud' },
    globe:     { label: 'Globe',     icon: 'fa-earth-americas' },
    net:       { label: 'Net',       icon: 'fa-border-all' },
    trunk:     { label: 'Trunk',     icon: 'fa-tree' },
    topology:  { label: 'Topology',  icon: 'fa-share-nodes' },
    dots:      { label: 'Dots',      icon: 'fa-ellipsis' },
    rings:     { label: 'Rings',     icon: 'fa-ring' },
    halo:      { label: 'Halo',      icon: 'fa-circle-half-stroke' },
    none:      { label: 'None',      icon: 'fa-ban' },
  }

  // Built-in wallpaper images shipped with the app.
  const BACKGROUND_IMAGES = [
    { id: 'none',              label: 'None',              file: '',                                tint: '#000000', tintOpacity: 0.15 },
    { id: 'coast',             label: 'Coast',             file: 'img/backgrounds/coast.jpg',            tint: '#0a1a28', tintOpacity: 0.14 },
    { id: 'color-burst',       label: 'Color Burst',       file: 'img/backgrounds/color-burst.jpg',     tint: '#4a1a00', tintOpacity: 0.3 },
    { id: 'desert',            label: 'Desert',            file: 'img/backgrounds/desert.jpg',           tint: '#5c3a00', tintOpacity: 0.16 },
    { id: 'galaxy',            label: 'Galaxy',            file: 'img/backgrounds/galaxy.jpg',           tint: '#0a1628', tintOpacity: 0.45 },
    { id: 'lake-dusk',         label: 'Lake Dusk',         file: 'img/backgrounds/lake-dusk.jpg',        tint: '#3a1a00', tintOpacity: 0.7 },
    { id: 'lake-twilight',     label: 'Lake Twilight',     file: 'img/backgrounds/lake-twilight.jpg',    tint: '#1a0a30', tintOpacity: 0.7 },
    { id: 'light-stream',      label: 'Light Stream',      file: 'img/backgrounds/light-stream.jpg',     tint: '#0a2e1a', tintOpacity: 0.70 },
    { id: 'lightning',         label: 'Lightning',         file: 'img/backgrounds/Lightning.jpg',        tint: '#0a0a20', tintOpacity: 0.4 },
    { id: 'lines',             label: 'Lines',             file: 'img/backgrounds/lines.png',            tint: '#1a1a1a', tintOpacity: 0.7 },
    { id: 'mojave',            label: 'Mojave',            file: 'img/backgrounds/mojave.jpg',           tint: '#2a1040', tintOpacity: 0.20 },
    { id: 'refraction-green',  label: 'Refraction Green',  file: 'img/backgrounds/refraction-green.png', tint: '#2a2a2a', tintOpacity: 0.65 },
    { id: 'refraction-purple', label: 'Refraction Purple', file: 'img/backgrounds/refraction-purple.png', tint: '#1a1a1a', tintOpacity: 0.65 },
    { id: 'swirls',            label: 'Swirls',            file: 'img/backgrounds/swirls.png',           tint: '#1a1a2e', tintOpacity: 0.14 },
  ]

  function normalizeBgImage(value) {
    if (typeof value !== 'string') return ''
    if (value === '') return ''
    // Normalize to the built-in id so getBackgroundImageURL can look it up.
    // Also accept a full file path (from legacy state) and map back to id.
    const match = BACKGROUND_IMAGES.find(img => img.id === value || img.file === value)
    return match ? match.id : ''
  }

  const BACKGROUND_PRESETS = {
    minimal: {
      label: 'Minimal',
      preview: 'linear-gradient(135deg,#0a0e14,#050709)',
      dark: { base: '#16181b', surface: '#22262b', surface2: '#1c2024', accent: '#7dd3fc' },
      light: { base: '#eef2f7', surface: '#ffffff', surface2: '#e8edf4', accent: '#3b82f6' },
    },
    aurora: {
      label: 'Aurora',
      preview: 'linear-gradient(135deg,#0d1b2a,#1b4332)',
      dark: { base: '#0d1b2a', surface: '#143042', surface2: '#173b35', accent: '#72efdd' },
      light: { base: '#ecf8f5', surface: '#ffffff', surface2: '#dff4ec', accent: '#1c9c88' },
    },
    dusk: {
      label: 'Dusk',
      preview: 'linear-gradient(135deg,#1a0533,#2d1b69)',
      dark: { base: '#1c1232', surface: '#2a1d4d', surface2: '#22173f', accent: '#b794f6' },
      light: { base: '#f4effd', surface: '#ffffff', surface2: '#ece4fb', accent: '#7c3aed' },
    },
    ember: {
      label: 'Ember',
      preview: 'linear-gradient(135deg,#1a0800,#3d1a00)',
      dark: { base: '#20110b', surface: '#332018', surface2: '#2a1812', accent: '#fb923c' },
      light: { base: '#fff3eb', surface: '#ffffff', surface2: '#fde7d7', accent: '#ea580c' },
    },
    ocean: {
      label: 'Ocean',
      preview: 'linear-gradient(135deg,#001a2c,#003554)',
      dark: { base: '#081c2d', surface: '#11314a', surface2: '#0c253a', accent: '#38bdf8' },
      light: { base: '#edf7ff', surface: '#ffffff', surface2: '#dbeefe', accent: '#0284c7' },
    },
    ash: {
      label: 'Ash',
      preview: 'linear-gradient(135deg,#111111,#222222)',
      dark: { base: '#141414', surface: '#212121', surface2: '#1a1a1a', accent: '#d4d4d8' },
      light: { base: '#f5f5f5', surface: '#ffffff', surface2: '#ebebeb', accent: '#6b7280' },
    },
    rose: {
      label: 'Rose',
      preview: 'linear-gradient(135deg,#1a0010,#2d0020)',
      dark: { base: '#1d0d19', surface: '#321727', surface2: '#27121f', accent: '#f9a8d4' },
      light: { base: '#fff0f6', surface: '#ffffff', surface2: '#fde2ef', accent: '#db2777' },
    },
    none: {
      label: 'None',
      preview: 'linear-gradient(135deg,#101010,#1a1a1a)',
      dark: { base: '#16181b', surface: '#22262b', surface2: '#1c2024', accent: '#7dd3fc' },
      light: { base: '#eef2f7', surface: '#ffffff', surface2: '#e8edf4', accent: '#3b82f6' },
    },
  }

  function isHexColor(value) {
    return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value.trim())
  }

  function normalizeAccentColor(value) {
    return isHexColor(value) ? value.trim().toLowerCase() : DEFAULT_THEME_STATE.accentColor
  }

  function normalizeMode(value) {
    const mode = typeof value === 'string' ? value.trim().toLowerCase() : ''
    return ['dark', 'light'].includes(mode) ? mode : DEFAULT_THEME_STATE.mode
  }

  function normalizeBgPreset(value) {
    const preset = typeof value === 'string' ? value.trim().toLowerCase() : ''
    return BACKGROUND_PRESETS[preset] ? preset : DEFAULT_THEME_STATE.bgPreset
  }

  function getBackgroundImageURL(id) {
    const match = BACKGROUND_IMAGES.find(img => img.id === id)
    return match ? match.file : ''
  }

  function getBackgroundImageTint(id) {
    const match = BACKGROUND_IMAGES.find(img => img.id === id)
    return match ? { color: match.tint || '#000000', opacity: match.tintOpacity || 0.15 } : { color: '#000000', opacity: 0.15 }
  }

  function normalizeBgEffect(value) {
    const effect = typeof value === 'string' ? value.trim().toLowerCase() : ''
    return BG_EFFECTS[effect] ? effect : DEFAULT_THEME_STATE.bgEffect
  }

  function normalizeThemeState(raw) {
    const next = raw && typeof raw === 'object' ? raw : {}
    const effect = normalizeBgEffect(next.bgEffect)
    const image  = normalizeBgImage(next.bgImage)
    // Wallpaper and animated effects are mutually exclusive.
    // A wallpaper wins: if one is set the effect is forced to 'none';
    // if an effect is set the wallpaper is cleared.
    return {
      mode: normalizeMode(next.mode),
      accentColor: normalizeAccentColor(next.accentColor),
      bgPreset: normalizeBgPreset(next.bgPreset),
      bgEffect: image ? 'none' : effect,
      bgImage: effect !== 'none' ? '' : image,
    }
  }

  // Legacy migration: users who had the crafted-gamz theme keys (cg_theme /
  // cg_settings) get their old look carried over on first load.
  const LEGACY_THEME_KEY = 'cg_theme'
  const LEGACY_SETTINGS_KEY = 'cg_settings'

  function loadRawThemeState() {
    try {
      const raw = localStorage.getItem(THEME_KEY)
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  }

  function loadRawLegacyThemeState() {
    try {
      const raw = localStorage.getItem(LEGACY_THEME_KEY)
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  }

  function loadRawSettingsState() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY)
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  }

  function loadRawLegacySettingsState() {
    try {
      const raw = localStorage.getItem(LEGACY_SETTINGS_KEY)
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  }

  function getLegacyMode(rawTheme, rawSettings) {
    if (rawTheme.mode !== undefined) {
      return normalizeMode(rawTheme.mode)
    }

    const legacyPreset = String(rawTheme.preset || '').trim().toLowerCase()
    if (legacyPreset === 'light') return 'light'

    if (rawSettings.theme !== undefined) {
      return normalizeMode(rawSettings.theme)
    }

    return DEFAULT_THEME_STATE.mode
  }

  function loadThemeState() {
    const rawTheme = loadRawThemeState()
    const rawSettings = loadRawSettingsState()

    const hasOwn = Object.keys(rawTheme).length || Object.keys(rawSettings).length

    if (!hasOwn) {
      const legacyTheme = loadRawLegacyThemeState()
      const legacySettings = loadRawLegacySettingsState()
    return normalizeThemeState({
      mode: getLegacyMode(legacyTheme, legacySettings),
      accentColor: legacyTheme.accentColor || legacySettings.accentColor,
      bgPreset: legacyTheme.bgPreset || legacyTheme.bgStyle || legacySettings.bgPreset || legacySettings.bgStyle,
      bgEffect: legacyTheme.bgEffect || legacySettings.bgStyle,
      bgImage: legacyTheme.bgImage || legacySettings.bgImage,
    })
    }

    return normalizeThemeState({
      mode: getLegacyMode(rawTheme, rawSettings),
      accentColor: rawTheme.accentColor || rawSettings.accentColor,
      bgPreset: rawTheme.bgPreset || rawTheme.bgStyle || rawSettings.bgPreset || rawSettings.bgStyle,
      bgEffect: rawTheme.bgEffect || rawSettings.bgStyle,
      bgImage: rawTheme.bgImage || rawSettings.bgImage,
    })
  }

  function getDefaultAccent(mode, presetKey) {
    const preset = getBackgroundPreset(presetKey)
    if (mode === 'light') return preset.light.accent
    return preset.dark.accent
  }

  function saveThemeState(patch) {
    const current = loadThemeState()
    const requestedMode = patch && patch.mode !== undefined ? patch.mode : current.mode
    const requestedPreset = patch && patch.bgPreset !== undefined ? patch.bgPreset : current.bgPreset
    const normalizedMode = normalizeMode(requestedMode)
    const normalizedPreset = normalizeBgPreset(requestedPreset)
    const shouldUsePresetAccent = patch && patch.accentColor === undefined && patch && (patch.mode !== undefined || patch.bgPreset !== undefined)
    const next = normalizeThemeState({
      ...current,
      ...patch,
      mode: normalizedMode,
      bgPreset: normalizedPreset,
      bgImage: patch && patch.bgImage !== undefined ? patch.bgImage : current.bgImage,
      accentColor: patch && patch.accentColor !== undefined
        ? patch.accentColor
        : (shouldUsePresetAccent
          ? getDefaultAccent(normalizedMode, normalizedPreset)
          : current.accentColor),
    })
    localStorage.setItem(THEME_KEY, JSON.stringify(next))

    const settings = loadRawSettingsState()
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      ...settings,
      theme: next.mode,
      accentColor: next.accentColor,
      bgStyle: next.bgEffect,
      bgPreset: next.bgPreset,
      bgImage: next.bgImage || '',
    }))

    // Push the theme to the cloud when signed in
    if (window.accountManager && typeof window.accountManager.scheduleSettingsSync === 'function') {
      window.accountManager.scheduleSettingsSync()
    }

    return next
  }

  function getBackgroundPreset(key) {
    const presetKey = normalizeBgPreset(key)
    return { key: presetKey, ...BACKGROUND_PRESETS[presetKey] }
  }

  // Accent-coloured icon / logo variants (img/logos/icon-<color>.png)
  const ACCENT_ICON_MAP = {
    '#e8175d': 'plutonium-pink',
    '#7c3aed': 'violet',
    '#3c5085': 'blue',
    '#059669': 'emerald',
    '#d97706': 'amber',
    '#dc2626': 'red',
    '#0891b2': 'cyan',
    '#c026d3': 'fuchsia',
    '#ffffff': 'white',
  }

  function getAccentIconFile() {
    return ACCENT_ICON_MAP[normalizeAccentColor(loadThemeState().accentColor)] || 'plutonium-pink'
  }

  function getAccentIconPath() {
    return `img/logos/icon-${getAccentIconFile()}.png`
  }

  return {
    THEME_KEY,
    SETTINGS_KEY,
    DEFAULT_THEME_STATE,
    BACKGROUND_PRESETS,
    BACKGROUND_IMAGES,
    BG_EFFECTS,
    loadThemeState,
    saveThemeState,
    getDefaultAccent,
    normalizeThemeState,
    getBackgroundPreset,
    getBackgroundImageURL,
    getBackgroundImageTint,
    getAccentIconFile,
    getAccentIconPath,
  }
})()

window.BrowserThemeState = BrowserThemeState
