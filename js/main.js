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

// ── About dialog ──────────────────────────────────────────────────────────
function openAboutDialog() {
  const scrim = document.getElementById('about-scrim')
  const dlg = document.getElementById('about-dialog')
  if (!scrim || !dlg) return

  dlg.innerHTML = `
    <div class="about-dialog__head">
      <span class="about-dialog__title"><i class="fas fa-info-circle" style="margin-right:6px;opacity:.5"></i>About &amp; Credits</span>
      <button class="about-dialog__close" id="about-dialog-close"><i class="fas fa-xmark"></i></button>
    </div>
    <div class="about-dialog__body">
      <p>Plutonium Network is a web platform providing access to games, applications, AI services, virtual machines, and more, all directly through your browser.</p>
      <p>This platform is also meant for internet freedom. With the on-going, rising censorship in this world — from GoGuardian on a school Chromebook to Europe's Digital Services Act — this site will help you evade that.</p>

      <div class="about-dialog__stats">
        <div class="about-dialog__stat glass"><div class="about-dialog__stat-value">15</div><div class="about-dialog__stat-label">Version</div></div>
        <div class="about-dialog__stat glass"><div class="about-dialog__stat-value">2022</div><div class="about-dialog__stat-label">Est.</div></div>
        <div class="about-dialog__stat glass"><div class="about-dialog__stat-value" style="color:var(--ui-success)">Active</div><div class="about-dialog__stat-label">Status</div></div>
      </div>

      <div class="about-dialog__section">
        <div class="about-dialog__section-label">Creators &amp; Team</div>
        <div class="about-dialog__row"><div class="about-dialog__row-icon blue"><i class="fas fa-user-circle"></i></div><div class="about-dialog__row-body"><div class="about-dialog__row-title">Plutonium</div><div class="about-dialog__row-sub">Lead Developer &amp; Project Creator</div></div><a href="https://crafted.pages.dev" class="about-dialog__row-link">Portfolio</a><a href="https://github.com/itscrafted" class="about-dialog__row-link">GitHub</a></div>
        <div class="about-dialog__row"><div class="about-dialog__row-icon grey"><i class="fas fa-user"></i></div><div class="about-dialog__row-body"><div class="about-dialog__row-title">Mizzery</div><div class="about-dialog__row-sub">General Support</div></div></div>
      </div>

      <div class="about-dialog__section">
        <div class="about-dialog__section-label">Technology</div>
        <div class="about-dialog__row"><div class="about-dialog__row-icon purple"><i class="fab fa-font-awesome"></i></div><div class="about-dialog__row-body"><div class="about-dialog__row-title">Font Awesome</div><div class="about-dialog__row-sub">Icon library</div></div></div>
        <div class="about-dialog__row"><div class="about-dialog__row-icon teal"><i class="fas fa-network-wired"></i></div><div class="about-dialog__row-body"><div class="about-dialog__row-title">Ultraviolet</div><div class="about-dialog__row-sub">Web proxy technology</div></div></div>
        <div class="about-dialog__row"><div class="about-dialog__row-icon teal"><i class="fas fa-network-wired"></i></div><div class="about-dialog__row-body"><div class="about-dialog__row-title">Scramjet</div><div class="about-dialog__row-sub">Web proxy technology</div></div></div>
        <div class="about-dialog__row"><div class="about-dialog__row-icon grey"><i class="fas fa-database"></i></div><div class="about-dialog__row-body"><div class="about-dialog__row-title">GitHub</div><div class="about-dialog__row-sub">File hosting</div></div></div>
        <div class="about-dialog__row"><div class="about-dialog__row-icon orange"><i class="fas fa-cloud"></i></div><div class="about-dialog__row-body"><div class="about-dialog__row-title">Cloudflare</div><div class="about-dialog__row-sub">Site hosting &amp; DDoS protection</div></div></div>
      </div>

      <div class="about-dialog__section">
        <div class="about-dialog__section-label">AI Services</div>
        <div class="about-dialog__row"><div class="about-dialog__row-icon yellow"><i class="fas fa-brain"></i></div><div class="about-dialog__row-body"><div class="about-dialog__row-title">Groq Cloud</div><div class="about-dialog__row-sub">AI inference provider</div></div><a href="https://console.groq.com" class="about-dialog__row-link">Console</a></div>
      </div>

      <div class="about-dialog__section">
        <div class="about-dialog__section-label">Services &amp; Workers</div>
        <div class="about-dialog__row"><div class="about-dialog__row-icon pink"><i class="fas fa-gamepad"></i></div><div class="about-dialog__row-body"><div class="about-dialog__row-title">Games CDN</div><div class="about-dialog__row-sub">Cloud-hosted game catalog with save sync</div></div></div>
        <div class="about-dialog__row"><div class="about-dialog__row-icon pink"><i class="fas fa-cloud"></i></div><div class="about-dialog__row-body"><div class="about-dialog__row-title">Cloud Gaming</div><div class="about-dialog__row-sub">On-demand cloud game sessions</div></div></div>
        <div class="about-dialog__row"><div class="about-dialog__row-icon pink"><i class="fas fa-robot"></i></div><div class="about-dialog__row-body"><div class="about-dialog__row-title">Plutonium AI (Stelena)</div><div class="about-dialog__row-sub">Groq-backed chat worker</div></div></div>
        <div class="about-dialog__row"><div class="about-dialog__row-icon pink"><i class="fas fa-desktop"></i></div><div class="about-dialog__row-body"><div class="about-dialog__row-title">Virtual Machines</div><div class="about-dialog__row-sub">Hyperbeam VM sessions</div></div></div>
        <div class="about-dialog__row"><div class="about-dialog__row-icon pink"><i class="fas fa-user-circle"></i></div><div class="about-dialog__row-body"><div class="about-dialog__row-title">Accounts</div><div class="about-dialog__row-sub">OAuth sign-in with cloud sync</div></div></div>
        <div class="about-dialog__row"><div class="about-dialog__row-icon pink"><i class="fas fa-clapperboard"></i></div><div class="about-dialog__row-body"><div class="about-dialog__row-title">Streaming</div><div class="about-dialog__row-sub">Movies, TV &amp; anime</div></div></div>
      </div>

      <div class="about-dialog__section">
        <div class="about-dialog__section-label">Special Thanks</div>
        <div class="about-dialog__row"><div class="about-dialog__row-icon yellow"><i class="fas fa-star"></i></div><div class="about-dialog__row-body"><div class="about-dialog__row-title">Titanium Network</div><div class="about-dialog__row-sub">Scramjet and Ultraviolet source code</div></div></div>
        <div class="about-dialog__row"><div class="about-dialog__row-icon blue"><i class="fas fa-users"></i></div><div class="about-dialog__row-body"><div class="about-dialog__row-title">Our Community</div><div class="about-dialog__row-sub">Thank you for feedback and support</div></div></div>
        <div class="about-dialog__row"><div class="about-dialog__row-icon green"><i class="fas fa-hands-helping"></i></div><div class="about-dialog__row-body"><div class="about-dialog__row-title">Koyeb</div><div class="about-dialog__row-sub">Hosting free wisp</div></div></div>
      </div>

      <div class="about-dialog__section">
        <div class="about-dialog__section-label">License</div>
        <div class="about-dialog__legal">
          <p><strong>ARR: All Rights Reserved</strong></p>
          <p style="margin-top:4px">© 2022-2026 Plutonium Network. All rights reserved.</p>
        </div>
      </div>

      <div class="about-dialog__contact">
        <i class="fab fa-discord"></i>
        <span>Have questions or suggestions? Find us on Discord!</span>
      </div>
    </div>
  `

  // show
  dlg.hidden = false
  scrim.hidden = false
  dlg.offsetHeight
  dlg.style.opacity = '1'
  dlg.style.transform = 'translate(-50%,-50%) scale(1)'
  scrim.style.opacity = '1'

  // close handlers
  document.getElementById('about-dialog-close').addEventListener('click', closeAboutDialog)
  scrim.addEventListener('click', closeAboutDialog)
  document.addEventListener('keydown', function _esc(e) {
    if (e.key === 'Escape') { closeAboutDialog(); document.removeEventListener('keydown', _esc) }
  })
}

function closeAboutDialog() {
  const scrim = document.getElementById('about-scrim')
  const dlg = document.getElementById('about-dialog')
  if (!dlg || !scrim) return
  dlg.style.opacity = '0'
  dlg.style.transform = 'translate(-50%,-50%) scale(0.96)'
  scrim.style.opacity = '0'
  setTimeout(() => { dlg.hidden = true; scrim.hidden = true }, 200)
}

// ── Account dialog ────────────────────────────────────────────────────────
function openAccountDialog() {
  const scrim = document.getElementById('account-scrim')
  const dlg = document.getElementById('account-dialog')
  if (!scrim || !dlg) return

  // show
  dlg.hidden = false
  scrim.hidden = false
  dlg.offsetHeight
  dlg.style.opacity = '1'
  dlg.style.transform = 'translate(-50%,-50%) scale(1)'
  scrim.style.opacity = '1'

  // refresh the frame content so state is current
  const frame = document.getElementById('account-frame')
  if (frame) frame.src = 'pages/account.html'

  // close handlers (idempotent-ish: re-bind is fine since old ones die with the dialog)
  document.getElementById('account-dialog-close').addEventListener('click', closeAccountDialog)
  scrim.addEventListener('click', closeAccountDialog)
  document.addEventListener('keydown', function _esc(e) {
    if (e.key === 'Escape') { closeAccountDialog(); document.removeEventListener('keydown', _esc) }
  })
}

function closeAccountDialog() {
  const scrim = document.getElementById('account-scrim')
  const dlg = document.getElementById('account-dialog')
  if (!dlg || !scrim) return
  dlg.style.opacity = '0'
  dlg.style.transform = 'translate(-50%,-50%) scale(0.96)'
  scrim.style.opacity = '0'
  setTimeout(() => { dlg.hidden = true; scrim.hidden = true }, 200)
}

