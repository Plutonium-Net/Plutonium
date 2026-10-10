/*
 * PlutoniumMobile — the mobile layout mode.
 *
 * Two things turn the mode on, in this order of authority:
 *
 *   1. An explicit choice (the Layout control in the paintbrush menu, or
 *      PlutoniumMobile.setMode('on'|'off')). It is stored per browser and it
 *      always wins, so a user who prefers the desktop layout on a phone can
 *      keep it — and a desktop user can preview the mobile UI.
 *   2. Detection, when no explicit choice has been made. The heuristics are
 *      the user-agent string, plus a coarse-pointer touch screen for devices
 *      that report a desktop UA (iPadOS, tablets in desktop mode).
 *
 * The mode is one class on <html> — `mobile-mode` — and css/mobile.css owns
 * everything below it. Nothing in the app needs to know the mode is on; the
 * class is applied before first paint (this script loads in <head>), so the
 * mobile layout never flashes behind a desktop one.
 *
 * Preference is deliberately not synced to the account: the right layout is a
 * property of the device, not of the user.
 */
(function () {
  'use strict'

  var STORAGE_KEY = 'plu_mobile_mode'
  var MODE_AUTO = 'auto'
  var MODE_ON = 'on'
  var MODE_OFF = 'off'
  var ROOT_CLASS = 'mobile-mode'

  var MOBILE_UA = /android|iphone|ipod|ipad|windows phone|iemobile|blackberry|kindle|silk|opera mini|fennec|mobi|playbook|tablet|smart-?tv|googletv|roku/i

  var listeners = []
  var current = false

  /* ------------------------------------------------------------------ *
   * Preference
   * ------------------------------------------------------------------ */

  function readMode () {
    try {
      var stored = localStorage.getItem(STORAGE_KEY)
      if (stored === MODE_ON || stored === MODE_OFF || stored === MODE_AUTO) return stored
    } catch (err) { /* private mode: fall through to auto */ }
    return MODE_AUTO
  }

  function writeMode (mode) {
    try {
      localStorage.setItem(STORAGE_KEY, mode)
    } catch (err) { /* private mode: the mode still applies for this page */ }
  }

  /* ------------------------------------------------------------------ *
   * Detection
   * ------------------------------------------------------------------ */

  function looksMobile () {
    var ua = (navigator.userAgent || '').toLowerCase()
    var uaData = navigator.userAgentData
    var isMobile = uaData && typeof uaData.mobile === 'boolean' ? uaData.mobile : false

    if (!isMobile) isMobile = MOBILE_UA.test(ua)
    if (!isMobile && /macintosh/.test(ua) && navigator.maxTouchPoints > 1) isMobile = true
    return isMobile
  }

  // Touch-first devices that hide behind a desktop UA. A phone has a coarse
  // pointer; a touchscreen laptop keeps a fine one for its trackpad, so this
  // does not drag desktop machines into the mobile layout.
  function isTouchDevice () {
    return (navigator.maxTouchPoints || 0) > 0 &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches
  }

  function isMobileDevice () {
    return looksMobile() || isTouchDevice()
  }

  function resolve () {
    var mode = readMode()
    if (mode === MODE_ON) return true
    if (mode === MODE_OFF) return false
    return isMobileDevice()
  }

  /* ------------------------------------------------------------------ *
   * Application
   * ------------------------------------------------------------------ */

  function emit () {
    var detail = { enabled: current, mode: readMode(), device: isMobileDevice() }
    listeners.slice().forEach(function (cb) {
      try { cb(detail) } catch (err) { console.warn('[mobile-mode] listener failed', err) }
    })
    try {
      window.dispatchEvent(new CustomEvent('plu-mobile-change', { detail: detail }))
    } catch (err) { /* no CustomEvent support */ }
  }

  function apply (force) {
    var next = resolve()
    var root = document.documentElement
    var was = root.classList.contains(ROOT_CLASS)

    root.classList.toggle(ROOT_CLASS, next)
    root.setAttribute('data-mobile-mode', next ? 'on' : 'off')

    if (!force && next === current && was === next) return
    current = next
    emit()
  }

  /* ------------------------------------------------------------------ *
   * Public API
   * ------------------------------------------------------------------ */

  function setMode (mode) {
    if (mode !== MODE_ON && mode !== MODE_OFF && mode !== MODE_AUTO) return readMode()
    writeMode(mode)
    apply(true)
    return mode
  }

  window.PlutoniumMobile = {
    MODES: { AUTO: MODE_AUTO, ON: MODE_ON, OFF: MODE_OFF },
    getMode: readMode,
    setMode: setMode,
    enable: function () { return setMode(MODE_ON) },
    disable: function () { return setMode(MODE_OFF) },
    reset: function () { return setMode(MODE_AUTO) },
    // Flip the resolved state: on a phone that means "force desktop", on a
    // desktop it means "preview the mobile layout".
    toggle: function () { return setMode(resolve() ? MODE_OFF : MODE_ON) },
    isEnabled: function () { return current },
    isMobileDevice: isMobileDevice,
    reevaluate: function () { apply(true) },
    onChange: function (cb) {
      if (typeof cb !== 'function') return function () {}
      listeners.push(cb)
      try { cb({ enabled: current, mode: readMode(), device: isMobileDevice() }) } catch (err) { console.warn('[mobile-mode] listener failed', err) }
      return function () {
        listeners = listeners.filter(function (l) { return l !== cb })
      }
    }
  }

  apply(true)

  /* Background changes worth re-resolving while the choice is automatic. */
  if (typeof window.matchMedia === 'function') {
    var coarse = window.matchMedia('(pointer: coarse)')
    var onCoarseChange = function () { if (readMode() === MODE_AUTO) apply() }
    if (coarse.addEventListener) coarse.addEventListener('change', onCoarseChange)
    else if (coarse.addListener) coarse.addListener(onCoarseChange)
  }

  /* Another tab changing the preference. */
  window.addEventListener('storage', function (e) {
    if (e.key === STORAGE_KEY) apply(true)
  })

  /* ------------------------------------------------------------------ *
   * Layout control in the paintbrush menu
   *
   * The switch lives with the other layout-ish settings and stays available
   * on both layouts, so the way back from mobile mode is always the same
   * button it came in through.
   * ------------------------------------------------------------------ */

  var MODE_LABELS = [
    { mode: MODE_AUTO, label: 'Auto' },
    { mode: MODE_ON, label: 'Mobile' },
    { mode: MODE_OFF, label: 'Desktop' }
  ]

  function buildLayoutSection () {
    var menu = document.querySelector('#customize-menu .customize-menu-scroll')
    var sound = document.getElementById('customize-sound')
    if (!menu || !sound || menu.querySelector('.customize-layout')) return

    var group = document.createElement('div')
    group.className = 'customize-layout'

    var row = document.createElement('div')
    row.className = 'customize-layout-row'

    var heading = document.createElement('div')
    heading.className = 'customize-section-label'
    heading.textContent = 'Layout'

    var label = document.createElement('span')
    label.className = 'customize-layout-label'
    label.innerHTML = '<i class="fa-solid fa-mobile-screen-button"></i> Mobile mode'

    var state = document.createElement('span')
    state.className = 'customize-layout-state'
    state.id = 'customize-layout-state'

    row.appendChild(label)
    row.appendChild(state)

    var seg = document.createElement('div')
    seg.className = 'customize-layout-seg'
    seg.setAttribute('role', 'radiogroup')
    seg.setAttribute('aria-label', 'Layout mode')

    var note = document.createElement('div')
    note.className = 'customize-layout-note'
    note.id = 'customize-layout-note'

    MODE_LABELS.forEach(function (entry) {
      var btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'customize-layout-opt'
      btn.dataset.mode = entry.mode
      btn.textContent = entry.label
      btn.setAttribute('role', 'radio')
      btn.addEventListener('click', function () {
        setMode(entry.mode)
        if (window.SoundFX) window.SoundFX.play('tick')
      })
      seg.appendChild(btn)
    })

    group.appendChild(heading)
    group.appendChild(row)
    group.appendChild(seg)
    group.appendChild(note)
    // Land before the Sound heading, not between it and the sound controls.
    var soundHeading = sound.previousElementSibling
    menu.insertBefore(group, soundHeading && soundHeading.classList.contains('customize-section-label') ? soundHeading : sound)

    syncLayoutSection()
  }

  function syncLayoutSection () {
    var seg = document.querySelector('.customize-layout-seg')
    if (!seg) return
    var mode = readMode()
    var options = seg.querySelectorAll('.customize-layout-opt')
    for (var i = 0; i < options.length; i++) {
      var active = options[i].dataset.mode === mode
      options[i].classList.toggle('active', active)
      options[i].setAttribute('aria-checked', active ? 'true' : 'false')
    }

    var stateEl = document.getElementById('customize-layout-state')
    if (stateEl) stateEl.textContent = current ? 'On' : 'Off'

    var noteEl = document.getElementById('customize-layout-note')
    if (noteEl) {
      if (mode === MODE_AUTO) {
        noteEl.textContent = isMobileDevice()
          ? 'Following this device: mobile.'
          : 'Following this device: desktop.'
      } else if (mode === MODE_ON) {
        noteEl.textContent = 'Mobile layout forced on for this browser.'
      } else {
        noteEl.textContent = 'Desktop layout forced on for this browser.'
      }
    }
  }

  function ready (fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn)
    else fn()
  }

  ready(buildLayoutSection)
  window.PlutoniumMobile.onChange(syncLayoutSection)
})()
