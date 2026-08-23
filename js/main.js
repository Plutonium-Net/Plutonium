const tabsEl = document.getElementById('tabs-el')
const chromeTabs = new ChromeTabs()
chromeTabs.init(tabsEl)

document.getElementById('newtab-btn').addEventListener('click', () => openNewTab())

document.getElementById('newtab-search').addEventListener('keydown', e => {
  if (e.key === 'Enter') navigate(e.target.value)
})

// Waffle app launcher — dropdown of feature pages
const waffleWrap = document.getElementById('waffle-wrap')
const waffleBtn = document.getElementById('btn-waffle')
const waffleMenu = document.getElementById('waffle-menu')

function positionWaffleMenu() {
  if (!waffleBtn || !waffleMenu) return
  const r = waffleBtn.getBoundingClientRect()
  waffleMenu.style.top = Math.round(r.bottom + 8) + 'px'
  waffleMenu.style.right = Math.round(window.innerWidth - r.right) + 'px'
}

function closeWaffleMenu() {
  waffleWrap && waffleWrap.classList.remove('is-open')
  waffleBtn && waffleBtn.setAttribute('aria-expanded', 'false')
  waffleMenu && (waffleMenu.hidden = true)
  waffleMenu && waffleMenu.classList.remove('is-open')
}

function toggleWaffleMenu() {
  const isOpen = waffleWrap && waffleWrap.classList.contains('is-open')
  if (isOpen) {
    closeWaffleMenu()
  } else {
    positionWaffleMenu()
    waffleWrap.classList.add('is-open')
    waffleBtn.setAttribute('aria-expanded', 'true')
    waffleMenu.hidden = false
    requestAnimationFrame(() => waffleMenu.classList.add('is-open'))
  }
}

if (waffleBtn) {
  waffleBtn.addEventListener('click', e => {
    e.stopPropagation()
    toggleWaffleMenu()
  })
  waffleBtn.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    toggleWaffleMenu()
  })
  document.addEventListener('click', e => {
    if (!waffleWrap.classList.contains('is-open')) return
    if (waffleWrap.contains(e.target) || waffleMenu.contains(e.target)) return
    closeWaffleMenu()
  })
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeWaffleMenu()
  })
  window.addEventListener('resize', () => {
    if (waffleWrap.classList.contains('is-open')) positionWaffleMenu()
  })
}

document.querySelectorAll('.waffle-item, .app-tile').forEach(btn => {
  btn.addEventListener('click', () => {
    closeWaffleMenu()
    navigate(btn.dataset.localUri)
  })
})

// Customize (paintbrush) dropdown — background effects, accent color
const customizeWrap = document.getElementById('customize-wrap')
const customizeBtn = document.getElementById('btn-customize')
const customizeMenu = document.getElementById('customize-menu')
const customizeEffects = document.getElementById('customize-effects')
const customizeAccent = document.getElementById('customize-accent')

const ACCENT_SWATCHES = [
  { color: '#e8175d', label: 'Plutonium Pink' },
  { color: '#7c3aed', label: 'Violet' },
  { color: '#2563eb', label: 'Blue' },
  { color: '#059669', label: 'Emerald' },
  { color: '#d97706', label: 'Amber' },
  { color: '#dc2626', label: 'Red' },
  { color: '#0891b2', label: 'Cyan' },
  { color: '#c026d3', label: 'Fuchsia' },
]

function closeCustomizeMenu() {
  customizeWrap && customizeWrap.classList.remove('is-open')
  customizeScrim && customizeScrim.classList.remove('is-open')
  customizeBtn && customizeBtn.setAttribute('aria-expanded', 'false')
  customizeMenu && (customizeMenu.hidden = true)
  customizeMenu && customizeMenu.classList.remove('is-open')
}

function toggleCustomizeMenu() {
  const isOpen = customizeWrap && customizeWrap.classList.contains('is-open')
  if (isOpen) {
    closeCustomizeMenu()
  } else {
    syncCustomizeMenu()
    customizeWrap.classList.add('is-open')
    customizeScrim.classList.add('is-open')
    customizeBtn.setAttribute('aria-expanded', 'true')
    customizeMenu.hidden = false
    requestAnimationFrame(() => customizeMenu.classList.add('is-open'))
  }
}

function currentThemeState() {
  return window.BrowserThemeState ? BrowserThemeState.loadThemeState() : {}
}

function themeApi() {
  return typeof Theme !== 'undefined' ? Theme : null
}

function buildCustomizeEffects() {
  if (!customizeEffects || !window.BrowserThemeState) return
  const state = currentThemeState()
  customizeEffects.innerHTML = ''
  Object.entries(BrowserThemeState.BG_EFFECTS).forEach(([key, effect]) => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'customize-effect' + (state.bgEffect === key ? ' active' : '')
    btn.title = effect.label
    btn.innerHTML = `<i class="fa-solid ${effect.icon}"></i><span>${effect.label}</span>`
    btn.addEventListener('click', () => {
      if (themeApi()) Theme.setBackgroundEffect(key)
      requestAnimationFrame(syncCustomizeMenu)
    })
    customizeEffects.appendChild(btn)
  })
}

function buildCustomizeAccent() {
  if (!customizeAccent) return
  const state = currentThemeState()
  customizeAccent.innerHTML = ''
  ACCENT_SWATCHES.forEach(({ color, label }) => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'customize-swatch' + (state.accentColor === color ? ' active' : '')
    btn.title = label
    btn.style.background = color
    btn.addEventListener('click', () => {
      if (themeApi()) Theme.setAccentColor(color)
      requestAnimationFrame(syncCustomizeMenu)
    })
    customizeAccent.appendChild(btn)
  })
}

function syncCustomizeMenu() {
  buildCustomizeEffects()
  buildCustomizeAccent()
}

const customizeScrim = document.getElementById('customize-scrim')

if (customizeBtn) {
  customizeBtn.addEventListener('click', e => {
    e.stopPropagation()
    toggleCustomizeMenu()
  })
  customizeBtn.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    toggleCustomizeMenu()
  })
  if (customizeScrim) {
    customizeScrim.addEventListener('click', () => closeCustomizeMenu())
  }
  document.addEventListener('click', e => {
    if (!customizeWrap.classList.contains('is-open')) return
    if (customizeWrap.contains(e.target) || customizeMenu.contains(e.target)) return
    closeCustomizeMenu()
  })
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeWaffleMenu()
      closeCustomizeMenu()
    }
  })
}

window.addEventListener('storage', e => {
  if (e.key === 'plu_theme' || e.key === 'plu_settings') {
    if (customizeWrap && customizeWrap.classList.contains('is-open')) syncCustomizeMenu()
    updateAccentFavicon()
  }
})
syncCustomizeMenu()

// Swap the tab-bar favicon + browser favicon when the accent color changes
function updateAccentFavicon() {
  if (typeof BrowserThemeState === 'undefined' || !BrowserThemeState.getAccentIconPath) return
  const path = BrowserThemeState.getAccentIconPath()
  const link = document.getElementById('app-favicon')
  if (link && link.href.split('/').pop() !== path.split('/').pop()) link.href = path
  const ntIcon = document.getElementById('newtab-tab-favicon')
  if (ntIcon && !ntIcon.style.backgroundImage.includes(path.split('/').pop())) {
    ntIcon.style.backgroundImage = `url('${path}')`
  }
  const activeTab = typeof getActiveTab === 'function' ? getActiveTab() : null
  if (activeTab && activeTab.dataset.url === 'newtab') {
    const fav = activeTab.querySelector('.chrome-tab-favicon')
    if (fav) fav.style.backgroundImage = `url('${path}')`
  }
}

// Re-render the favicon when the theme changes within this page
const favObserver = new MutationObserver(() => {
  clearTimeout(favObserver._t)
  favObserver._t = setTimeout(updateAccentFavicon, 150)
})
favObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })
updateAccentFavicon()

document.querySelectorAll('.proxy-engine-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (typeof setProxyEngine === 'function') setProxyEngine(btn.dataset.engine)
  })
})
if (typeof syncProxyEngineButtons === 'function') syncProxyEngineButtons()

ensureTabHistory(getActiveTab())
showNewTabPage()

renderPins()

// Align the flanking app-tile columns with the search bar (wide layouts only)
function alignAppFlanks() {
  const flanks = document.getElementById('app-flanks')
  const search = document.querySelector('.search-box')
  const page = document.getElementById('new-tab-page')
  if (!flanks || !search || !page) return
  if (window.innerWidth <= 980) {
    flanks.style.top = ''
    return
  }
  // flanks is positioned relative to .new-tab-page, so convert the search
  // center from viewport coords to page coords, then align the column's
  // center (translateY(-50%) already self-centers it) onto that point.
  const sRect = search.getBoundingClientRect()
  const pRect = page.getBoundingClientRect()
  const center = sRect.top + sRect.height / 2 - pRect.top
  flanks.style.top = Math.max(0, center) + 'px'
}
window.addEventListener('resize', alignAppFlanks)
alignAppFlanks()

