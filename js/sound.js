// # SoundFX — synthesized UI + content sound effects
//
// All sounds are generated on the fly with the Web Audio API (no audio files,
// no downloads). They are short, low-volume, neutral blips that stay out of
// the way. Sound is on by default and can be muted via the Customize menu
// (`plu_settings.sound`), which also mirrors to the account when signed in.
window.SoundFX = (() => {
  'use strict';

  const SETTINGS_KEY = 'plu_settings'
  const SOUND_KEY = 'sound'

  let ctx = null
  let enabled = null // lazily resolved from storage on first use

  // Throttle generic ticks so rapid clicking never stacks into noise.
  let lastTick = 0
  const TICK_GAP_MS = 45

  // Throttle per-keystroke search sounds + alternate pitch slightly per key.
  let lastType = 0
  let typeStep = 0
  const TYPE_GAP_MS = 28

  function getStoredEnabled() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY)
      const settings = raw ? JSON.parse(raw) : {}
      return settings[SOUND_KEY] !== undefined ? !!settings[SOUND_KEY] : true
    } catch (_) {
      return true
    }
  }

  function isEnabled() {
    if (enabled === null) enabled = getStoredEnabled()
    return enabled
  }

  function setEnabled(value) {
    enabled = !!value
    try {
      const raw = localStorage.getItem(SETTINGS_KEY)
      const settings = raw ? JSON.parse(raw) : {}
      settings[SOUND_KEY] = enabled
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    } catch (_) {}
    // Push to the cloud when signed in (mirrors how theme-state syncs settings).
    if (window.accountManager && typeof window.accountManager.scheduleSettingsSync === 'function') {
      window.accountManager.scheduleSettingsSync()
    }
  }

  // Create (or resume) the shared AudioContext. Returns null when unavailable
  // so the rest of the module degrades silently.
  function ensureContext() {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    if (!ctx) {
      try { ctx = new AC() } catch (_) { return null }
    }
    if (ctx.state === 'suspended' && ctx.resume) {
      try { ctx.resume() } catch (_) {}
    }
    return ctx
  }

  // Play one synthesized tone through a soft gain envelope.
  function playTone({ type = 'sine', freq = 440, freqEnd = null, when = 0, duration = 0.12, gain = 0.07, attack = 0.002 }) {
    const ac = ctx
    if (!ac) return
    try {
      const osc = ac.createOscillator()
      const g = ac.createGain()
      osc.type = type
      osc.frequency.setValueAtTime(freq, ac.currentTime + when)
      if (freqEnd != null) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), ac.currentTime + when + duration)
      }

      const peak = Math.max(0.0001, gain)
      g.gain.setValueAtTime(0.0001, ac.currentTime + when)
      g.gain.linearRampToValueAtTime(peak, ac.currentTime + when + attack)
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + when + duration)

      osc.connect(g)
      g.connect(ac.destination)
      osc.start(ac.currentTime + when)
      osc.stop(ac.currentTime + when + duration + 0.02)
    } catch (_) {}
  }

  // ── Named sounds ──────────────────────────────────────────────────────────
  const SOUNDS = {
    // Generic click — very short, quiet.
    tick:       () => playTone({ type: 'triangle', freq: 720,  freqEnd: 520,  duration: 0.07, gain: 0.05 }),
    // Menu / dialog open — quick rising couplet.
    open:       () => { playTone({ type: 'sine', freq: 440, freqEnd: 660, duration: 0.10, gain: 0.06 }); playTone({ type: 'sine', freq: 660, freqEnd: 820, when: 0.08, duration: 0.10, gain: 0.05 }) },
    // Menu / dialog close — falling couplet.
    close:      () => { playTone({ type: 'sine', freq: 620, freqEnd: 460, duration: 0.09, gain: 0.05 }); playTone({ type: 'sine', freq: 460, freqEnd: 320, when: 0.07, duration: 0.10, gain: 0.05 }) },
    // New tab — gentle upward glide.
    tabOpen:    () => playTone({ type: 'sine', freq: 520, freqEnd: 840, duration: 0.13, gain: 0.06 }),
    // Close tab — gentle downward glide.
    tabClose:   () => playTone({ type: 'sine', freq: 700, freqEnd: 380, duration: 0.12, gain: 0.06 }),
    // Switch tabs / reorder — short mid blip.
    switch:     () => playTone({ type: 'triangle', freq: 620, freqEnd: 720, duration: 0.05, gain: 0.04 }),
    // Launch a game / app / navigate somewhere — small two-note chime.
    launch:     () => { playTone({ type: 'sine', freq: 480, duration: 0.07, gain: 0.05 }); playTone({ type: 'sine', freq: 640, when: 0.06, duration: 0.10, gain: 0.055 }) },
    // Selecting / focusing a search bar — bright little "armed" blip.
    searchFocus: () => playTone({ type: 'sine', freq: 580, freqEnd: 760, duration: 0.08, gain: 0.05 }),
    // Typing in a search bar — short soft key tap, pitch drifts per keystroke.
    searchType:  () => {
      const now = Date.now()
      if (now - lastType < TYPE_GAP_MS) return
      lastType = now
      typeStep = typeStep ? 0 : 1
      const f = 980 + typeStep * 80
      playTone({ type: 'triangle', freq: f, freqEnd: f + 20, duration: 0.035, gain: 0.034 })
    },
    // Wisp region menu open — rising "connect" sweep.
    wispOpen:    () => { playTone({ type: 'triangle', freq: 430, freqEnd: 700, duration: 0.12, gain: 0.05 }); playTone({ type: 'sine', freq: 700, freqEnd: 900, when: 0.07, duration: 0.09, gain: 0.04 }) },
    // Wisp region menu close — soft falling sweep.
    wispClose:   () => playTone({ type: 'triangle', freq: 640, freqEnd: 460, duration: 0.09, gain: 0.04 }),
    // Customize (paintbrush) open — soft two-step "tune" sweep.
    customizeOpen:  () => { playTone({ type: 'triangle', freq: 440, freqEnd: 560, duration: 0.10, gain: 0.05 }); playTone({ type: 'sine', freq: 560, freqEnd: 700, when: 0.07, duration: 0.12, gain: 0.045 }) },
    // Customize (paintbrush) close — gentle falling counterpart.
    customizeClose: () => { playTone({ type: 'triangle', freq: 580, freqEnd: 460, duration: 0.09, gain: 0.045 }); playTone({ type: 'sine', freq: 460, freqEnd: 380, when: 0.06, duration: 0.10, gain: 0.04 }) },
    // Waffle (apps) open — snappy two-note "grid" blip.
    waffleOpen:     () => { playTone({ type: 'triangle', freq: 560, freqEnd: 680, duration: 0.07, gain: 0.05 }); playTone({ type: 'triangle', freq: 680, freqEnd: 780, when: 0.05, duration: 0.07, gain: 0.04 }) },
    // Waffle (apps) close — reversed, slightly lower blip.
    waffleClose:    () => { playTone({ type: 'triangle', freq: 700, freqEnd: 580, duration: 0.07, gain: 0.04 }); playTone({ type: 'triangle', freq: 580, freqEnd: 500, when: 0.05, duration: 0.07, gain: 0.035 }) },
    // Account dialog open — bright two-note "ding".
    accountOpen:    () => { playTone({ type: 'sine', freq: 520, duration: 0.08, gain: 0.05 }); playTone({ type: 'sine', freq: 660, when: 0.07, duration: 0.12, gain: 0.05 }) },
    // Account dialog close — soft falling chime.
    accountClose:   () => { playTone({ type: 'sine', freq: 660, freqEnd: 560, duration: 0.10, gain: 0.045 }); playTone({ type: 'sine', freq: 520, when: 0.06, duration: 0.10, gain: 0.04 }) },
  }

  function play(name) {
    if (!isEnabled()) return
    name = SOUNDS[name] ? name : 'tick'
    const ac = ensureContext()
    if (!ac) return
    if (name === 'tick') {
      const now = Date.now()
      if (now - lastTick < TICK_GAP_MS) return
      lastTick = now
    }
    SOUNDS[name]()
  }

  // Play a short sample chime (for the settings "Play test" button).
  function preview() {
    if (!ensureContext()) return
    play('open')
    setTimeout(() => play('launch'), 160)
  }

  // ── Automatic wiring ──────────────────────────────────────────────────────
  function isInteractive(el) {
    if (!el || el.nodeType !== 1) return false
    const s = el.matches
      ? el.matches('button, a, .nav-btn, .app-tile, .waffle-item, .newtab-btn, .bookmark-star-btn, .customize-effect, .customize-swatch, .customize-wallpaper, .toast-btn, .ctx-item, .export-btn, .tree-node-header, .history-sort-btn')
      : false
    if (s) return true
    return !!el.closest && el.closest('button, a[href], [role="button"], .app-tile, .waffle-item')
  }

  // Generic tick for just about any clickable element. Content views inject
  // their DOM asynchronously (Games, Cloud Gaming, ...), so we delegate once.
  document.addEventListener('pointerdown', e => {
    if (!isEnabled()) return
    const t = e.target
    if (!isInteractive(t)) return
    // Actions with their own dedicated sound skip the generic tick.
    // (tab strip handled by tabAdd/tabRemove events; app tiles + waffle items
    //  fire a richer launch chime through navigate(); game cards through the viewer.)
    if (t.closest && t.closest('.newtab-btn, .app-tile, .waffle-item, .pgcdn-card, .history-list__row, #customize-menu, #waffle-menu, #wisp-switcher-btn, #btn-customize, #btn-waffle, #btn-user-page')) return
    play('tick')
  })

  // Tab lifecycle events on the tab strip.
  const tabsEl = document.getElementById('tabs-el')
  if (tabsEl) {
    tabsEl.addEventListener('tabAdd', () => play('tabOpen'))
    tabsEl.addEventListener('tabRemove', () => play('tabClose'))
    tabsEl.addEventListener('activeTabChange', () => play('switch'))
    tabsEl.addEventListener('tabReorder', () => play('switch'))
  }

  // Search / address bar — a distinct chime on focus, a soft key tap while typing.
  function wireSearchSound(id) {
    const el = document.getElementById(id)
    if (!el) return
    el.addEventListener('focus', () => play('searchFocus'))
    el.addEventListener('input', () => play('searchType'))
  }
  wireSearchSound('url-input')   // address bar
  wireSearchSound('newtab-search') // new-tab page search

  return {
    play,
    preview,
    isEnabled,
    setEnabled,
  }
})()