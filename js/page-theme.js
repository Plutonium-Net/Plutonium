/* Plutonium Page Theme — shared for ported pages (games, cloud, stream, vms,
   account, ai, about). Reads plu_theme from localStorage and re-points every
   accent/brand color at the theme so all pages follow the chosen accent.

   Color model:
   - Brand tints (--pink, --pink-muted, --pink-soft) hue-rotate with the accent.
   - Decorative palette (--row-0..7) = 8 hues, 45deg apart, starting at the
     accent hue — the whole rainbow follows the theme.
   - Semantic status colors (--ui-danger/success/warn) keep their canonical
     hues (red / green / amber) but inherit the accent's saturation and adapt
     lightness to dark/light mode, so they always read correctly while still
     feeling part of the palette.
*/
(() => {
  const THEME_KEY = 'plu_theme'
  const DEFAULT_ACCENT = '#e8175d'

  const PRESET_BASE = {
    minimal: '#16181b',
    aurora: '#0d1b2a',
    dusk: '#1c1232',
    ember: '#20110b',
    ocean: '#081c2d',
    ash: '#141414',
    rose: '#1d0d19',
    none: '#16181b',
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(THEME_KEY)
      const s = raw ? JSON.parse(raw) : {}
      const accent = /^#[0-9a-f]{6}$/i.test(s.accentColor || '') ? s.accentColor : DEFAULT_ACCENT
      return {
        mode: s.mode === 'light' ? 'light' : 'dark',
        accentColor: accent,
        bgPreset: PRESET_BASE[s.bgPreset] ? s.bgPreset : 'minimal',
      }
    } catch (err) {
      return { mode: 'dark', accentColor: DEFAULT_ACCENT, bgPreset: 'minimal' }
    }
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
    const h = ((hue % 360) + 360) % 360 / 360
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
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
  }

  function rgbTriple(hex) {
    return [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ].join(',')
  }

  // Mix accent into black so drop shadows get a subtle theme-colored cast.
  function mixInto(hex, amount) {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    const w = Math.max(0, Math.min(1, amount))
    return '#' + [r * w, g * w, b * w].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')
  }

  function apply() {
    const state = loadState()
    const isLight = state.mode === 'light'
    const accent = state.accentColor
    const { h, s: accentSat } = hexToHsl(accent)
    const sat = Math.max(0.55, Math.min(0.85, accentSat))

    const danger = hslToHex(0, sat, isLight ? 0.42 : 0.60)
    const success = hslToHex(140, sat, isLight ? 0.38 : 0.56)
    const warn = hslToHex(45, sat, isLight ? 0.44 : 0.62)

    const shadow = rgbTriple(mixInto(accent, 0.18))

    const vars = {
      '--pink': accent,
      '--pink-rgb': rgbTriple(accent),
      '--ui-accent-rgb': rgbTriple(accent),
      '--ui-shadow-rgb': shadow,
      '--pink-muted': hslToHex(h, sat, 0.28),
      '--pink-soft': hslToHex(h, Math.min(1, sat + 0.15), isLight ? 0.50 : 0.78),
      '--ui-danger': danger,
      '--ui-danger-rgb': rgbTriple(danger),
      '--ui-success': success,
      '--ui-success-rgb': rgbTriple(success),
      '--ui-warn': warn,
      '--ui-warn-rgb': rgbTriple(warn),
      '--ui-star': warn,
      '--bg': PRESET_BASE[state.bgPreset],
    }
    for (let i = 0; i < 8; i++) {
      const c = hslToHex(h + i * 45, 0.62, isLight ? 0.42 : 0.66)
      vars['--row-' + i] = c
      vars['--row-' + i + '-rgb'] = rgbTriple(c)
    }

    const root = document.documentElement
    Object.entries(vars).forEach(([key, value]) => root.style.setProperty(key, value))
  }

  apply()

  // Live-update when the theme changes in the shell (shared localStorage).
  window.addEventListener('storage', event => {
    if (event.key === THEME_KEY) apply()
  })
})()
