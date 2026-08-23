const bgFallback = document.getElementById('bg-fallback')

function applyBackground() {
  const state = BrowserThemeState.loadThemeState()
  const preset = BrowserThemeState.getBackgroundPreset(state.bgPreset)
  const imageUrl = BrowserThemeState.getBackgroundImageURL(state.bgImage)

  // CSS gradient fallback (also the backdrop when the effect is "none")
  bgFallback.style.background = ''
  bgFallback.style.backgroundImage = ''
  if (imageUrl) {
    bgFallback.style.backgroundImage = 'url("' + imageUrl + '")'
    bgFallback.style.backgroundSize = 'cover'
    bgFallback.style.backgroundPosition = 'center'
    bgFallback.style.backgroundRepeat = 'no-repeat'
    // Per-image tint for readability
    var tint = BrowserThemeState.getBackgroundImageTint(state.bgImage)
    var tc = tint.color.replace('#', '')
    var tr = parseInt(tc.substring(0, 2), 16)
    var tg = parseInt(tc.substring(2, 4), 16)
    var tb = parseInt(tc.substring(4, 6), 16)
    bgFallback.style.backgroundBlendMode = 'multiply'
    bgFallback.style.backgroundColor = 'rgba(' + tr + ',' + tg + ',' + tb + ',' + tint.opacity + ')'
  } else {
    bgFallback.style.backgroundBlendMode = ''
    bgFallback.style.backgroundColor = ''
    bgFallback.style.background = preset.preview
  }

  document.documentElement.dataset.bgEffect = state.bgEffect
  document.documentElement.dataset.bgImage = imageUrl ? state.bgImage : ''

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
  if (['plu_bg_preset', 'plu_bg_effect', 'plu_bg_image', 'plu_theme_refresh'].includes(event.data.type)) {
    applyBackground()
  }
})

window.addEventListener('storage', event => {
  if (event.key === BrowserThemeState.THEME_KEY || event.key === BrowserThemeState.SETTINGS_KEY) {
    applyBackground()
  }
})

applyBackground()
