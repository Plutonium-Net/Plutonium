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
    dock:    { fa: 'fa-solid fa-bars-staggered',  label: 'Sidebar'  },  // dock → next is sidebar
    sidebar: { fa: 'fa-solid fa-window-maximize', label: 'Top Bar'  },  // sidebar → next is topbar
    topbar:  { fa: 'fa-solid fa-table-columns',   label: 'Dock'     },  // topbar → next is dock
  };

  let _mode  = 'dock';
  let _items = DEFAULT_ITEMS;
  let _nav   = null;

  /* ── Build DOM ─────────────────────────────────────────────────────── */
  function buildNav() {
    const old = document.getElementById('plu-nav');
    if (old) old.remove();

    _nav = document.createElement('nav');
    _nav.id = 'plu-nav';
    _nav.setAttribute('data-mode', _mode);

    if (_mode === 'dock' || _mode === 'topbar') {
      const svgWrap = document.createElement('div');
      svgWrap.className = 'plu-nav__arch-wrap';
      svgWrap.innerHTML = buildArchSVG();
      _nav.appendChild(svgWrap);
    } else if (_mode === 'sidebar') {
      const svgWrap = document.createElement('div');
      svgWrap.className = 'plu-nav__arch-wrap';
      svgWrap.innerHTML = buildArchSVG();
      _nav.appendChild(svgWrap);
    }

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
    document.body.appendChild(_nav);

    // Dock: nudge items up along arch; topbar: nudge items down (inverted)
    if (_mode === 'dock')   applyItemArch(false);
    if (_mode === 'topbar') applyItemArch(true);

    // Sidebar: size the rotated SVG width to match the nav's rendered height
    if (_mode === 'sidebar') sizeSidebarSVG();

    // Update special button icon to reflect next mode in cycle
    updateSpecialIcon();
  }

  /* ── Position sidebar SVG ───────────────────────────────────────────── */
  // The arch SVG is naturally W×H (e.g. 700×90). We rotate it 90° clockwise
  // so it becomes 90px wide × 700px tall visually. We then translate it so:
  //   - its left visual edge aligns with the nav's left edge (x=0)
  //   - it is vertically centered on the nav
  function sizeSidebarSVG() {
    const svg = _nav.querySelector('.plu-nav__arch-svg');
    if (!svg) return;

    const navH  = _nav.getBoundingClientRect().height || 500;
    const svgW  = navH;   // after rotation, SVG visual height = nav height
    const svgH  = 90;     // arch bar thickness (matches dock SVG height)

    // Set the SVG's natural (pre-rotation) dimensions
    svg.style.width  = svgW + 'px';
    svg.style.height = svgH + 'px';

    // After rotate(90deg) around its own center (svgW/2, svgH/2):
    //   visual top-left corner moves to: (svgW/2 - svgH/2, svgH/2 - svgW/2)
    // We want visual left=0, visual top = -(svgW - navH)/2 = 0 (since svgW=navH)
    // So position the SVG so its center lands at (svgH/2, navH/2)
    svg.style.left = (svgH / 2 - svgW / 2) + 'px';  // negative, pulls left
    svg.style.top  = (navH / 2 - svgH / 2) + 'px';
    svg.style.transform        = 'rotate(90deg)';
    svg.style.transformOrigin  = 'center center';
  }

  /* ── Update special button icon ─────────────────────────────────────── */
  function updateSpecialIcon() {
    const specialIcon = _nav.querySelector('.plu-nav__link--special .plu-nav__icon');
    const specialLabel = _nav.querySelector('.plu-nav__link--special .plu-nav__label');
    if (!specialIcon) return;
    const next = MODE_NEXT_ICON[_mode];
    specialIcon.className = `plu-nav__icon ${next.fa}`;
    if (specialLabel) specialLabel.textContent = next.label;
  }

  /* ── Per-item arch nudge ────────────────────────────────────────────── */
  // Mirrors the SVG topRise (16px) as a gentle parabola across the items.
  function applyItemArch(invert = false) {
    const items = _nav.querySelectorAll('.plu-nav__item');
    const count = items.length;
    const peak  = 6; // max nudge at center in px

    items.forEach((el, i) => {
      const t    = count > 1 ? (i / (count - 1)) * 2 - 1 : 0;
      const lift = peak * (1 - t * t);
      // dock: items lift up; topbar: items push down to follow inverted arch
      el.style.transform = invert
        ? `translateY(${lift.toFixed(1)}px)`
        : `translateY(-${lift.toFixed(1)}px)`;
    });
  }

  /* ── SVG sidebar bar ────────────────────────────────────────────────── */
  // D-shape: left edge straight, right edge bows outward (convex right).
  // Top and bottom are rounded. Like a bracket ) shape.
  function buildSidebarSVG() {
    const W      = 70;   // viewBox width  — narrow pill
    const H      = 700;  // viewBox height — CSS scales to actual height
    const r      = 20;   // corner radius top/bottom
    const bow    = 18;   // how far the right edge bows out at center

    // left edge is straight at x=0
    // right edge endpoints are at x = W - bow (corners), bows to x = W at center
    const rx = W - bow; // right edge x at top/bottom corners

    const d = [
      // top-left corner
      `M ${r} 0`,
      // top edge straight →
      `L ${rx - r} 0`,
      // top-right rounded corner
      `Q ${rx} 0 ${rx} ${r}`,
      // right edge: cubic bezier bowing rightward at center
      `C ${W + bow * 0.5} ${H * 0.25} ${W + bow * 0.5} ${H * 0.75} ${rx} ${H - r}`,
      // bottom-right rounded corner
      `Q ${rx} ${H} ${rx - r} ${H}`,
      // bottom edge straight ←
      `L ${r} ${H}`,
      // bottom-left rounded corner
      `Q 0 ${H} 0 ${H - r}`,
      // left edge straight ↑
      `L 0 ${r}`,
      // top-left rounded corner close
      `Q 0 0 ${r} 0`,
      `Z`,
    ].join(' ');

    return `<svg class="plu-nav__arch-svg"
      viewBox="0 0 ${W} ${H}"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none">
      <defs>
        <filter id="nav-glow-sb" x="-40%" y="-10%" width="180%" height="120%">
          <feGaussianBlur stdDeviation="4" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <path d="${d}" fill="rgba(10,10,10,0.85)" />
      <path d="${d}" fill="none"
            stroke="rgba(232,23,93,0.40)" stroke-width="1.4"
            filter="url(#nav-glow-sb)" />
    </svg>`;
  }

  /* ── SVG arch bar ───────────────────────────────────────────────────── */
  // Bridge shape: both top and bottom edges curve upward (convex up).
  // The center of the bar is tallest; ends are shorter — like a stone arch.
  //
  //  top edge:    cubic bezier, control points ABOVE the endpoints  (bows up)
  //  bottom edge: cubic bezier, control points ABOVE the endpoints  (bows up)
  //  net result:  a lens/bridge shape, widest+tallest in the middle
  function buildArchSVG() {
    const W       = 700;  // viewBox width
    const H       = 70;   // viewBox height — room for arch + corner radius
    const r       = 16;   // corner radius at the four ends
    const topRise = 16;   // top center lifts this many px above endpoints
    const botRise = 8;    // bottom center lifts this many px above endpoints
    const endH    = 38;   // bar thickness at the ends (left/right edges)

    // The four corner points (before rounding):
    const tly = H - endH;       // top-left  y  (and top-right y — symmetric)
    const bly = H;               // bot-left  y  (and bot-right y)

    // Bezier control-point Y values (both bow upward → smaller Y = higher)
    const topMidY = tly - topRise;
    const botMidY = bly - botRise;

    // Path: rounded corners via Q, curved edges via C
    // Start at top-left corner, go clockwise
    const d = [
      // top-left rounded corner — start slightly in from the left on the top edge
      `M ${r} ${tly}`,
      // top edge cubic bezier (bows up)
      `C ${W * 0.25} ${topMidY} ${W * 0.75} ${topMidY} ${W - r} ${tly}`,
      // top-right rounded corner
      `Q ${W} ${tly} ${W} ${tly + r}`,
      // right side — short vertical to bottom-right corner
      `L ${W} ${bly - r}`,
      // bottom-right rounded corner
      `Q ${W} ${bly} ${W - r} ${bly}`,
      // bottom edge cubic bezier (bows up)
      `C ${W * 0.75} ${botMidY} ${W * 0.25} ${botMidY} ${r} ${bly}`,
      // bottom-left rounded corner
      `Q 0 ${bly} 0 ${bly - r}`,
      // left side — short vertical back to top-left
      `L 0 ${tly + r}`,
      // top-left rounded corner close
      `Q 0 ${tly} ${r} ${tly}`,
      `Z`,
    ].join(' ');

    return `<svg class="plu-nav__arch-svg"
      viewBox="0 0 ${W} ${H}"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none">
      <defs>
        <filter id="nav-glow" x="-10%" y="-60%" width="120%" height="220%">
          <feGaussianBlur stdDeviation="4" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <path d="${d}" fill="rgba(10,10,10,0.85)" />
      <path d="${d}" fill="none"
            stroke="rgba(232,23,93,0.40)" stroke-width="1.4"
            filter="url(#nav-glow)" />
    </svg>`;
  }

  /* ── Animated transition ────────────────────────────────────────────── */
  // Exit: nav pops off (scale up + fade out toward its origin edge).
  // Enter: new nav pops in from its destination edge.
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

  const EXIT_DURATION = 320; // ms — must match animation duration in CSS

  function animateTransition(nextMode) {
    if (!_nav) { setMode(nextMode); return; }

    // Play exit animation on current nav, then swap after the duration
    const exitClass = EXIT_CLASS[_mode];
    _nav.classList.add(exitClass);

    setTimeout(() => {
      setMode(nextMode);
      // Play enter animation on the newly built nav
      const enterClass = ENTER_CLASS[nextMode];
      if (_nav) _nav.classList.add(enterClass);
    }, EXIT_DURATION);
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
