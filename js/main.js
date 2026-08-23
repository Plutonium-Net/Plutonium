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

// Hover popup for app grid
const gridPopup = document.getElementById('app-grid-popup')
const gridPopupName = document.getElementById('app-grid-popup-name')
const gridPopupDesc = document.getElementById('app-grid-popup-desc')
if (gridPopup) {
  document.querySelectorAll('.app-tile').forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      gridPopupName.textContent = btn.dataset.name || ''
      gridPopupDesc.textContent = btn.dataset.desc || ''
      gridPopup.classList.add('visible')
    })
    btn.addEventListener('mouseleave', () => {
      gridPopup.classList.remove('visible')
    })
  })
}


// Customize (paintbrush) dropdown — background effects, accent color
const customizeWrap = document.getElementById('customize-wrap')
const customizeBtn = document.getElementById('btn-customize')
const customizeMenu = document.getElementById('customize-menu')
const customizeEffects = document.getElementById('customize-effects')
const customizeAccent = document.getElementById('customize-accent')
const customizeWallpapers = document.getElementById('customize-wallpapers')

const ACCENT_SWATCHES = [
  { color: '#e8175d', label: 'Plutonium Pink' },
  { color: '#7c3aed', label: 'Violet' },
  { color: '#3c5085', label: 'Blue' },
  { color: '#059669', label: 'Emerald' },
  { color: '#d97706', label: 'Amber' },
  { color: '#dc2626', label: 'Red' },
  { color: '#0891b2', label: 'Cyan' },
  { color: '#c026d3', label: 'Fuchsia' },
  { color: '#ffffff', label: 'White' },
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
    btn.dataset.color = color
    btn.addEventListener('click', () => {
      if (themeApi()) Theme.setAccentColor(color)
      requestAnimationFrame(syncCustomizeMenu)
    })
    customizeAccent.appendChild(btn)
  })
}

function buildCustomizeWallpapers() {
  if (!customizeWallpapers || !window.BrowserThemeState) return
  const state = currentThemeState()
  const currentImage = state.bgImage || ''
  customizeWallpapers.innerHTML = ''

  BrowserThemeState.BACKGROUND_IMAGES.forEach(function (img) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'customize-wallpaper' + (currentImage === img.id ? ' active' : '')
    btn.title = img.label

    if (img.file) {
      btn.style.backgroundImage = 'url("' + img.file + '")'
      btn.style.backgroundSize = 'cover'
      btn.style.backgroundPosition = 'center'
    }

    const label = document.createElement('span')
    label.className = 'customize-wallpaper-label'
    label.textContent = img.label
    btn.appendChild(label)

    btn.addEventListener('click', function () {
      if (themeApi()) Theme.setBackgroundImage(img.file)
      requestAnimationFrame(syncCustomizeMenu)
    })

    customizeWallpapers.appendChild(btn)
  })
}

function syncCustomizeMenu() {
  buildCustomizeEffects()
  buildCustomizeWallpapers()
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

// Reset inline top on resize so the CSS value takes effect
function alignAppFlanks() {
  const flanks = document.getElementById('app-flanks')
  if (!flanks) return
  flanks.style.top = ''
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
      <p>This platform is also meant for internet freedom. With the on-going, rising censorship in this world. From GoGuardian on a school Chromebook to Europe's Digital Services Act, this site will help you evade that.</p>

<div class="about-dialog__section">
  <div class="about-dialog__section-label">Creators &amp; Team</div>

  <div class="about-dialog__row">
    <div class="about-dialog__row-icon blue">
      <i class="fas fa-user-circle"></i>
    </div>
    <div class="about-dialog__row-body">
      <div class="about-dialog__row-title">Crafted</div>
      <div class="about-dialog__row-sub">Co-Owner &amp; Project Creator</div>
    </div>
    <a href="https://crafted.pages.dev" class="about-dialog__row-link">Portfolio</a>
    <a href="https://github.com/craf1ed" class="about-dialog__row-link">GitHub</a>
  </div>

  <div class="about-dialog__row">
    <div class="about-dialog__row-icon grey">
      <i class="fas fa-user"></i>
    </div>
    <div class="about-dialog__row-body">
      <div class="about-dialog__row-title">Mizzery</div>
      <div class="about-dialog__row-sub">Co-Owner &amp; Community Manager</div>
    </div>
    <a href="https://github.com/xXmizzeryXx" class="about-dialog__row-link">GitHub</a>
  </div>
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

      <div class="about-dialog__section">
        <div class="about-dialog__section-label">Maintenance</div>
        <button class="about-dialog__cache-btn" id="about-clear-cache" type="button">
          <i class="fas fa-trash-can" style="margin-right:6px"></i>Clear Cache &amp; Reload
        </button>
      </div>

      <div class="about-dialog__contact">
        <a href="https://discord.gg/sQvNX6SVfA" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:none;display:flex;align-items:center">
          <i class="fab fa-discord"></i>
          <span>Have questions or suggestions? Find us on Discord!</span>
        </a>
      </div>
    </div>
  `

  // cache-clear button
  document.getElementById('about-clear-cache').addEventListener('click', async function () {
    if ('caches' in window) {
      const names = await caches.keys();
      for (const name of names) await caches.delete(name);
    }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) await reg.unregister();
    }
    location.reload();
  });

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
function acctShowToast(msg) {
  const t = document.getElementById('acct-toast')
  if (!t) return
  t.textContent = msg
  t.classList.add('show')
  clearTimeout(t._tid)
  t._tid = setTimeout(() => t.classList.remove('show'), 2200)
}

function acctScheduleLocalSync(type) {
  const am = window.accountManager
  try {
    if (type === 'pins') {
      if (typeof renderPins === 'function') renderPins()
      if (am && typeof am.schedulePinSync === 'function') am.schedulePinSync()
    } else if (type === 'bookmarks') {
      if (am && typeof am.scheduleBookmarkSync === 'function') am.scheduleBookmarkSync()
    }
  } catch (_) {}
}

function acctConfirm(title, desc, onConfirm) {
  const overlay = document.createElement('div')
  overlay.className = 'confirm-overlay'
  overlay.innerHTML = `
    <div class="confirm-box">
      <div class="confirm-box-title">${title}</div>
      <div class="confirm-box-desc">${desc}</div>
      <div class="confirm-box-actions">
        <button class="btn btn-ghost" id="conf-cancel">Cancel</button>
        <button class="btn btn-danger" id="conf-ok">Confirm</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
  overlay.querySelector('#conf-cancel').addEventListener('click', () => overlay.remove())
  overlay.querySelector('#conf-ok').addEventListener('click', () => { overlay.remove(); onConfirm() })
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
}

function acctExportData(type) {
  const key = type === 'bookmarks' ? 'plu_bookmarks' : 'plu_pins'
  let data = []
  try { data = JSON.parse(localStorage.getItem(key)) || [] } catch {}
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `plu_${type}_${Date.now()}.json`
  a.click()
  acctShowToast(`${type.charAt(0).toUpperCase() + type.slice(1)} exported`)
}

function acctImportData(type) {
  const input = document.getElementById('import-file-input')
  if (!input) return
  input.onchange = () => {
    const file = input.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result)
        if (!Array.isArray(data)) { acctShowToast('Invalid file format'); return }
        const key = type === 'bookmarks' ? 'plu_bookmarks' : 'plu_pins'
        localStorage.setItem(key, JSON.stringify(data))
        acctShowToast(`Imported ${data.length} ${type}`)
        acctRenderBookmarks()
        acctUpdateStats()
        acctScheduleLocalSync(type)
      } catch { acctShowToast('Failed to parse file') }
    }
    reader.readAsText(file)
    input.value = ''
  }
  input.click()
}

function acctClearData(type) {
  acctConfirm(
    `Clear all ${type}?`,
    `This will permanently remove all your saved ${type} from this device. This cannot be undone.`,
    () => {
      const key = type === 'bookmarks' ? 'plu_bookmarks' : 'plu_pins'
      localStorage.removeItem(key)
      acctShowToast(`${type.charAt(0).toUpperCase() + type.slice(1)} cleared`)
      acctRenderBookmarks()
      acctUpdateStats()
      acctScheduleLocalSync(type)
    }
  )
}

function acctRenderBookmarks() {
  const list = document.getElementById('acct-bm-list')
  if (!list) return
  let bookmarks = []
  try { bookmarks = JSON.parse(localStorage.getItem('plu_bookmarks')) || [] } catch {}

  const countLabel = document.getElementById('bm-count-label')
  const badge = document.getElementById('bm-count-badge')
  if (countLabel) countLabel.textContent = bookmarks.length ? `${bookmarks.length} saved` : 'No bookmarks saved'
  if (badge) {
    badge.textContent = bookmarks.length
    badge.className = 'badge ' + (bookmarks.length > 0 ? 'active' : 'inactive')
  }

  if (!bookmarks.length) {
    list.innerHTML = '<div class="bm-empty">No bookmarks yet</div>'
    return
  }

  list.innerHTML = ''
  bookmarks.slice(0, 8).forEach(bm => {
    const row = document.createElement('div')
    row.className = 'bm-row'

    const fav = document.createElement('div')
    fav.className = 'bm-favicon'
    const img = document.createElement('img')
    img.src = `https://www.google.com/s2/favicons?sz=32&domain_url=${encodeURIComponent(bm.url)}`
    img.onerror = () => { img.replaceWith(Object.assign(document.createElement('i'), { className: 'fa-solid fa-globe' })) }
    fav.appendChild(img)

    const title = document.createElement('div')
    title.className = 'bm-title'
    title.textContent = bm.title || bm.url

    const url = document.createElement('div')
    url.className = 'bm-url'
    url.textContent = bm.url

    const removeBtn = document.createElement('button')
    removeBtn.className = 'bm-remove'
    removeBtn.title = 'Remove'
    removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>'
    removeBtn.addEventListener('click', () => {
      try {
        let bms = JSON.parse(localStorage.getItem('plu_bookmarks')) || []
        bms = bms.filter(b => b.url !== bm.url)
        localStorage.setItem('plu_bookmarks', JSON.stringify(bms))
      } catch {}
      acctRenderBookmarks()
      acctUpdateStats()
      acctShowToast('Bookmark removed')
    })

    row.appendChild(fav)
    row.appendChild(title)
    row.appendChild(url)
    row.appendChild(removeBtn)
    list.appendChild(row)
  })

  if (bookmarks.length > 8) {
    const more = document.createElement('div')
    more.style.cssText = 'padding:10px 16px;font-size:11px;color:rgba(255,255,255,.3);text-align:center'
    more.textContent = `+${bookmarks.length - 8} more`
    list.appendChild(more)
  }
}

function acctUpdateStats() {
  let bms = []
  try { bms = JSON.parse(localStorage.getItem('plu_bookmarks')) || [] } catch {}
  let pins = []
  try { pins = JSON.parse(localStorage.getItem('plu_pins')) || [] } catch {}
  const bmEl = document.getElementById('stat-bookmarks')
  const pinEl = document.getElementById('stat-pins')
  const storEl = document.getElementById('stat-storage')
  if (bmEl) bmEl.textContent = bms.length
  if (pinEl) pinEl.textContent = pins.length
  if (storEl) storEl.textContent = localStorage.length

  const guestBm = document.getElementById('guest-bm-count')
  const guestPin = document.getElementById('guest-pin-count')
  if (guestBm) guestBm.textContent = bms.length + ' saved'
  if (guestPin) guestPin.textContent = pins.length + ' pinned'
}

function acctFillProfile(am) {
  const user = am.user
  if (!user) return

  const avatarEl = document.getElementById('acct-avatar')
  if (user.photoURL) {
    avatarEl.innerHTML = `<img src="${user.photoURL}" alt="avatar">`
  } else {
    avatarEl.textContent = (user.displayName || user.email || '?')[0].toUpperCase()
  }

  am.getUserProfile().then(profile => {
    const name = (profile && profile.name) || user.displayName || user.email.split('@')[0]
    document.getElementById('acct-name').textContent = name
  }).catch(() => {
    document.getElementById('acct-name').textContent = user.displayName || user.email.split('@')[0]
  })

  document.getElementById('acct-email').textContent = user.email
}

let _acctSyncInterval = null
function acctRenderPage() {
  const am = window.accountManager
  if (!am || !am.firebaseLoaded) { setTimeout(acctRenderPage, 200); return }

  const loadingEl = document.getElementById('loading-state')
  if (loadingEl) loadingEl.style.display = 'none'

  if (!am.user && !am.isGuest) { setTimeout(acctRenderPage, 200); return }

  acctUpdateStats()

  if (!am.user) {
    const guestEl = document.getElementById('guest-state')
    if (guestEl) guestEl.style.display = 'block'
    const signedInEl = document.getElementById('signed-in-state')
    if (signedInEl) signedInEl.style.display = 'none'
    const signinBtn = document.getElementById('acct-signin-btn')
    if (signinBtn) signinBtn.addEventListener('click', () => {
      am.isGuest = false
      am.showAuthPrompt()
    })
    return
  }

  const guestEl = document.getElementById('guest-state')
  if (guestEl) guestEl.style.display = 'none'
  const signedInEl = document.getElementById('signed-in-state')
  if (signedInEl) signedInEl.style.display = 'block'

  acctFillProfile(am)
  acctRenderBookmarks()
  acctSetupSignedInListeners(am)

  // Build cloud data tree (only when signed in)
  acctBuildTree()
  acctDiscoverDynamicDocs()
  document.getElementById('tree-refresh-all')?.addEventListener('click', () => {
    document.querySelectorAll('#tree-docs .tree-node.expanded').forEach(n => {
      n.classList.remove('expanded')
    })
    acctBuildTree()
    acctDiscoverDynamicDocs()
  })

  // Custom path input
  const customInput = document.getElementById('tree-custom-input')
  const customLoad = document.getElementById('tree-custom-load')
  if (customInput && customLoad) {
    const loadCustom = () => {
      const name = customInput.value.trim()
      if (!name) return
      acctAddCustomNode(name)
      customInput.value = ''
    }
    customLoad.addEventListener('click', loadCustom)
    customInput.addEventListener('keydown', e => { if (e.key === 'Enter') loadCustom() })
  }

  if (_acctSyncInterval) clearInterval(_acctSyncInterval)
  _acctSyncInterval = setInterval(() => { acctUpdateStats() }, 5000)
}

function acctSetupSignedInListeners(am) {
  const signoutBtn = document.getElementById('signout-btn')
  if (signoutBtn) {
    signoutBtn.addEventListener('click', async () => {
      await am.signOut()
      acctShowToast('Signed out')
      closeAccountDialog()
    })
  }

  const deleteBtn = document.getElementById('delete-account-btn')
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      acctConfirm(
        'Delete your account?',
        'This permanently deletes your account and all synced data. This action cannot be undone.',
        async () => {
          try {
            if (am.deleteAccount) await am.deleteAccount()
            acctShowToast('Account deleted')
            closeAccountDialog()
          } catch { acctShowToast('Failed to delete account') }
        }
      )
    })
  }

  acctSetupPasswordReset(am)
}

function acctSetupPasswordReset(am) {
  const row = document.getElementById('pw-reset-row')
  if (!row) return

  let sending = false

  row.addEventListener('click', async () => {
    if (sending) return
    const user = am.user
    if (!user || !user.email) { acctShowToast('No email on file'); return }

    sending = true
    const sub = document.getElementById('pw-reset-sub')
    const chevron = document.getElementById('pw-reset-chevron')
    if (sub) sub.textContent = 'Sending…'
    if (chevron) chevron.className = 'fa-solid fa-circle-notch fa-spin-custom'

    try {
      if (typeof am.resetPassword !== 'function') throw new Error('no-op')
      await am.resetPassword(user.email)
      acctShowToast('Reset link sent to ' + user.email)
      if (sub) sub.textContent = 'Reset link sent — check your inbox'
      if (chevron) chevron.className = 'row-chevron fa-solid fa-check'
      setTimeout(() => {
        if (sub) sub.textContent = 'Send a reset link to your email'
        if (chevron) chevron.className = 'row-chevron fa-solid fa-chevron-right'
        sending = false
      }, 4000)
    } catch (err) {
      acctShowToast('Failed to send reset link')
      if (sub) sub.textContent = 'Send a reset link to your email'
      if (chevron) chevron.className = 'row-chevron fa-solid fa-chevron-right'
      sending = false
    }
  })
}

// ── Cloud data tree explorer ──────────────────────────────────────────────
const CLOUD_DOCS = [
  { name: 'bookmarks',          label: 'Bookmarks',          icon: 'fa-solid fa-bookmark' },
  { name: 'pins',               label: 'Pins',               icon: 'fa-solid fa-thumbtack' },
  { name: 'tabs',               label: 'Tabs',               icon: 'fa-solid fa-folder-open' },
  { name: 'settings',           label: 'Settings',           icon: 'fa-solid fa-gear' },
  { name: 'games_data/saved',   label: 'Games Data',         icon: 'fa-solid fa-gamepad' },
  { name: 'personal_games/meta',label: 'Personal Games',     icon: 'fa-solid fa-upload' },
  { name: 'stream_favorites',   label: 'Stream Favorites',   icon: 'fa-solid fa-heart' },
  { name: 'stream_continue',    label: 'Stream Continue',    icon: 'fa-solid fa-play-circle' },
  { name: 'stream_prefs',       label: 'Stream Prefs',       icon: 'fa-solid fa-sliders' },
]

function acctBuildTree() {
  const container = document.getElementById('tree-docs')
  if (!container) return
  container.innerHTML = ''

  CLOUD_DOCS.forEach(doc => {
    const node = document.createElement('div')
    node.className = 'tree-node'
    node.dataset.doc = doc.name

    const header = document.createElement('div')
    header.className = 'tree-node-header'
    header.innerHTML = `
      <span class="tree-node-chevron"><i class="fa-solid fa-chevron-right"></i></span>
      <span class="tree-node-icon doc"><i class="${doc.icon}"></i></span>
      <span class="tree-node-name">${doc.name}</span>
      <span class="tree-node-meta" id="tree-meta-${doc.name}"></span>
    `

    const body = document.createElement('div')
    body.className = 'tree-node-body'
    body.innerHTML = `
      <div class="tree-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading…</div>
    `

    header.addEventListener('click', () => acctToggleNode(node, doc))

    node.appendChild(header)
    node.appendChild(body)
    container.appendChild(node)
  })
}

async function acctDiscoverDynamicDocs() {
  const container = document.getElementById('tree-docs')
  if (!container) return

  try {
    if (typeof PlutoniumStore === 'undefined' || !PlutoniumStore.currentUser) return

    // Discover personal game files from metadata
    const meta = await PlutoniumStore.getDoc('personal_games/meta').catch(() => null)
    if (meta && Array.isArray(meta.games)) {
      meta.games.forEach(game => {
        if (game.id) acctAddTreeDoc(container, `pg_files/${game.id}`, 'fa-solid fa-file-code', game.name || game.id)
      })
    }

    // Discover game save slots from games data
    const gamesData = await PlutoniumStore.getDoc('games_data/saved').catch(() => null)
    if (gamesData && Array.isArray(gamesData.savedGames)) {
      gamesData.savedGames.forEach(id => {
        acctAddTreeDoc(container, `game_saves/${id}`, 'fa-solid fa-floppy-disk', id)
      })
    }
  } catch (_) {}
}

function acctAddTreeDoc(container, name, icon, label) {
  // Avoid duplicates
  if (container.querySelector(`[data-doc="${name}"]`)) return

  const node = document.createElement('div')
  node.className = 'tree-node'
  node.dataset.doc = name

  const header = document.createElement('div')
  header.className = 'tree-node-header'
  header.innerHTML = `
    <span class="tree-node-chevron"><i class="fa-solid fa-chevron-right"></i></span>
    <span class="tree-node-icon doc"><i class="${icon}"></i></span>
    <span class="tree-node-name">${name}</span>
    <span class="tree-node-meta" id="tree-meta-${name}"></span>
  `

  const body = document.createElement('div')
  body.className = 'tree-node-body'
  body.innerHTML = '<div class="tree-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading…</div>'

  header.addEventListener('click', () => acctToggleNode(node, { name, label }))

  node.appendChild(header)
  node.appendChild(body)
  container.appendChild(node)
}

function acctAddCustomNode(name) {
  const container = document.getElementById('tree-docs')
  if (!container) return
  acctAddTreeDoc(container, name, 'fa-solid fa-file', name)
  // Auto-expand
  const node = container.querySelector(`[data-doc="${CSS.escape(name)}"]`)
  if (node) {
    const doc = { name, label: name }
    acctToggleNode(node, doc)
  }
}

async function acctToggleNode(node, doc) {
  const isExpanded = node.classList.contains('expanded')
  if (isExpanded) {
    node.classList.remove('expanded')
    return
  }

  node.classList.add('expanded')
  const body = node.querySelector('.tree-node-body')
  body.innerHTML = '<div class="tree-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading…</div>'

  try {
    if (typeof PlutoniumStore === 'undefined') {
      body.innerHTML = '<div class="tree-empty">PlutoniumStore not loaded</div>'
      return
    }
    if (!PlutoniumStore.currentUser) {
      body.innerHTML = '<div class="tree-empty">Not signed in — sign in to view cloud data</div>'
      return
    }
    const data = await PlutoniumStore.getDoc(doc.name)
    if (!data) {
      body.innerHTML = '<div class="tree-empty">Document not created yet — save data to create it</div>'
      body.innerHTML += '<div style="margin-top:8px"><button class="btn btn-ghost" id="tree-create-' + doc.name + '"><i class="fa-solid fa-plus"></i> Create empty document</button></div>'
      document.getElementById('tree-create-' + doc.name).addEventListener('click', async () => {
        try {
          await PlutoniumStore.setDoc(doc.name, {})
          acctShowToast(`${doc.name} created`)
          acctReloadNode(node, doc)
        } catch (e) {
          acctShowToast('Failed: ' + e.message)
        }
      })
      document.getElementById(`tree-meta-${doc.name}`).textContent = 'empty'
      return
    }
    const json = JSON.stringify(data, null, 2)
    const summary = acctSummarizeDoc(data)
    document.getElementById(`tree-meta-${doc.name}`).textContent = summary

    body.innerHTML = `
      <textarea class="tree-editor" spellcheck="false" data-doc="${doc.name}">${json.replace(/</g, '&lt;')}</textarea>
      <div class="tree-actions">
        <button class="btn btn-ghost" id="tree-reload-${doc.name}" title="Revert"><i class="fa-solid fa-rotate-right"></i> Revert</button>
        <button class="btn btn-primary" id="tree-save-${doc.name}"><i class="fa-solid fa-floppy-disk"></i> Save</button>
        <span class="tree-save-msg" id="tree-msg-${doc.name}"></span>
      </div>
    `

    const editor = body.querySelector('.tree-editor')
    editor.addEventListener('input', () => acctValidateEditor(editor, doc.name))

    document.getElementById(`tree-save-${doc.name}`).addEventListener('click', () => acctSaveDoc(editor, doc))
    document.getElementById(`tree-reload-${doc.name}`).addEventListener('click', () => acctReloadNode(node, doc))
  } catch (err) {
    const msg = (err.message || 'Failed to load').replace(/\[PlutoniumStore\]\s*/g, '')
    body.innerHTML = `<div class="tree-empty" style="color:var(--ui-danger)"><i class="fa-solid fa-triangle-exclamation" style="margin-right:6px"></i>${msg}</div>`
  }
}

function acctSummarizeDoc(data) {
  if (data && Array.isArray(data.list)) return data.list.length + ' items'
  if (data && Array.isArray(data.items)) return data.items.length + ' items'
  if (data && typeof data === 'object') return Object.keys(data).length + ' keys'
  return ''
}

function acctValidateEditor(editor, docName) {
  const msg = document.getElementById(`tree-msg-${docName}`)
  try {
    JSON.parse(editor.value)
    editor.classList.remove('is-invalid')
    if (msg) { msg.textContent = ''; msg.className = 'tree-save-msg' }
  } catch {
    editor.classList.add('is-invalid')
    if (msg) { msg.textContent = 'Invalid JSON'; msg.className = 'tree-save-msg err' }
  }
}

async function acctSaveDoc(editor, doc) {
  const msg = document.getElementById(`tree-msg-${doc.name}`)
  try {
    const data = JSON.parse(editor.value)
    if (msg) { msg.textContent = 'Saving…'; msg.className = 'tree-save-msg' }
    await PlutoniumStore.setDoc(doc.name, data)
    if (msg) { msg.textContent = 'Saved'; msg.className = 'tree-save-msg ok' }
    const summary = acctSummarizeDoc(data)
    const meta = document.getElementById(`tree-meta-${doc.name}`)
    if (meta) meta.textContent = summary
    acctShowToast(`${doc.name} saved`)
  } catch (err) {
    if (msg) { msg.textContent = err.message || 'Save failed'; msg.className = 'tree-save-msg err' }
  }
}

async function acctReloadNode(node, doc) {
  const body = node.querySelector('.tree-node-body')
  body.innerHTML = '<div class="tree-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading…</div>'
  try {
    const data = await PlutoniumStore.getDoc(doc.name)
    if (!data) {
      body.innerHTML = '<div class="tree-empty">No document found</div>'
      return
    }
    const json = JSON.stringify(data, null, 2)
    body.innerHTML = `
      <textarea class="tree-editor" spellcheck="false" data-doc="${doc.name}">${json.replace(/</g, '&lt;')}</textarea>
      <div class="tree-actions">
        <button class="btn btn-ghost" id="tree-reload-${doc.name}" title="Revert"><i class="fa-solid fa-rotate-right"></i> Revert</button>
        <button class="btn btn-primary" id="tree-save-${doc.name}"><i class="fa-solid fa-floppy-disk"></i> Save</button>
        <span class="tree-save-msg" id="tree-msg-${doc.name}"></span>
      </div>
    `
    const editor = body.querySelector('.tree-editor')
    editor.addEventListener('input', () => acctValidateEditor(editor, doc.name))
    document.getElementById(`tree-save-${doc.name}`).addEventListener('click', () => acctSaveDoc(editor, doc))
    document.getElementById(`tree-reload-${doc.name}`).addEventListener('click', () => acctReloadNode(node, doc))
  } catch (err) {
    body.innerHTML = `<div class="tree-empty" style="color:var(--ui-danger)"><i class="fa-solid fa-triangle-exclamation" style="margin-right:6px"></i>${err.message || 'Failed to load'}</div>`
  }
}

function openAccountDialog() {
  const scrim = document.getElementById('account-scrim')
  const dlg = document.getElementById('account-dialog')
  if (!scrim || !dlg) return

  // Inject inline HTML
  dlg.innerHTML = `
    <div class="account-dialog__head">
      <span class="account-dialog__title"><i class="fa-solid fa-user" style="margin-right:6px;opacity:.5"></i>Account</span>
      <button class="account-dialog__close" id="account-dialog-close"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="account-dialog__body">

      <div id="loading-state">
        <div class="profile-card glass">
          <div class="avatar" style="background:rgba(255,255,255,.07)"></div>
          <div style="flex:1;display:flex;flex-direction:column;gap:8px">
            <div class="skeleton" style="width:140px;height:14px"></div>
            <div class="skeleton" style="width:200px;height:11px"></div>
          </div>
        </div>
      </div>

      <div id="guest-state" style="display:none">
        <div class="guest-banner glass">
          <i class="fa-solid fa-circle-info"></i>
          <div class="guest-banner-text">
            <strong>You\u2019re browsing as a guest</strong>
            <span>Sign in to sync bookmarks, pins, and settings across devices.</span>
          </div>
          <button class="btn btn-primary" id="acct-signin-btn"><i class="fa-solid fa-arrow-right-to-bracket"></i> Sign In</button>
        </div>

        <div class="section-label">Local Data</div>
        <div class="card glass">
          <div class="card-row">
            <div class="row-icon grey"><i class="fa-solid fa-bookmark"></i></div>
            <div class="row-body">
              <div class="row-title">Bookmarks</div>
              <div class="row-sub" id="guest-bm-count">Loading...</div>
            </div>
          </div>
          <div class="card-row">
            <div class="row-icon grey"><i class="fa-solid fa-thumbtack"></i></div>
            <div class="row-body">
              <div class="row-title">Pins</div>
              <div class="row-sub" id="guest-pin-count">Loading...</div>
            </div>
          </div>
        </div>
      </div>

      <div id="signed-in-state" style="display:none">

        <div class="profile-card glass" id="profile-card">
          <div class="avatar" id="acct-avatar">?</div>
          <div class="profile-info">
            <div class="profile-name" id="acct-name">\u2014</div>
            <div class="profile-email" id="acct-email">\u2014</div>
          </div>
        </div>

        <div class="stats-strip">
          <div class="stat-box glass">
            <div class="stat-value" id="stat-bookmarks">\u2014</div>
            <div class="stat-label">Bookmarks</div>
          </div>
          <div class="stat-box glass">
            <div class="stat-value" id="stat-pins">\u2014</div>
            <div class="stat-label">Pins</div>
          </div>
          <div class="stat-box glass">
            <div class="stat-value" id="stat-storage">\u2014</div>
            <div class="stat-label">Local Keys</div>
          </div>
        </div>

        <div class="section-label">Data</div>
        <div class="card glass">
          <div class="card-row">
            <div class="row-icon blue"><i class="fa-solid fa-bookmark"></i></div>
            <div class="row-body">
              <div class="row-title">Bookmarks</div>
              <div class="row-sub" id="bm-count-label">Loading...</div>
            </div>
            <div class="row-end">
              <span id="bm-count-badge" class="badge active"></span>
            </div>
          </div>
          <div id="acct-bm-list" class="bm-list"></div>
          <div class="export-grid">
            <button class="export-btn" id="acct-export-bm">
              <i class="fa-solid fa-file-arrow-down"></i>
              <div class="export-btn-body">
                <div class="export-btn-title">Export Bookmarks</div>
                <div class="export-btn-sub">Save as JSON</div>
              </div>
            </button>
            <button class="export-btn" id="acct-import-bm">
              <i class="fa-solid fa-file-arrow-up"></i>
              <div class="export-btn-body">
                <div class="export-btn-title">Import Bookmarks</div>
                <div class="export-btn-sub">Load from JSON</div>
              </div>
            </button>
            <button class="export-btn" id="acct-export-pins">
              <i class="fa-solid fa-thumbtack"></i>
              <div class="export-btn-body">
                <div class="export-btn-title">Export Pins</div>
                <div class="export-btn-sub">Save as JSON</div>
              </div>
            </button>
            <button class="export-btn" id="acct-clear-bm">
              <i class="fa-solid fa-trash-can" style="color:rgba(242,139,130,0.7)"></i>
              <div class="export-btn-body">
                <div class="export-btn-title" style="color:var(--ui-danger)">Clear Bookmarks</div>
                <div class="export-btn-sub">Remove all saved bookmarks</div>
              </div>
            </button>
          </div>
        </div>

        <div class="section-label">Security</div>
        <div class="card glass">
          <div class="card-row clickable" id="pw-reset-row">
            <div class="row-icon grey"><i class="fa-solid fa-key"></i></div>
            <div class="row-body">
              <div class="row-title">Change Password</div>
              <div class="row-sub" id="pw-reset-sub">Send a reset link to your email</div>
            </div>
            <div class="row-end"><i class="row-chevron fa-solid fa-chevron-right" id="pw-reset-chevron"></i></div>
          </div>
        </div>

        <div class="section-label">Account</div>
        <div class="card glass">
          <div class="card-row">
            <div class="row-icon grey"><i class="fa-solid fa-arrow-right-from-bracket"></i></div>
            <div class="row-body">
              <div class="row-title">Sign Out</div>
              <div class="row-sub">Your synced data stays in the cloud</div>
            </div>
            <div class="row-end">
              <button class="btn btn-ghost" id="signout-btn"><i class="fa-solid fa-arrow-right-from-bracket"></i> Sign out</button>
            </div>
          </div>
          <div class="card-row">
            <div class="row-icon red"><i class="fa-solid fa-triangle-exclamation"></i></div>
            <div class="row-body">
              <div class="row-title" style="color:var(--ui-danger)">Delete Account</div>
              <div class="row-sub">Permanently remove your account and all data</div>
            </div>
            <div class="row-end">
              <button class="btn btn-danger" id="delete-account-btn"><i class="fa-solid fa-trash-can"></i> Delete</button>
            </div>
          </div>
        </div>

        <div class="section-label">Cloud Data</div>
        <div class="card glass" id="cloud-data-tree">
          <div class="tree-toolbar">
            <span class="tree-toolbar-label"><i class="fa-solid fa-database" style="margin-right:6px;opacity:.5"></i>Firestore Documents</span>
            <button class="btn btn-ghost" id="tree-refresh-all" title="Refresh all"><i class="fa-solid fa-rotate-right"></i></button>
          </div>
          <div id="tree-docs"></div>
          <div class="tree-custom">
            <input type="text" id="tree-custom-input" class="tree-custom-input" placeholder="Enter document path (e.g. pg_files/game123)" spellcheck="false">
            <button class="btn btn-ghost" id="tree-custom-load"><i class="fa-solid fa-arrow-right"></i></button>
          </div>
        </div>

      </div>
    </div>
  `

  // Bind export/import/clear buttons
  document.getElementById('acct-export-bm')?.addEventListener('click', () => acctExportData('bookmarks'))
  document.getElementById('acct-import-bm')?.addEventListener('click', () => acctImportData('bookmarks'))
  document.getElementById('acct-export-pins')?.addEventListener('click', () => acctExportData('pins'))
  document.getElementById('acct-clear-bm')?.addEventListener('click', () => acctClearData('bookmarks'))

  // Run account page logic
  acctRenderPage()

  // show
  dlg.hidden = false
  scrim.hidden = false
  dlg.offsetHeight
  dlg.style.opacity = '1'
  dlg.style.transform = 'translate(-50%,-50%) scale(1)'
  scrim.style.opacity = '1'

  // close handlers
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
  if (_acctSyncInterval) { clearInterval(_acctSyncInterval); _acctSyncInterval = null }
  dlg.style.opacity = '0'
  dlg.style.transform = 'translate(-50%,-50%) scale(0.96)'
  scrim.style.opacity = '0'
  setTimeout(() => { dlg.hidden = true; scrim.hidden = true }, 200)
}

