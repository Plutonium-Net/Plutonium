(function () {
  'use strict';

  const DEFAULT_ITEMS = [
    { id: 'home',     img: 'img/brand/icon.png',         label: 'Home',             href: 'index.html' },
    { id: 'games',    fa: 'fa-solid fa-gamepad',         label: 'Games',            href: 'games.html' },
    { id: 'web',      fa: 'fa-solid fa-globe',           label: 'Web',              href: 'web.html' },
    { id: 'vms',      fa: 'fa-solid fa-server',          label: 'Virtual Machines', href: 'vms.html' },
    { id: 'music',    fa: 'fa-solid fa-music',           label: 'Music',            href: 'music.html' },
    { id: 'ai',       fa: 'fa-solid fa-microchip',       label: 'AI',               href: 'ai.html' },
    { id: 'cloud',    fa: 'fa-solid fa-cloud',           label: 'Cloud Gaming',     href: 'cloud.html' },
    { id: 'stream',   fa: 'fa-solid fa-circle-play',     label: 'Streaming',        href: 'stream.html' },
    { id: 'account',  fa: 'fa-solid fa-circle-user',     label: 'Account',          href: 'account.html', account: true },
    { id: 'settings', fa: 'fa-solid fa-gear',            label: 'Settings',         href: '#' },
    { id: 'sidebar',  fa: 'fa-solid fa-table-columns',   label: 'Layout',           href: '', special: true },
  ];

  const MODE_CYCLE = ['dock', 'sidebar', 'topbar'];
  const MODE_NEXT_ICON = {
    dock:    { fa: 'fa-solid fa-bars-staggered',  label: 'Sidebar'  },
    sidebar: { fa: 'fa-solid fa-window-maximize', label: 'Top Bar'  },
    topbar:  { fa: 'fa-solid fa-table-columns',   label: 'Dock'     },
  };

  let _mode      = 'dock';
  let _items     = DEFAULT_ITEMS;
  let _nav       = null;
  let _collapsed = false;

  const PREF_LS_KEY = 'plu_nav_prefs';

  function _prefsFromLS() {
    try {
      const raw = localStorage.getItem(PREF_LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  function _savePrefsLS(mode, collapsed) {
    try { localStorage.setItem(PREF_LS_KEY, JSON.stringify({ mode, collapsed })); } catch (_) {}
  }

  async function _savePrefsCloud(mode, collapsed) {
    if (typeof PlutoniumStore === 'undefined') return;
    const user = PlutoniumStore.currentUser;
    if (!user) return;
    try {
      await PlutoniumStore.setDoc('nav_prefs/data', { mode, collapsed });
    } catch (e) {
      console.warn('[PlutoniumNav] Could not save prefs to cloud:', e);
    }
  }

  async function _loadPrefsCloud() {
    if (typeof PlutoniumStore === 'undefined') return null;
    if (!PlutoniumStore.currentUser) return null;
    try {
      return await PlutoniumStore.getDoc('nav_prefs/data');
    } catch (_) { return null; }
  }

  function _savePrefs() {
    _savePrefsLS(_mode, _collapsed);
    _savePrefsCloud(_mode, _collapsed);
  }

  function _applyPrefs(prefs) {
    if (!prefs) return false;
    let changed = false;
    if (prefs.mode && ['dock', 'sidebar', 'topbar'].includes(prefs.mode) && prefs.mode !== _mode) {
      _mode = prefs.mode;
      changed = true;
    }
    if (typeof prefs.collapsed === 'boolean' && prefs.collapsed !== _collapsed) {
      _collapsed = prefs.collapsed;
      changed = true;
    }
    return changed;
  }

  function buildNav() {
    const old = document.getElementById('plu-nav');
    if (old) old.remove();

    _nav = document.createElement('nav');
    _nav.id = 'plu-nav';
    _nav.setAttribute('data-mode', _mode);

    const collapseBtn = document.createElement('button');
    collapseBtn.className = 'plu-nav__collapse-btn';
    collapseBtn.setAttribute('aria-label', 'Hide navigation');
    const collapseIcon = document.createElement('i');
    collapseIcon.className = collapseArrowClass();
    collapseIcon.setAttribute('aria-hidden', 'true');
    collapseBtn.appendChild(collapseIcon);
    collapseBtn.addEventListener('click', e => { e.preventDefault(); collapse(); });
    _nav.appendChild(collapseBtn);

    const list = document.createElement('ul');
    list.className = 'plu-nav__list';

    _items.forEach(item => {
      const li = document.createElement('li');
      li.className = 'plu-nav__item';

      const a = document.createElement('a');
      a.href = item.href || '#';
      a.className = 'plu-nav__link';
      a.setAttribute('data-id', item.id);
      a.setAttribute('aria-label', item.label);

      if (item.account) {
        a.classList.add('plu-nav__link--account');
        _buildAccountIcon(a);
      } else if (item.img) {
        const imgEl = document.createElement('img');
        imgEl.src = item.img;
        imgEl.className = 'plu-nav__icon plu-nav__icon--img';
        imgEl.alt = item.label;
        imgEl.setAttribute('aria-hidden', 'true');
        a.appendChild(imgEl);
      } else {
        const iconEl = document.createElement('i');
        iconEl.className = `plu-nav__icon ${item.fa}`;
        iconEl.setAttribute('aria-hidden', 'true');
        a.appendChild(iconEl);
      }

      const labelEl = document.createElement('span');
      labelEl.className = 'plu-nav__label';
      labelEl.textContent = item.label;

      if (item.special) {
        a.classList.add('plu-nav__link--special');
        a.addEventListener('click', e => {
          e.preventDefault();
          const next = MODE_CYCLE[(MODE_CYCLE.indexOf(_mode) + 1) % MODE_CYCLE.length];
          animateTransition(next);
        });
      }

      a.appendChild(labelEl);
      li.appendChild(a);
      list.appendChild(li);
    });

    _nav.appendChild(list);

    const clock = document.createElement('div');
    clock.className = 'plu-nav__clock';
    clock.id = 'plu-nav-clock';
    _nav.appendChild(clock);

    document.body.appendChild(_nav);

    if (_collapsed) _nav.classList.add('plu-nav--collapsed');

    buildGhost();
    updateSpecialIcon();
    startClock();
    attachMagnification();
  }

  function _buildAccountIcon(anchor) {
    const user = (typeof PlutoniumStore !== 'undefined') ? PlutoniumStore.currentUser : null;
    anchor.querySelectorAll('.plu-nav__icon, .plu-nav__avatar').forEach(el => el.remove());

    if (user && user.photoUrl) {
      const img = document.createElement('img');
      img.src = user.photoUrl;
      img.className = 'plu-nav__avatar';
      img.alt = user.displayName || 'Account';
      img.setAttribute('aria-hidden', 'true');
      anchor.prepend(img);
    } else {
      const iconEl = document.createElement('i');
      iconEl.className = 'plu-nav__icon fa-solid fa-circle-user';
      iconEl.setAttribute('aria-hidden', 'true');
      anchor.prepend(iconEl);
    }
  }

  function _initAccountIconWatcher() {
    if (typeof PlutoniumStore === 'undefined') return;
    PlutoniumStore.onAuthChange(async (user) => {
      const anchor = _nav && _nav.querySelector('.plu-nav__link--account');
      if (anchor) _buildAccountIcon(anchor);

      if (user) {
        const cloudPrefs = await _loadPrefsCloud();
        if (_applyPrefs(cloudPrefs)) buildNav();
      }
    });
  }

  function collapseArrowClass() {
    if (_mode === 'dock')    return 'fa-solid fa-chevron-down';
    if (_mode === 'topbar')  return 'fa-solid fa-chevron-up';
    if (_mode === 'sidebar') return 'fa-solid fa-chevron-left';
  }

  function buildGhost() {
    const old = document.getElementById('plu-nav-ghost');
    if (old) old.remove();

    const ghost = document.createElement('div');
    ghost.id = 'plu-nav-ghost';
    ghost.setAttribute('data-mode', _mode);
    ghost.addEventListener('mouseenter', expand);
    document.body.appendChild(ghost);
  }

  function collapse() {
    _collapsed = true;
    _nav.classList.add('plu-nav--collapsed');
    const ghost = document.getElementById('plu-nav-ghost');
    if (ghost) ghost.classList.add('plu-nav-ghost--visible');
    _savePrefs();
  }

  function expand() {
    _collapsed = false;
    _nav.classList.remove('plu-nav--collapsed');
    const ghost = document.getElementById('plu-nav-ghost');
    if (ghost) ghost.classList.remove('plu-nav-ghost--visible');
    _savePrefs();
  }

  const MAG_MAX    = 1.7;
  const MAG_RADIUS = 80;

  function attachMagnification() {
    const links = Array.from(_nav.querySelectorAll('.plu-nav__link'));
    const vertical = _mode === 'sidebar';

    function applyMag(mouseX, mouseY) {
      links.forEach(link => {
        const rect   = link.getBoundingClientRect();
        const cx     = rect.left + rect.width  / 2;
        const cy     = rect.top  + rect.height / 2;
        const dist   = vertical ? Math.abs(mouseY - cy) : Math.abs(mouseX - cx);
        const t      = Math.max(0, 1 - dist / MAG_RADIUS);
        const scale  = 1 + (MAG_MAX - 1) * t * t;
        link.style.transform = `scale(${scale.toFixed(3)})`;
        link.style.color     = t > 0.85 ? 'var(--nav-pink)' : '';
      });
    }

    function resetMag() {
      links.forEach(link => {
        link.style.transform = '';
        link.style.color     = '';
      });
      _nav.style.boxShadow = '';
    }

    _nav.addEventListener('mousemove', e => applyMag(e.clientX, e.clientY));
    _nav.addEventListener('mouseleave', resetMag);

    _nav.addEventListener('mouseenter', () => {
      _nav.style.boxShadow =
        '0 0 0 1px rgba(232,23,93,0.35), ' +
        '0 0 18px 4px rgba(232,23,93,0.30), ' +
        '0 0 40px 8px rgba(232,23,93,0.12)';
    });
  }

  function updateSpecialIcon() {
    const specialIcon  = _nav.querySelector('.plu-nav__link--special .plu-nav__icon');
    const specialLabel = _nav.querySelector('.plu-nav__link--special .plu-nav__label');
    if (!specialIcon) return;
    const next = MODE_NEXT_ICON[_mode];
    specialIcon.className = `plu-nav__icon ${next.fa}`;
    if (specialLabel) specialLabel.textContent = next.label;
  }

  const EXIT_CLASS = {
    dock:    'plu-nav--exit-down',
    sidebar: 'plu-nav--exit-left',
    topbar:  'plu-nav--exit-up',
  };
  const ENTER_CLASS = {
    dock:    'plu-nav--enter-down',
    sidebar: 'plu-nav--enter-left',
    topbar:  'plu-nav--enter-up',
  };

  const EXIT_DURATION = 320;

  function animateTransition(nextMode) {
    if (!_nav) { setMode(nextMode); return; }
    _nav.classList.add(EXIT_CLASS[_mode]);
    setTimeout(() => {
      setMode(nextMode);
      if (_nav) _nav.classList.add(ENTER_CLASS[nextMode]);
    }, EXIT_DURATION);
  }

  let _clockTimer = null;

  function startClock() {
    if (_clockTimer) clearInterval(_clockTimer);
    tickClock();
    _clockTimer = setInterval(tickClock, 1000);
  }

  function tickClock() {
    const el = document.getElementById('plu-nav-clock');
    if (!el) return;
    const now   = new Date();
    let   h     = now.getHours();
    const ampm  = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    const hStr  = String(h).padStart(2, '0');
    const m     = String(now.getMinutes()).padStart(2, '0');
    const s     = String(now.getSeconds()).padStart(2, '0');

    el.innerHTML =
      `<span class="plu-nav__clock-hm">${hStr}:${m} <span class="plu-nav__clock-ampm">${ampm}</span></span>` +
      `<span class="plu-nav__clock-s">${s}</span>`;
  }

  function setMode(mode) {
    if (!['dock', 'sidebar', 'topbar'].includes(mode)) {
      console.warn('[PlutoniumNav] Unknown mode:', mode);
      return;
    }
    _mode = mode;
    buildNav();
    _savePrefs();
  }

  async function init(opts) {
    if (opts) {
      if (opts.mode)  _mode  = opts.mode;
      if (opts.items) _items = opts.items;
    }

    _applyPrefs(_prefsFromLS());

    buildNav();
    _initAccountIconWatcher();

    const cloudPrefs = await _loadPrefsCloud();
    if (_applyPrefs(cloudPrefs)) buildNav();
  }

  window.PlutoniumNav = { init, setMode };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init());
  } else {
    init();
  }
})();
