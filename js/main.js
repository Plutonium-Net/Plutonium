const tabsEl = document.getElementById('tabs-el')
const chromeTabs = new ChromeTabs()
chromeTabs.init(tabsEl)

document.getElementById('newtab-btn').addEventListener('click', () => openNewTab())

document.getElementById('newtab-search').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    navigate(e.target.value)
    e.target.value = ''
  }
})

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
  if (waffleWrap && waffleWrap.classList.contains('is-open') && window.SoundFX) window.SoundFX.play('waffleClose')
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
    if (window.SoundFX) window.SoundFX.play('waffleOpen')
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


const customizeWrap = document.getElementById('customize-wrap')
const customizeBtn = document.getElementById('btn-customize')
const customizeMenu = document.getElementById('customize-menu')
const customizeEffects = document.getElementById('customize-effects')
const customizeAccent = document.getElementById('customize-accent')
const customizeWallpapers = document.getElementById('customize-wallpapers')
const customizeSound = document.getElementById('customize-sound')

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
  if (customizeWrap && customizeWrap.classList.contains('is-open') && window.SoundFX) window.SoundFX.play('customizeClose')
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
    if (window.SoundFX) window.SoundFX.play('customizeOpen')
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

function buildCustomizeSound() {
  if (!customizeSound) return
  if (!window.SoundFX) { customizeSound.innerHTML = ''; return }
  const on = SoundFX.isEnabled()
  customizeSound.innerHTML = `
    <div class="customize-sound-row">
      <span class="customize-sound-label"><i class="fa-solid fa-volume-high"></i> Sound effects</span>
      <label class="plu-switch">
        <input type="checkbox" id="customize-sound-switch" ${on ? 'checked' : ''}>
        <span class="plu-switch-track"></span>
      </label>
    </div>
    <button class="customize-sound-test" id="customize-sound-test" type="button"><i class="fa-solid fa-play"></i> Play test</button>
  `
  const sw = document.getElementById('customize-sound-switch')
  if (sw) sw.addEventListener('change', e => SoundFX.setEnabled(e.target.checked))
  const test = document.getElementById('customize-sound-test')
  if (test) test.addEventListener('click', () => SoundFX.preview())
}

function syncCustomizeMenu() {
  buildCustomizeEffects()
  buildCustomizeWallpapers()
  buildCustomizeAccent()
  buildCustomizeSound()
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
  const tabUrl = activeTab ? (activeTab.dataset.url || '') : ''
  if (activeTab && (tabUrl === 'newtab' || /^(?:plu|pluto):\/\//i.test(tabUrl))) {
    const fav = activeTab.querySelector('.chrome-tab-favicon')
    if (fav) fav.style.backgroundImage = `url('${path}')`
  }
}

const favObserver = new MutationObserver(() => {
  clearTimeout(favObserver._t)
  favObserver._t = setTimeout(updateAccentFavicon, 150)
})
favObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })
updateAccentFavicon()

Array.from(document.querySelectorAll('.engine-btn')).forEach(btn => {
  btn.addEventListener('click', () => {
    if (typeof setNetEngine === 'function') setNetEngine(btn.dataset.engine)
  })
});

(function initEngineSliderDrag() {
  const switchEl = document.querySelector('.engine-switch')
  const slider = document.getElementById('engine-slider')
  if (!switchEl || !slider) return

  let pointerId = null
  let startX = 0
  let dragging = false
  let lastEngine = null
  let suppressClickUntil = 0
  // Natural (un-stretched) geometry of the bar, captured when a drag starts
  // so the elastic overscroll is measured against a stable reference.
  let naturalRect = null
  let baseWidth = 0
  let stretchSide = 0
  let springExt = 0
  let springAnim = null
  let downEngine = null
  let handlingPointer = false
  let handlingPointerTimer = null

  // How far the pill can stretch past either horizontal edge before it
  // resists (the asymptote). The curve tracks the pointer almost 1:1 right
  // at the edge, then tightens up like a rubber band being pulled.
  const MAX_STRETCH = 56

  function enginesInOrder() {
    return Array.from(switchEl.querySelectorAll('.engine-btn'))
      .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)
  }

  function nearestEngine(clientX) {
    const engines = enginesInOrder()
    if (!engines.length) return null
    let best = engines[0]
    let bestDist = Math.abs(best.getBoundingClientRect().left + best.offsetWidth / 2 - clientX)
    for (let i = 1; i < engines.length; i++) {
      const rect = engines[i].getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const dist = Math.abs(cx - clientX)
      if (dist < bestDist) { bestDist = dist; best = engines[i] }
    }
    return best
  }

  function applyToEngine(engineBtn) {
    if (!engineBtn) return
    const engine = engineBtn.dataset.engine
    if (!engine || typeof setNetEngine !== 'function') return
    if (engine === lastEngine) return
    lastEngine = engine
    setNetEngine(engine)
  }

  function stretchFor(pull) {
    // Classic elastic overscroll curve: ~1:1 right after the edge, then it
    // eases off as it approaches MAX_STRETCH.
    return MAX_STRETCH * (1 - Math.exp(-pull / MAX_STRETCH))
  }

  function positionSliderTo(clientX) {
    // Pulling past an edge stretches the whole switch (the bar) out on
    // that side while the far edge stays pinned. The pill follows along:
    // its pulled edge rides out to the bar's new edge, its other edge
    // stays glued to the buttons.
    const overLeft = naturalRect.left - clientX
    const overRight = clientX - naturalRect.right
    let ext = 0
    if (overLeft > 0) {
      ext = stretchFor(overLeft)
      switchEl.style.width = (baseWidth + ext) + 'px'
      // The switch sits centered in the new-tab column, so widening
      // pushes both edges out equally; shift left by half to pin the
      // right edge in place while the left edge follows the pointer.
      switchEl.style.transform = 'translateX(' + (-ext / 2) + 'px)'
    } else if (overRight > 0) {
      ext = stretchFor(overRight)
      switchEl.style.width = (baseWidth + ext) + 'px'
      switchEl.style.transform = 'translateX(' + (ext / 2) + 'px)'
    } else {
      switchEl.style.width = ''
      switchEl.style.transform = ''
    }
    stretchSide = overLeft > 0 ? -1 : (overRight > 0 ? 1 : 0)
    springExt = ext

    const switchRect = switchEl.getBoundingClientRect()
    const engines = enginesInOrder()
    if (!engines.length) return
    const pts = engines.map(function (e) {
      const r = e.getBoundingClientRect()
      return { left: r.left - switchRect.left, width: r.width, center: r.left + r.width / 2 - switchRect.left }
    })
    const first = pts[0].center
    const last = pts[pts.length - 1].center
    if (last === first) return
    let t = (clientX - switchRect.left - first) / (last - first)
    t = Math.max(0, Math.min(1, t))
    const scaled = t * (pts.length - 1)
    const idx = Math.min(pts.length - 2, Math.floor(scaled))
    const f = scaled - idx
    const a = pts[idx]
    const b = pts[idx + 1]
    const natLeft = a.left + (b.left - a.left) * f
    const natRight = natLeft + (a.width + (b.width - a.width) * f)

    if (overLeft > 0) {
      // Left edge pulled out: the pill's left edge rides to the bar's
      // edge, its right edge stays glued to the last button.
      slider.style.left = '0px'
      slider.style.width = natRight + 'px'
    } else if (overRight > 0) {
      // Right edge pulled out: the pill's left edge stays glued to the
      // first button, its right edge rides out to the bar's edge.
      slider.style.left = natLeft + 'px'
      slider.style.width = (baseWidth + ext - natLeft) + 'px'
    } else {
      slider.style.left = natLeft + 'px'
      slider.style.width = (natRight - natLeft) + 'px'
    }
  }

  function cancelSpring() {
    if (springAnim) cancelAnimationFrame(springAnim)
    springAnim = null
    switchEl.classList.remove('springing')
    switchEl.classList.add('dragging')
    switchEl.style.width = ''
    switchEl.style.transform = ''
    void switchEl.offsetWidth
    switchEl.classList.remove('dragging')
  }

  function springBack(ext, side) {
    if (springAnim) cancelAnimationFrame(springAnim)
    springAnim = null
    const stiffness = 0.0004
    const damping = 0.02
    let o = ext
    let v = 0
    switchEl.classList.add('springing')
    let last = performance.now()
    function step(now) {
      const dt = Math.min(32, now - last)
      last = now
      const accel = -stiffness * o - damping * v
      v += accel * dt
      o += v * dt
      if (o < -6) o = -6
      if (Math.abs(o) < 0.3 && Math.abs(v) < 0.3) {
        springAnim = null
        switchEl.classList.remove('springing')
        switchEl.style.width = ''
        switchEl.style.transform = ''
        if (typeof syncEngineButtons === 'function') syncEngineButtons()
        return
      }
      switchEl.style.width = (baseWidth + o) + 'px'
      switchEl.style.transform = 'translateX(' + (side * o / 2) + 'px)'
      const switchRect = switchEl.getBoundingClientRect()
      const btn = switchEl.querySelector('.engine-btn.active')
      if (btn) {
        const r = btn.getBoundingClientRect()
        slider.style.left = (r.left - switchRect.left) + 'px'
        slider.style.width = r.width + 'px'
      }
      springAnim = requestAnimationFrame(step)
    }
    springAnim = requestAnimationFrame(step)
  }

  switchEl.addEventListener('pointerdown', function (e) {
    if (pointerId !== null) return
    cancelSpring()
    springExt = 0
    stretchSide = 0
    pointerId = e.pointerId
    startX = e.clientX
    dragging = false
    lastEngine = null
    downEngine = nearestEngine(e.clientX)
    if (e.button === 0) {
      handlingPointer = true
      clearTimeout(handlingPointerTimer)
      handlingPointerTimer = setTimeout(function () { handlingPointer = false }, 600)
    }
    naturalRect = switchEl.getBoundingClientRect()
    baseWidth = naturalRect.width
    try { switchEl.setPointerCapture(e.pointerId) } catch (_) {}
  })

  switchEl.addEventListener('pointermove', function (e) {
    if (e.pointerId !== pointerId) return
    if (!dragging && Math.abs(e.clientX - startX) > 5) {
      dragging = true
      switchEl.classList.add('dragging')
    }
    if (!dragging) return
    applyToEngine(nearestEngine(e.clientX))
    positionSliderTo(e.clientX)
  })

  function endDrag(e) {
    if (e.pointerId !== pointerId) return
    if (dragging) suppressClickUntil = Date.now() + 150
    const wasClick = !dragging && e.button === 0 && downEngine
    pointerId = null
    dragging = false
    switchEl.classList.remove('dragging')
    try { switchEl.releasePointerCapture(e.pointerId) } catch (_) {}
    if (wasClick) {
      const r = downEngine.getBoundingClientRect()
      if (startX >= r.left && startX <= r.right) applyToEngine(downEngine)
    }
    if (springExt > 0 && Math.abs(stretchSide) === 1) {
      springBack(springExt, stretchSide)
    } else {
      switchEl.style.width = ''
      switchEl.style.transform = ''
      requestAnimationFrame(function () {
        if (typeof syncEngineButtons === 'function') syncEngineButtons()
      })
    }
  }

  switchEl.addEventListener('pointerup', endDrag)
  switchEl.addEventListener('pointercancel', endDrag)

  switchEl.addEventListener('click', function (e) {
    const swallow = handlingPointer || Date.now() < suppressClickUntil
    handlingPointer = false
    if (swallow) {
      e.preventDefault()
      e.stopImmediatePropagation()
    }
  }, true)
})()

if (typeof syncEngineButtons === 'function') syncEngineButtons()

ensureTabHistory(getActiveTab())
showNewTabPage()

renderPins()

function alignAppFlanks() {
  const flanks = document.getElementById('app-flanks')
  if (!flanks) return
  flanks.style.top = ''
}
window.addEventListener('resize', alignAppFlanks)
alignAppFlanks()

window.clearCacheAndReload = async function () {
  if ('caches' in window) {
    const names = await caches.keys();
    for (const name of names) await caches.delete(name);
  }
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const reg of regs) await reg.unregister();
  }
  location.reload();
}

window.redoOnboarding = async function () {
  localStorage.removeItem('plu_onboarded')
  const am = typeof accountManager !== 'undefined' ? accountManager : null
  if (am && am.user && typeof PlutoniumStore !== 'undefined') {
    try {
      await PlutoniumStore.setDoc('settings', { onboarded: false, lastSync: new Date() })
    } catch (_) {}
  }
  location.replace('onboarding.html')
}

const helpWrap = document.getElementById('help-wrap')
const helpBtn = document.getElementById('help-btn')
const helpMenu = document.getElementById('help-menu')

function closeHelpMenu() {
  if (!helpWrap) return
  helpWrap.classList.remove('is-open')
  if (helpBtn) helpBtn.setAttribute('aria-expanded', 'false')
  if (helpMenu) { helpMenu.hidden = true; helpMenu.classList.remove('is-open') }
}

function toggleHelpMenu() {
  if (!helpWrap || !helpBtn || !helpMenu) return
  if (helpWrap.classList.contains('is-open')) { closeHelpMenu(); return }
  helpWrap.classList.add('is-open')
  helpBtn.setAttribute('aria-expanded', 'true')
  helpMenu.hidden = false
  requestAnimationFrame(() => helpMenu.classList.add('is-open'))
}

if (helpBtn && helpWrap && helpMenu) {
  helpBtn.addEventListener('click', e => {
    e.stopPropagation()
    toggleHelpMenu()
  })
  document.addEventListener('click', e => {
    if (!helpWrap.classList.contains('is-open')) return
    if (helpWrap.contains(e.target)) return
    closeHelpMenu()
  })
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeHelpMenu()
  })
  const redoBtn = document.getElementById('help-redo')
  const clearBtn = document.getElementById('help-clear-cache')
  if (redoBtn) redoBtn.addEventListener('click', () => { if (window.redoOnboarding) window.redoOnboarding() })
  if (clearBtn) clearBtn.addEventListener('click', () => { if (window.clearCacheAndReload) window.clearCacheAndReload() })
}

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
      <img src="./img/about-images/crafted.png" alt="Crafted">
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
      <img src="./img/about-images/mizzery.png" alt="Mizzery">
    </div>
    <div class="about-dialog__row-body">
      <div class="about-dialog__row-title">Mizzery</div>
      <div class="about-dialog__row-sub">Co-Owner &amp; Community Manager</div>
    </div>
    <a href="https://https://xxmizzeryxx.github.io/mizzery.github.io" class="about-dialog__row-link">Portfolio</a>
    <a href="https://github.com/xXmizzeryXx" class="about-dialog__row-link">GitHub</a>
  </div>
</div>

      <div class="about-dialog__section">
        <div class="about-dialog__section-label">Technology</div>
        <div class="about-dialog__row"><div class="about-dialog__row-icon purple"><i class="fab fa-font-awesome"></i></div><div class="about-dialog__row-body"><div class="about-dialog__row-title">Font Awesome</div><div class="about-dialog__row-sub">Icon library</div></div></div>
        <div class="about-dialog__row"><div class="about-dialog__row-icon teal"><i class="fas fa-network-wired"></i></div><div class="about-dialog__row-body"><div class="about-dialog__row-title">Web engine</div><div class="about-dialog__row-sub">Browsing technology</div></div></div>
        <div class="about-dialog__row"><div class="about-dialog__row-icon teal"><i class="fas fa-network-wired"></i></div><div class="about-dialog__row-body"><div class="about-dialog__row-title">Runtime</div><div class="about-dialog__row-sub">Browsing technology</div></div></div>
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
        <div class="about-dialog__row"><div class="about-dialog__row-icon pink"><i class="fas fa-desktop"></i></div><div class="about-dialog__row-body"><div class="about-dialog__row-title">Virtual Machines</div><div class="about-dialog__row-sub">Remote cloud sessions</div></div></div>
        <div class="about-dialog__row"><div class="about-dialog__row-icon pink"><i class="fas fa-user-circle"></i></div><div class="about-dialog__row-body"><div class="about-dialog__row-title">Accounts</div><div class="about-dialog__row-sub">OAuth sign-in with cloud sync</div></div></div>
        <div class="about-dialog__row"><div class="about-dialog__row-icon pink"><i class="fas fa-clapperboard"></i></div><div class="about-dialog__row-body"><div class="about-dialog__row-title">Streaming</div><div class="about-dialog__row-sub">Movies, TV &amp; anime</div></div></div>
      </div>

      <div class="about-dialog__section">
        <div class="about-dialog__section-label">Special Thanks</div>
        <div class="about-dialog__row"><div class="about-dialog__row-icon yellow"><i class="fas fa-star"></i></div><div class="about-dialog__row-body"><div class="about-dialog__row-title">Titanium Network</div><div class="about-dialog__row-sub">Runtime and Core source code</div></div></div>
        <div class="about-dialog__row"><div class="about-dialog__row-icon blue"><i class="fas fa-users"></i></div><div class="about-dialog__row-body"><div class="about-dialog__row-title">Our Community</div><div class="about-dialog__row-sub">Thank you for feedback and support</div></div></div>
        <div class="about-dialog__row"><div class="about-dialog__row-icon green"><i class="fas fa-hands-helping"></i></div><div class="about-dialog__row-body"><div class="about-dialog__row-title">Render</div><div class="about-dialog__row-sub">Hosting free relay servers</div></div></div>
      </div>

      <div class="about-dialog__section">
        <div class="about-dialog__section-label">License</div>
        <div class="about-dialog__legal">
          <p><strong>Plutonium License (PL) 1.0.0</strong></p>
          <p style="margin-top:4px">© 2026 Plutonium Network. All rights reserved.</p>
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

  document.getElementById('about-clear-cache').addEventListener('click', window.clearCacheAndReload);

  dlg.hidden = false
  scrim.hidden = false
  dlg.offsetHeight
  dlg.style.opacity = '1'
  dlg.style.transform = 'translate(-50%,-50%) scale(1)'
  scrim.style.opacity = '1'

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

function openAccountDialog() {
  const scrim = document.getElementById('account-scrim')
  const dlg = document.getElementById('account-dialog')
  if (!scrim || !dlg) return
  if (typeof accountManager !== 'undefined' && typeof accountManager._renderAccountPanel === 'function') accountManager._renderAccountPanel()
  dlg.hidden = false
  scrim.hidden = false
  dlg.offsetHeight
  dlg.style.opacity = '1'
  dlg.style.transform = 'translate(-50%,-50%) scale(1)'
  scrim.style.opacity = '1'
  document.getElementById('account-dialog-close').addEventListener('click', closeAccountDialog)
  scrim.addEventListener('click', closeAccountDialog)
  document.addEventListener('keydown', function _esc(e) {
    if (e.key === 'Escape') { closeAccountDialog(); document.removeEventListener('keydown', _esc) }
  })
  const email = document.getElementById('acct-email-input')
  if (email && !email.hidden) setTimeout(() => email.focus(), 150)
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

