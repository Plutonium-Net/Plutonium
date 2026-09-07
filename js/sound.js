window.SoundFX = (() => {
  'use strict';

  const SETTINGS_KEY = 'plu_settings'
  const SOUND_KEY = 'sound'

  let ctx = null
  let enabled = null

  let lastTick = 0
  const TICK_GAP_MS = 45

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
    if (window.accountManager && typeof window.accountManager.scheduleSettingsSync === 'function') {
      window.accountManager.scheduleSettingsSync()
    }
  }

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

  const SOUNDS = {
    tick:       () => playTone({ type: 'triangle', freq: 720,  freqEnd: 520,  duration: 0.07, gain: 0.05 }),
    open:       () => { playTone({ type: 'sine', freq: 440, freqEnd: 660, duration: 0.10, gain: 0.06 }); playTone({ type: 'sine', freq: 660, freqEnd: 820, when: 0.08, duration: 0.10, gain: 0.05 }) },
    close:      () => { playTone({ type: 'sine', freq: 620, freqEnd: 460, duration: 0.09, gain: 0.05 }); playTone({ type: 'sine', freq: 460, freqEnd: 320, when: 0.07, duration: 0.10, gain: 0.05 }) },
    tabOpen:    () => playTone({ type: 'sine', freq: 520, freqEnd: 840, duration: 0.13, gain: 0.06 }),
    tabClose:   () => playTone({ type: 'sine', freq: 700, freqEnd: 380, duration: 0.12, gain: 0.06 }),
    switch:     () => playTone({ type: 'triangle', freq: 620, freqEnd: 720, duration: 0.05, gain: 0.04 }),
    launch:     () => { playTone({ type: 'sine', freq: 480, duration: 0.07, gain: 0.05 }); playTone({ type: 'sine', freq: 640, when: 0.06, duration: 0.10, gain: 0.055 }) },
    searchFocus: () => playTone({ type: 'sine', freq: 580, freqEnd: 760, duration: 0.08, gain: 0.05 }),
    searchType:  () => {
      const now = Date.now()
      if (now - lastType < TYPE_GAP_MS) return
      lastType = now
      typeStep = typeStep ? 0 : 1
      const f = 980 + typeStep * 80
      playTone({ type: 'triangle', freq: f, freqEnd: f + 20, duration: 0.035, gain: 0.034 })
    },
    relayOpen:    () => { playTone({ type: 'triangle', freq: 430, freqEnd: 700, duration: 0.12, gain: 0.05 }); playTone({ type: 'sine', freq: 700, freqEnd: 900, when: 0.07, duration: 0.09, gain: 0.04 }) },
    relayClose:   () => playTone({ type: 'triangle', freq: 640, freqEnd: 460, duration: 0.09, gain: 0.04 }),
    customizeOpen:  () => { playTone({ type: 'triangle', freq: 440, freqEnd: 560, duration: 0.10, gain: 0.05 }); playTone({ type: 'sine', freq: 560, freqEnd: 700, when: 0.07, duration: 0.12, gain: 0.045 }) },
    customizeClose: () => { playTone({ type: 'triangle', freq: 580, freqEnd: 460, duration: 0.09, gain: 0.045 }); playTone({ type: 'sine', freq: 460, freqEnd: 380, when: 0.06, duration: 0.10, gain: 0.04 }) },
    waffleOpen:     () => { playTone({ type: 'triangle', freq: 560, freqEnd: 680, duration: 0.07, gain: 0.05 }); playTone({ type: 'triangle', freq: 680, freqEnd: 780, when: 0.05, duration: 0.07, gain: 0.04 }) },
    waffleClose:    () => { playTone({ type: 'triangle', freq: 700, freqEnd: 580, duration: 0.07, gain: 0.04 }); playTone({ type: 'triangle', freq: 580, freqEnd: 500, when: 0.05, duration: 0.07, gain: 0.035 }) },
    accountOpen:    () => { playTone({ type: 'sine', freq: 520, duration: 0.08, gain: 0.05 }); playTone({ type: 'sine', freq: 660, when: 0.07, duration: 0.12, gain: 0.05 }) },
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

  function preview() {
    if (!ensureContext()) return
    play('open')
    setTimeout(() => play('launch'), 160)
  }

  function isInteractive(el) {
    if (!el || el.nodeType !== 1) return false
    const s = el.matches
      ? el.matches('button, a, .nav-btn, .app-tile, .waffle-item, .newtab-btn, .bookmark-star-btn, .customize-effect, .customize-swatch, .customize-wallpaper, .toast-btn, .ctx-item, .export-btn, .tree-node-header, .history-sort-btn')
      : false
    if (s) return true
    return !!el.closest && el.closest('button, a[href], [role="button"], .app-tile, .waffle-item')
  }

  document.addEventListener('pointerdown', e => {
    if (!isEnabled()) return
    const t = e.target
    if (!isInteractive(t)) return
    if (t.closest && t.closest('.newtab-btn, .app-tile, .waffle-item, .pgcdn-card, .history-list__row, #customize-menu, #waffle-menu, #relay-switcher-btn, #btn-customize, #btn-waffle, #btn-user-page')) return
    play('tick')
  })

  const tabsEl = document.getElementById('tabs-el')
  if (tabsEl) {
    tabsEl.addEventListener('tabAdd', () => play('tabOpen'))
    tabsEl.addEventListener('tabRemove', () => play('tabClose'))
    tabsEl.addEventListener('activeTabChange', () => play('switch'))
    tabsEl.addEventListener('tabReorder', () => play('switch'))
  }

  function wireSearchSound(id) {
    const el = document.getElementById(id)
    if (!el) return
    el.addEventListener('focus', () => play('searchFocus'))
    el.addEventListener('input', () => play('searchType'))
  }
  wireSearchSound('url-input')
  wireSearchSound('newtab-search')

  return {
    play,
    preview,
    isEnabled,
    setEnabled,
  }
})()