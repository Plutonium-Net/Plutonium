// ── Plutonium First-Run Onboarding ──────────────────────────────────────────
// Standalone wizard (onboarding.html) shown once per user: index.html
// redirects here after the boot loader finishes, keyed off the
// `plu_onboarded` flag. The flag lives in localStorage and mirrors to the
// account's settings doc via AccountManager, so it follows the user across
// devices. Choices apply through the same Theme / SoundFX / Pins modules the
// app uses, and the embedded bg.html frame previews backgrounds live.
(function () {
  'use strict';

  const FLAG_KEY = 'plu_onboarded'

  const stepEls = Array.prototype.slice.call(document.querySelectorAll('.onb-step'))
  const totalSteps = stepEls.length
  let current = 0
  let leaving = false

  const progressEl   = document.getElementById('onb-progress')
  const backBtn      = document.getElementById('onb-back')
  const skipBtn      = document.getElementById('onb-skip')
  const nextBtn      = document.getElementById('onb-next')
  const finishBtn    = document.getElementById('onb-finish')
  const guestBtn     = document.getElementById('onb-guest')
  const soundSwitch  = document.getElementById('onb-sound-switch')
  const soundTestBtn = document.getElementById('onb-sound-test')
  const pinsGrid     = document.getElementById('onb-pins')
  const pinsCountEl  = document.getElementById('onb-pins-count')
  let remotePoll     = null

  /* ── Navigation ─────────────────────────────────────────────────────── */

  // goHome owns the `leaving` guard — it is the only place that navigates.
  function goHome() {
    if (leaving) return
    leaving = true
    location.replace('index.html')
  }

  function markDone() {
    if (leaving) return
    localStorage.setItem(FLAG_KEY, '1')
    if (remotePoll) { clearInterval(remotePoll); remotePoll = null }
    const am = window.accountManager
    if (am && am.user && typeof am.pushSettings === 'function') {
      // Push the flag to the account before leaving so a fresh device signed
      // in to the same account never sees onboarding again. Give the request
      // a short budget — never trap the user on a slow network.
      const sync = Promise.resolve(am.pushSettings()).catch(() => {})
      const timeout = new Promise(resolve => setTimeout(resolve, 1500))
      Promise.race([sync, timeout]).then(goHome)
    } else {
      goHome()
    }
  }

  function showStep(index) {
    current = Math.max(0, Math.min(totalSteps - 1, index))
    stepEls.forEach((el, i) => el.classList.toggle('active', i === current))
    const segs = progressEl ? progressEl.children : []
    for (let i = 0; i < segs.length; i++) {
      segs[i].classList.toggle('active', i === current)
      segs[i].classList.toggle('done', i < current)
    }
    // Prev/Next are always visible — dimmed (disabled) on the first/last
    // step so the row stays balanced.
    backBtn.disabled = current === 0
    const last = current === totalSteps - 1
    skipBtn.hidden = last
    nextBtn.disabled = last
    // The preview box iframes live inside hidden steps, so they initialize
    // at 0x0. Reload them on entry — bg.html re-inits from localStorage with
    // the current selection and sizes to the now-visible box; storage events
    // keep it live while the user browses.
    if (current === 1) refreshPreview()
    if (current === 2) refreshAccentPreview()
  }

  const previewFrame = document.getElementById('onb-bg-frame')
  function refreshPreview() {
    if (!previewFrame) return
    try {
      previewFrame.src = 'bg.html'
    } catch (_) {}
  }

  const accentFrame = document.getElementById('onb-accent-frame')
  function refreshAccentPreview() {
    if (!accentFrame) return
    try {
      accentFrame.src = 'bg.html'
    } catch (_) {}
  }

  if (backBtn)  backBtn.addEventListener('click', () => showStep(current - 1))
  if (nextBtn)  nextBtn.addEventListener('click', () => showStep(current + 1))
  // Skip advances past the current step (it's hidden on the last one),
  // e.g. skip the sign-in form and jump straight to Background.
  if (skipBtn)  skipBtn.addEventListener('click', () => showStep(current + 1))
  if (finishBtn) finishBtn.addEventListener('click', markDone)

  /* ── Welcome / account ──────────────────────────────────────────────── */

  // The welcome step embeds the in-page sign-in form (same ids/classes as
  // the home account panel) — wiring is shared via accountManager.
  if (window.accountManager && typeof window.accountManager.wireAuthForm === 'function') {
    window.accountManager.wireAuthForm()
  }
  if (guestBtn) guestBtn.addEventListener('click', () => showStep(current + 1))

  // Once signed in there's no "guest" path left — hide the link.
  if (window.PlutoniumStore) {
    window.PlutoniumStore.onAuthChange(u => {
      if (u && guestBtn) guestBtn.hidden = true
    })
  }

  /* ── Shared state helpers ───────────────────────────────────────────── */

  function themeState() {
    return window.BrowserThemeState ? BrowserThemeState.loadThemeState() : {}
  }

  // Transparent accent-tinted logo (img/logos/icon-<color>.png), kept in
  // sync with the accent swatches. The brand-logo-* files are opaque black
  // squares; the icon-* variants have transparent backgrounds.
  function updateLogo() {
    if (!window.BrowserThemeState || !BrowserThemeState.getAccentIconFile) return
    const file = BrowserThemeState.getAccentIconFile()
    const img = document.getElementById('onb-logo')
    if (img) img.src = 'img/logos/icon-' + file + '.png'
    // The accent-step preview mockup reuses the same accent-tinted logo.
    const accImg = document.getElementById('onb-accent-logo-img')
    if (accImg) accImg.src = 'img/logos/icon-' + file + '.png'
  }

  /* ── Step 2: background (effects + wallpapers) ──────────────────────── */

  const effectsEl = document.getElementById('onb-effects')
  const wallpapersEl = document.getElementById('onb-wallpapers')

  function buildEffects() {
    if (!effectsEl || !window.BrowserThemeState) return
    effectsEl.innerHTML = ''
    Object.entries(BrowserThemeState.BG_EFFECTS).forEach(([key, effect]) => {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'glass onb-effect'
      btn.dataset.effect = key
      btn.title = effect.label
      btn.innerHTML = '<i class="fa-solid ' + effect.icon + '"></i><span>' + effect.label + '</span>'
      btn.addEventListener('click', () => {
        if (typeof Theme !== 'undefined') Theme.setBackgroundEffect(key)
        syncState()
      })
      effectsEl.appendChild(btn)
    })
  }

  function buildWallpapers() {
    if (!wallpapersEl || !window.BrowserThemeState) return
    wallpapersEl.innerHTML = ''
    BrowserThemeState.BACKGROUND_IMAGES.forEach(img => {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'onb-wallpaper'
      btn.dataset.wallpaper = img.id
      btn.title = img.label
      if (img.file) {
        btn.style.backgroundImage = 'url("' + img.file + '")'
      }
      const label = document.createElement('span')
      label.textContent = img.label
      btn.appendChild(label)
      btn.addEventListener('click', () => {
        if (typeof Theme !== 'undefined') Theme.setBackgroundImage(img.file)
        syncState()
      })
      wallpapersEl.appendChild(btn)
    })
  }

  /* ── Step 4: accent color ───────────────────────────────────────────── */

  const swatchesEl = document.getElementById('onb-swatches')

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

  function buildSwatches() {
    if (!swatchesEl) return
    swatchesEl.innerHTML = ''
    ACCENT_SWATCHES.forEach(({ color, label }) => {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'onb-swatch'
      btn.dataset.color = color
      btn.title = label
      btn.style.background = color
      btn.addEventListener('click', () => {
        if (typeof Theme !== 'undefined') Theme.setAccentColor(color)
        syncState()
      })
      swatchesEl.appendChild(btn)
    })
  }

  /* ── Step 5: sound ──────────────────────────────────────────────────── */

  if (soundSwitch) {
    soundSwitch.addEventListener('change', e => {
      if (window.SoundFX) SoundFX.setEnabled(e.target.checked)
    })
  }
  if (soundTestBtn) {
    soundTestBtn.addEventListener('click', () => {
      if (window.SoundFX) SoundFX.preview()
    })
  }

  /* ── Step 6: pins ───────────────────────────────────────────────────── */

  // `pin` is what gets stored (same shapes as js/pins.js — GCDN pins keep
  // their bare image filename, cloud pins a root-relative path, so the home
  // screen renders them correctly). `previewSrc` is the display URL used for
  // the thumbnail on this page only.
  function buildPinTile(pin, previewSrc) {
    const tile = document.createElement('button')
    tile.type = 'button'
    tile.className = 'onb-pin'
    tile.dataset.pinId = pin.id
    tile.title = pin.name

    const thumb = document.createElement('span')
    thumb.className = 'onb-pin-thumb'

    if (pin.type === 'vm') {
      thumb.innerHTML = '<i class="fa-solid fa-desktop"></i>'
    } else if (previewSrc) {
      const img = document.createElement('img')
      img.src = previewSrc
      img.alt = ''
      img.loading = 'lazy'
      img.onerror = () => { thumb.innerHTML = '<i class="fa-solid fa-gamepad"></i>' }
      thumb.appendChild(img)
    } else {
      thumb.innerHTML = '<i class="fa-solid fa-gamepad"></i>'
    }

    const name = document.createElement('span')
    name.className = 'onb-pin-name'
    name.textContent = pin.name

    const check = document.createElement('span')
    check.className = 'onb-pin-check'
    check.innerHTML = '<i class="fa-solid fa-check"></i>'

    tile.appendChild(thumb)
    tile.appendChild(name)
    tile.appendChild(check)

    tile.addEventListener('click', () => {
      const pinned = Pins.find(pin.id)
      const pinnedCount = Pins.getAll().length
      if (pinned) {
        Pins.remove(pin.id)
      } else if (pinnedCount >= Pins.MAX_PINS) {
        if (pinsCountEl) pinsCountEl.textContent = 'You can pin up to ' + Pins.MAX_PINS + ', unpin something first.'
        return
      } else {
        Pins.add(pin)
      }
      refreshPins()
    })
    return tile
  }

  const _pinGames = []
  const _pinCloudGames = []

  async function buildPins() {
    if (!pinsGrid || !window.Pins) return
    pinsGrid.innerHTML = '<div class="onb-pins-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading games…</div>'

    try { _pinGames.push(...((await _fetchPgcdnGames()) || [])) } catch (_) {}
    try { _pinCloudGames.push(...((await _fetchCloudGames()) || [])) } catch (_) {}

    renderPins('')
  }

  // Rebuild the grid for a search query. Every pinnable item is shown — no
  // 8/6 cap — and typing in the search box filters by name.
  function renderPins(query) {
    if (!pinsGrid) return
    const q = (query || '').trim().toLowerCase()
    const matches = name => !q || String(name || '').toLowerCase().includes(q)

    pinsGrid.innerHTML = ''

    if (matches('Virtual Machines')) {
      pinsGrid.appendChild(buildPinTile({ id: 'vm', name: 'Virtual Machines', type: 'vm' }))
    }

    _pinGames.filter(game => matches(game.name)).forEach(game => {
      pinsGrid.appendChild(buildPinTile(
        { id: game.id, name: game.name, image: game.image || undefined },
        game.image ? 'https://g.cdn.plutoniumnet.work/' + game.image : ''
      ))
    })

    _pinCloudGames.filter(game => matches(game.name)).forEach(game => {
      const img = _cloudImgRoot(game.image)
      pinsGrid.appendChild(buildPinTile(
        { id: 'cloud:' + game.game_key, name: game.name, image: img || undefined, type: 'cloud' },
        img
      ))
    })

    if (!pinsGrid.children.length) {
      const empty = document.createElement('div')
      empty.className = 'onb-pins-loading'
      empty.textContent = 'No games match your search.'
      pinsGrid.appendChild(empty)
    }

    refreshPins()
  }

  const pinsSearch = document.getElementById('onb-pins-search')
  if (pinsSearch) {
    pinsSearch.addEventListener('input', () => renderPins(pinsSearch.value))
  }

  function refreshPins() {
    if (!pinsGrid || !window.Pins) return
    const pinned = Pins.getAll()
    const ids = new Set(pinned.map(p => p.id))
    pinsGrid.querySelectorAll('.onb-pin').forEach(tile => {
      tile.classList.toggle('pinned', ids.has(tile.dataset.pinId))
    })
    if (pinsCountEl) {
      pinsCountEl.textContent = pinned.length
        ? pinned.length + ' / ' + Pins.MAX_PINS + ' pinned'
        : 'No pins yet; tap a few games above.'
    }
  }

  /* ── Sync all control states from the current theme ─────────────────── */

  function syncState() {
    const state = themeState()
    const accent = state.accentColor || '#e8175d'

    if (effectsEl) {
      effectsEl.querySelectorAll('.onb-effect').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.effect === state.bgEffect)
      })
    }
    if (wallpapersEl) {
      wallpapersEl.querySelectorAll('.onb-wallpaper').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.wallpaper === state.bgImage)
      })
    }
    if (swatchesEl) {
      swatchesEl.querySelectorAll('.onb-swatch').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.color === accent)
      })
    }
    if (soundSwitch && window.SoundFX) {
      soundSwitch.checked = SoundFX.isEnabled()
    }
    document.body.classList.toggle('accent-light', accent === '#ffffff')
    updateLogo()
  }

  /* ── Init ───────────────────────────────────────────────────────────── */

  // Already completed (local flag, or account pull applied it) → go home.
  if (localStorage.getItem(FLAG_KEY) === '1') {
    goHome()
    return
  }

  // Progress segments (bottom bar) — one per step; the active one grows big
  // and shows the section name, mirroring the boot cache bar.
  if (progressEl) {
    const names = stepEls.map(el => el.getAttribute('aria-label') || 'Step')
    for (let i = 0; i < totalSteps; i++) {
      const seg = document.createElement('span')
      seg.className = 'onb-seg'
      seg.title = names[i]
      const label = document.createElement('span')
      label.className = 'onb-seg-label'
      label.textContent = names[i]
      seg.appendChild(label)
      progressEl.appendChild(seg)
    }
  }

  buildEffects()
  buildWallpapers()
  buildSwatches()
  buildPins()
  syncState()
  showStep(0)

  // If the account settings pull ever reports onboarded (e.g. a returning
  // signed-in user on a fresh device), finish automatically and go home.
  remotePoll = setInterval(() => {
    if (localStorage.getItem(FLAG_KEY) === '1') {
      clearInterval(remotePoll)
      goHome()
    }
  }, 2000)
})()