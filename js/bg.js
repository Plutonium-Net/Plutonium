const bgFallback = document.getElementById('bg-fallback')

function applyBackground() {
  const state = BrowserThemeState.loadThemeState()
  const preset = BrowserThemeState.getBackgroundPreset(state.bgPreset)

  // CSS gradient fallback (also the backdrop when the effect is "none")
  bgFallback.style.background = preset.preview
  document.documentElement.dataset.bgEffect = state.bgEffect

  // Re-launch the animated effect (PluBG.init destroys any previous instance)
  if (typeof PluBG !== 'undefined') {
    try {
      PluBG.init()
    } catch (e) {
      console.warn('[bg] effect init failed:', e)
    }
  }
}

window.addEventListener('message', event => {
  if (!event.data || typeof event.data !== 'object') return
  if (['plu_bg_preset', 'plu_bg_effect', 'plu_theme_refresh'].includes(event.data.type)) {
    applyBackground()
  }
})

window.addEventListener('storage', event => {
  if (event.key === BrowserThemeState.THEME_KEY || event.key === BrowserThemeState.SETTINGS_KEY) {
    applyBackground()
  }
})

applyBackground()
