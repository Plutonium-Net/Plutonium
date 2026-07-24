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
    root.style.setProperty('--nav-item-size',         s.navIconSize + 'px');
    root.style.fontSize = (s.fontScale / 100) + 'em';
  }

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
