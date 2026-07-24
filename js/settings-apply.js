(function () {
  'use strict';

  var LS_KEY = 'plu_settings';

  var DEFAULTS = {
    accentColor:       '#e8175d',
    bgStyle:           'particles',
    particleDensity:   80,
    particleOpacity:   0.4,
    particleSpeed:     1.2,
    uiBlur:            14,
    fontScale:         100,
    navLayout:         'dock',
    navIconSize:       40,
    navMag:            1.7,
    showClock:         true,
    showClockSeconds:  true,
    disableParticles:  false,
    reduceMotion:      false,
    homeGreeting:      '',
    pageTitleSuffix:   '',
    homeDesc:          '',
    highContrast:      false,
    boldText:          false,
    focusRing:         false,
  };

  function load() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      return raw ? Object.assign({}, DEFAULTS, JSON.parse(raw)) : Object.assign({}, DEFAULTS);
    } catch (_) { return Object.assign({}, DEFAULTS); }
  }

  function applyRoot(s) {
    var root = document.documentElement;
    var rgb  = _toRgbComponents(s.accentColor);
    root.style.setProperty('--pink',                  s.accentColor);
    root.style.setProperty('--pink-rgb',              rgb);
    root.style.setProperty('--pink-muted',            _darken(s.accentColor));
    root.style.setProperty('--nav-pink',              s.accentColor);
    root.style.setProperty('--scrollbar-thumb',       'rgba(' + rgb + ',0.55)');
    root.style.setProperty('--scrollbar-thumb-hover', 'rgba(' + rgb + ',0.85)');
    root.style.setProperty('--nav-blur',              'blur(' + s.uiBlur + 'px)');
    root.style.setProperty('--ui-blur',               'blur(' + s.uiBlur + 'px)');
    root.style.setProperty('--ui-blur-heavy',         'blur(' + Math.round(s.uiBlur * 1.4) + 'px)');
    root.style.setProperty('--ui-blur-overlay',       'blur(' + Math.round(s.uiBlur * 0.3) + 'px)');
    root.style.setProperty('--nav-item-size',         s.navIconSize + 'px');
    root.style.fontSize = (s.fontScale / 100) + 'em';

    // ── Background opacity scales with blur ───────────────────────────────
    // At blur=0: fully clear. At blur=30: fully solid.
    var t = Math.min(s.uiBlur, 30) / 30;  // 0..1
    var panelOp = _rnd(0.05 + t * 0.95);  // 0.05 → 1.0
    root.style.setProperty('--panel-bg',      'rgba(10,10,10,' + panelOp + ')');
    root.style.setProperty('--panel-bg-dark', 'rgba(10,10,10,' + Math.min(_rnd(panelOp + 0.08), 1) + ')');
    root.style.setProperty('--nav-bg',        'rgba(10,10,10,' + panelOp + ')');
    root.style.setProperty('--surface-1',     'rgba(255,255,255,' + _rnd(t * 0.06) + ')');
    root.style.setProperty('--surface-2',     'rgba(255,255,255,' + _rnd(t * 0.12) + ')');
    root.style.setProperty('--surface-3',     'rgba(255,255,255,' + _rnd(t * 0.18) + ')');
    root.style.setProperty('--surface-4',     'rgba(255,255,255,' + _rnd(t * 0.24) + ')');
    root.style.setProperty('--border-subtle', 'rgba(255,255,255,' + _rnd(t * 0.18) + ')');
    root.style.setProperty('--border-light',  'rgba(255,255,255,' + _rnd(t * 0.24) + ')');
  }

  function _rnd(v) { return Math.round(Math.max(0, v) * 100) / 100; }

  function applyDOM(s) {
    var body = document.body;
    if (!body) return;

    body.classList.toggle('plu-high-contrast', !!s.highContrast);
    body.classList.toggle('plu-bold-text',     !!s.boldText);
    body.classList.toggle('plu-focus-ring',    !!s.focusRing);
    body.classList.toggle('plu-reduce-motion', !!s.reduceMotion);

    /* display toggling for backgrounds is handled entirely by bg-init.js */

    if (s.pageTitleSuffix) {
      var base = document.title.replace(/:\s*.+$/, '');
      document.title = base ? base + ': ' + s.pageTitleSuffix : s.pageTitleSuffix;
    }

    var clock = document.getElementById('plu-nav-clock');
    if (clock) clock.style.display = s.showClock ? '' : 'none';

    document.querySelectorAll('.plu-nav__clock-s').forEach(function (el) {
      el.style.display = s.showClockSeconds ? '' : 'none';
    });

    if (s.homeGreeting) {
      var htEl = document.querySelector('.hero__title');
      if (htEl) htEl.textContent = s.homeGreeting;
    }

    if (s.homeDesc) {
      var hdEl = document.querySelector('.hero__desc');
      if (hdEl) hdEl.textContent = s.homeDesc;
    }
  }

  function apply(s) {
    applyRoot(s);
    applyDOM(s);
  }

  function _darken(hex) {
    var r = parseInt(hex.slice(1,3),16);
    var g = parseInt(hex.slice(3,5),16);
    var b = parseInt(hex.slice(5,7),16);
    r = Math.max(0, Math.floor(r * 0.65));
    g = Math.max(0, Math.floor(g * 0.65));
    b = Math.max(0, Math.floor(b * 0.65));
    return '#' + [r,g,b].map(function(v){ return v.toString(16).padStart(2,'0'); }).join('');
  }

  function _toRgbComponents(hex) {
    var r = parseInt(hex.slice(1,3),16);
    var g = parseInt(hex.slice(3,5),16);
    var b = parseInt(hex.slice(5,7),16);
    return r + ',' + g + ',' + b;
  }

  window.PluSettings = {
    DEFAULTS: DEFAULTS,
    LS_KEY:   LS_KEY,
    load:     load,
    apply:    apply,
  };

  applyRoot(load());

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { applyDOM(load()); });
  } else {
    applyDOM(load());
  }

})();
