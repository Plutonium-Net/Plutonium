/**
 * nav.js — Plutonium dynamic navigation
 *
 * Usage (optional, defaults shown):
 *   PlutoniumNav.init({
 *     mode: 'dock',   // 'dock' | 'sidebar' | 'topbar'
 *     items: [...],   // override default nav items
 *   });
 *
 * Reconfigure any time:
 *   PlutoniumNav.setMode('sidebar');
 */

(function () {
  'use strict';

  const DEFAULT_ITEMS = [
    { id: 'home',     fa: 'fa-solid fa-house',          label: 'Home',             href: '#' },
    { id: 'games',    fa: 'fa-solid fa-gamepad',         label: 'Games',            href: '#' },
    { id: 'web',      fa: 'fa-solid fa-globe',           label: 'Web',              href: '#' },
    { id: 'vms',      fa: 'fa-solid fa-server',          label: 'Virtual Machines', href: '#' },
    { id: 'music',    fa: 'fa-solid fa-music',           label: 'Music',            href: '#' },
    { id: 'ai',       fa: 'fa-solid fa-microchip',       label: 'AI',               href: '#' },
    { id: 'cloud',    fa: 'fa-solid fa-cloud',           label: 'Cloud Gaming',     href: '#' },
    { id: 'stream',   fa: 'fa-solid fa-circle-play',     label: 'Streaming',        href: '#' },
    { id: 'settings', fa: 'fa-solid fa-gear',            label: 'Settings',         href: '#' },
    { id: 'sidebar',  fa: 'fa-solid fa-table-columns',   label: 'Layout',           href: '', special: true },
  ];

  // Mode cycle order and the icon that represents the NEXT mode
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

  /* ── Build DOM ─────────────────────────────────────────────────────── */
  function buildNav() {
    const old = document.getElementById('plu-nav');
    if (old) old.remove();

    _nav = document.createElement('nav');
    _nav.id = 'plu-nav';
    _nav.setAttribute('data-mode', _mode);

    // Collapse button — directional arrow, lives before the icon list
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

      const iconEl = document.createElement('i');
      iconEl.className = `plu-nav__icon ${item.fa}`;
      iconEl.setAttribute('aria-hidden', 'true');

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

      a.appendChild(iconEl);
      a.appendChild(labelEl);
      li.appendChild(a);
      list.appendChild(li);
    });

    _nav.appendChild(list);

    // Clock widget
    const clock = document.createElement('div');
    clock.className = 'plu-nav__clock';
    clock.id = 'plu-nav-clock';
    _nav.appendChild(clock);

    document.body.appendChild(_nav);

    // Re-apply collapsed state if it was set before a rebuild
    if (_collapsed) _nav.classList.add('plu-nav--collapsed');

    // Build ghost trigger (sits at the edge, glows pink, hover restores nav)
    buildGhost();

    // Update special button icon to reflect next mode in cycle
    updateSpecialIcon();

    // Start clock
    startClock();

    // Magnification
    attachMagnification();
  }

  /* ── Collapse arrow direction by mode ───────────────────────────────── */
  function collapseArrowClass() {
    if (_mode === 'dock')    return 'fa-solid fa-chevron-down';
    if (_mode === 'topbar')  return 'fa-solid fa-chevron-up';
    if (_mode === 'sidebar') return 'fa-solid fa-chevron-left';
  }

  /* ── Ghost trigger ──────────────────────────────────────────────────── */
  function buildGhost() {
    const old = document.getElementById('plu-nav-ghost');
    if (old) old.remove();

    const ghost = document.createElement('div');
    ghost.id = 'plu-nav-ghost';
    ghost.setAttribute('data-mode', _mode);
    ghost.addEventListener('mouseenter', expand);
    document.body.appendChild(ghost);
  }

  /* ── Collapse / Expand ──────────────────────────────────────────────── */
  function collapse() {
    _collapsed = true;
    _nav.classList.add('plu-nav--collapsed');
    const ghost = document.getElementById('plu-nav-ghost');
    if (ghost) ghost.classList.add('plu-nav-ghost--visible');
  }

  function expand() {
    _collapsed = false;
    _nav.classList.remove('plu-nav--collapsed');
    const ghost = document.getElementById('plu-nav-ghost');
    if (ghost) ghost.classList.remove('plu-nav-ghost--visible');
  }

  /* ── Magnification ──────────────────────────────────────────────────── */
  // macOS-style: hovered icon scales to MAX, neighbours fall off with a
  // gaussian-shaped curve over a REACH window either side.
  const MAG_MAX   = 1.7;   // scale of the hovered icon
  const MAG_REACH = 2.5;   // how many icons either side feel the effect

  function attachMagnification() {
    const items = Array.from(_nav.querySelectorAll('.plu-nav__item'));
    const links = items.map(li => li.querySelector('.plu-nav__link'));
    const isSidebar = _mode === 'sidebar';

    function applyMag(hoveredIndex) {
      links.forEach((link, i) => {
        const dist  = Math.abs(i - hoveredIndex);
        const t     = Math.max(0, 1 - dist / MAG_REACH);
        const scale = 1 + (MAG_MAX - 1) * t * t; // quadratic falloff
        link.style.transform = `scale(${scale.toFixed(3)})`;
        link.style.color = dist === 0 ? 'var(--nav-pink)' : '';
      });
    }

    function resetMag() {
      links.forEach(link => {
        link.style.transform = '';
        link.style.color = '';
      });
    }

    items.forEach((li, i) => {
      li.addEventListener('mouseenter', () => applyMag(i));
    });

    _nav.addEventListener('mouseleave', resetMag);
  }

  /* ── Update special button icon ─────────────────────────────────────── */
  function updateSpecialIcon() {
    const specialIcon  = _nav.querySelector('.plu-nav__link--special .plu-nav__icon');
    const specialLabel = _nav.querySelector('.plu-nav__link--special .plu-nav__label');
    if (!specialIcon) return;
    const next = MODE_NEXT_ICON[_mode];
    specialIcon.className = `plu-nav__icon ${next.fa}`;
    if (specialLabel) specialLabel.textContent = next.label;
  }

  /* ── Animated transition ────────────────────────────────────────────── */
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

  /* ── Clock ──────────────────────────────────────────────────────────── */
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

  /* ── Mode switching ─────────────────────────────────────────────────── */
  function setMode(mode) {
    if (!['dock', 'sidebar', 'topbar'].includes(mode)) {
      console.warn('[PlutoniumNav] Unknown mode:', mode);
      return;
    }
    _mode = mode;
    buildNav();
  }

  /* ── Init ───────────────────────────────────────────────────────────── */
  function init(opts) {
    if (opts) {
      if (opts.mode)  _mode  = opts.mode;
      if (opts.items) _items = opts.items;
    }
    buildNav();
  }

  /* ── Public API ─────────────────────────────────────────────────────── */
  window.PlutoniumNav = { init, setMode };

  /* ── Auto-init ──────────────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init());
  } else {
    init();
  }
})();
