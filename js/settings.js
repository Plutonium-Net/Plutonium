(function () {
  'use strict';

  var S       = window.PluSettings;
  var DEFS    = S.DEFAULTS;
  var LS_KEY  = S.LS_KEY;

  var _settings = S.load();
  var _toastTimer = null;

  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(_settings)); } catch (_) {}
    S.apply(_settings);
    _reinitParticles();
  }

  function _reinitParticles() {
    if (typeof particlesJS === 'undefined') return;
    var s = _settings;
    if (s.disableParticles || s.bgStyle !== 'particles') return;
    particlesJS('particles-js', {
      particles: {
        number: { value: s.particleDensity, density: { enable: true, value_area: 800 } },
        color: { value: s.accentColor },
        shape: { type: 'circle' },
        opacity: {
          value: s.particleOpacity,
          random: true,
          anim: { enable: true, speed: 0.6, opacity_min: 0.1, sync: false }
        },
        size: { value: 2.5, random: true, anim: { enable: false } },
        line_linked: {
          enable: true,
          distance: 150,
          color: s.accentColor,
          opacity: 0.12,
          width: 1
        },
        move: {
          enable: true,
          speed: s.particleSpeed,
          direction: 'none',
          random: true,
          straight: false,
          out_mode: 'out',
          bounce: false
        }
      },
      interactivity: {
        detect_on: 'canvas',
        events: {
          onhover: { enable: true, mode: 'repulse' },
          onclick: { enable: false },
          resize: true
        },
        modes: { repulse: { distance: 100, duration: 0.4 } }
      },
      retina_detect: true
    });
  }

  function toast(msg, isError) {
    var el  = document.getElementById('settings-toast');
    var msg_el = document.getElementById('settings-toast-msg');
    var icon = el.querySelector('.settings-toast__icon');
    msg_el.textContent = msg;
    icon.className = 'fa-solid settings-toast__icon ' + (isError ? 'fa-triangle-exclamation' : 'fa-check');
    icon.style.color = isError ? '#ff6b6b' : '#6bffb8';
    el.classList.add('visible');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function () { el.classList.remove('visible'); }, 2600);
  }

  var _confirmCb = null;

  function confirm(msg, cb) {
    document.getElementById('settings-confirm-msg').textContent = msg;
    document.getElementById('settings-confirm').classList.remove('hidden');
    _confirmCb = cb;
  }

  document.getElementById('settings-confirm-cancel').addEventListener('click', function () {
    document.getElementById('settings-confirm').classList.add('hidden');
    _confirmCb = null;
  });

  document.getElementById('settings-confirm-ok').addEventListener('click', function () {
    document.getElementById('settings-confirm').classList.add('hidden');
    if (_confirmCb) { _confirmCb(); _confirmCb = null; }
  });

  function initSidebar() {
    document.querySelectorAll('.settings-nav__link').forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        var id = link.dataset.section;
        document.querySelectorAll('.settings-nav__link').forEach(function (l) { l.classList.remove('active'); });
        document.querySelectorAll('.settings-section').forEach(function (s) { s.classList.remove('active'); });
        link.classList.add('active');
        var sec = document.getElementById('section-' + id);
        if (sec) sec.classList.add('active');
      });
    });
  }

  function initAppearance() {
    var swatches = document.querySelectorAll('#accent-swatches .swatch[data-color]');
    var customInput = document.getElementById('accent-custom-input');

    function markActiveSwatch(color) {
      swatches.forEach(function (s) {
        s.classList.toggle('active', s.dataset.color === color);
      });
    }

    markActiveSwatch(_settings.accentColor);

    swatches.forEach(function (sw) {
      sw.addEventListener('click', function () {
        _settings.accentColor = sw.dataset.color;
        markActiveSwatch(sw.dataset.color);
        customInput.value = sw.dataset.color;
        save();
        toast('Accent color updated');
      });
    });

    customInput.value = _settings.accentColor;
    customInput.addEventListener('input', function () {
      _settings.accentColor = customInput.value;
      markActiveSwatch(customInput.value);
      save();
    });
    customInput.addEventListener('change', function () {
      toast('Accent color updated');
    });

    var bgRadios = document.querySelectorAll('[name="bg-style"]');
    bgRadios.forEach(function (r) {
      if (r.value === _settings.bgStyle) r.checked = true;
      r.addEventListener('change', function () {
        if (!r.checked) return;
        _settings.bgStyle = r.value;
        var ptEl = document.getElementById('particles-js');
        if (ptEl) ptEl.style.display = (r.value !== 'particles') ? 'none' : '';
        document.getElementById('particle-settings').style.display = r.value === 'particles' ? '' : 'none';
        save();
        toast('Background style updated');
      });
    });

    document.getElementById('particle-settings').style.display = _settings.bgStyle === 'particles' ? '' : 'none';

    function rangeInit(id, valId, key, fmt) {
      var el = document.getElementById(id);
      var vl = document.getElementById(valId);
      el.value = _settings[key];
      vl.textContent = fmt ? fmt(_settings[key]) : _settings[key];
      el.addEventListener('input', function () {
        vl.textContent = fmt ? fmt(parseFloat(el.value)) : el.value;
      });
      el.addEventListener('change', function () {
        _settings[key] = parseFloat(el.value);
        save();
        toast('Setting updated');
      });
    }

    rangeInit('particle-density', 'particle-density-val', 'particleDensity', Math.round);
    rangeInit('particle-opacity', 'particle-opacity-val', 'particleOpacity', function(v){ return parseFloat(v).toFixed(2); });
    rangeInit('particle-speed',   'particle-speed-val',   'particleSpeed',   function(v){ return parseFloat(v).toFixed(1); });
    rangeInit('ui-blur',          'blur-val',             'uiBlur',          function(v){ return Math.round(v) + 'px'; });
    rangeInit('font-scale',       'font-scale-val',       'fontScale',       function(v){ return Math.round(v) + '%'; });
  }

  function initNavigation() {
    var navRadios = document.querySelectorAll('[name="nav-layout"]');
    navRadios.forEach(function (r) {
      if (r.value === _settings.navLayout) r.checked = true;
      r.addEventListener('change', function () {
        if (!r.checked) return;
        _settings.navLayout = r.value;
        save();
        if (window.PlutoniumNav) PlutoniumNav.setMode(r.value);
        toast('Nav layout updated');
      });
    });

    var iconSizeEl  = document.getElementById('nav-icon-size');
    var iconSizeVal = document.getElementById('nav-icon-size-val');
    iconSizeEl.value = _settings.navIconSize;
    iconSizeVal.textContent = _settings.navIconSize + 'px';
    iconSizeEl.addEventListener('input', function () {
      iconSizeVal.textContent = iconSizeEl.value + 'px';
    });
    iconSizeEl.addEventListener('change', function () {
      _settings.navIconSize = parseInt(iconSizeEl.value);
      save();
      toast('Icon size updated');
    });

    var magEl  = document.getElementById('nav-mag');
    var magVal = document.getElementById('nav-mag-val');
    magEl.value = _settings.navMag;
    magVal.textContent = parseFloat(_settings.navMag).toFixed(2) + '×';
    magEl.addEventListener('input', function () {
      magVal.textContent = parseFloat(magEl.value).toFixed(2) + '×';
    });
    magEl.addEventListener('change', function () {
      _settings.navMag = parseFloat(magEl.value);
      save();
      toast('Magnification updated');
    });

    function toggleInit(id, key) {
      var el = document.getElementById(id);
      el.checked = !!_settings[key];
      el.addEventListener('change', function () {
        _settings[key] = el.checked;
        save();
        toast('Setting updated');
      });
    }

    toggleInit('show-clock',         'showClock');
    toggleInit('show-clock-seconds', 'showClockSeconds');
  }

  function initPerformance() {
    function toggleInit(id, key) {
      var el = document.getElementById(id);
      el.checked = !!_settings[key];
      el.addEventListener('change', function () {
        _settings[key] = el.checked;
        save();
        toast('Setting updated');
      });
    }
    toggleInit('disable-particles', 'disableParticles');
    toggleInit('reduce-motion',     'reduceMotion');
  }

  function initPersonalization() {
    var greetEl  = document.getElementById('home-greeting');
    var titleEl  = document.getElementById('page-title-suffix');
    var descEl   = document.getElementById('home-desc');

    greetEl.value = _settings.homeGreeting || '';
    titleEl.value = _settings.pageTitleSuffix || '';
    descEl.value  = _settings.homeDesc || '';

    function inputSave(el, key) {
      el.addEventListener('change', function () {
        _settings[key] = el.value.trim();
        save();
        toast('Setting saved');
      });
    }

    inputSave(greetEl, 'homeGreeting');
    inputSave(titleEl, 'pageTitleSuffix');
    inputSave(descEl,  'homeDesc');
  }

  function initAccessibility() {
    function toggleInit(id, key) {
      var el = document.getElementById(id);
      el.checked = !!_settings[key];
      el.addEventListener('change', function () {
        _settings[key] = el.checked;
        save();
        toast('Setting updated');
      });
    }
    toggleInit('high-contrast', 'highContrast');
    toggleInit('bold-text',     'boldText');
    toggleInit('focus-ring',    'focusRing');
  }

  function initData() {
    document.getElementById('export-settings').addEventListener('click', function () {
      var blob = new Blob([JSON.stringify(_settings, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'plutonium-settings.json';
      a.click();
      toast('Settings exported');
    });

    var importInput = document.getElementById('import-settings-input');
    importInput.addEventListener('change', function () {
      var f = importInput.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        try {
          var imported = JSON.parse(ev.target.result);
          _settings = Object.assign({}, DEFS, imported);
          save();
          toast('Settings imported — reloading…');
          setTimeout(function () { location.reload(); }, 1200);
        } catch (_) {
          toast('Invalid settings file', true);
        }
      };
      reader.readAsText(f);
      importInput.value = '';
    });

    document.getElementById('reset-settings').addEventListener('click', function () {
      confirm('Reset ALL settings to defaults? This cannot be undone.', function () {
        _settings = Object.assign({}, DEFS);
        try { localStorage.removeItem(LS_KEY); } catch (_) {}
        save();
        toast('Settings reset — reloading…');
        setTimeout(function () { location.reload(); }, 1200);
      });
    });

    document.getElementById('clear-history').addEventListener('click', function () {
      confirm('Clear all play history?', function () {
        try {
          var raw = localStorage.getItem('plu_games_data');
          if (raw) {
            var d = JSON.parse(raw);
            d.recent = [];
            localStorage.setItem('plu_games_data', JSON.stringify(d));
          }
        } catch (_) {}
        toast('Play history cleared');
      });
    });

    document.getElementById('clear-personal-games').addEventListener('click', function () {
      confirm('Delete ALL personal games? This cannot be undone.', function () {
        var req = indexedDB.deleteDatabase('plutonium_personal_games');
        req.onsuccess = function () { toast('Personal games deleted'); };
        req.onerror   = function () { toast('Failed to delete personal games', true); };
      });
    });
  }

  initSidebar();
  initAppearance();
  initNavigation();
  initPerformance();
  initPersonalization();
  initAccessibility();
  initData();

})();
