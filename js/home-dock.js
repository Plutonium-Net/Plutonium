(function () {
  'use strict';

  const PGCDN_BASE  = 'https://g.cdn.plutoniumnet.work';
  const LS_KEY      = 'plu_home_dock';
  const CLOUD_DOC   = 'home_dock/pins';
  const MAX_PINS    = 12;

  let _pins = []; // array of { id, name, path, image } or { id, name, type:'vm' }

  // ── Persistence ─────────────────────────────────────────────────────────────

  function _loadLocal() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) _pins = JSON.parse(raw);
    } catch (_) {}
  }

  function _saveLocal() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(_pins)); } catch (_) {}
  }

  async function _saveCloud() {
    if (typeof PlutoniumStore === 'undefined' || !PlutoniumStore.currentUser) return;
    try {
      await PlutoniumStore.setDoc(CLOUD_DOC, { pins: _pins });
    } catch (e) {
      console.warn('[home-dock] cloud save failed:', e.message);
    }
  }

  async function _loadCloud() {
    if (typeof PlutoniumStore === 'undefined' || !PlutoniumStore.currentUser) return;
    try {
      const doc = await PlutoniumStore.getDoc(CLOUD_DOC);
      if (!doc?.pins) return;

      // Merge: union by id, cloud wins for ordering, preserve local-only pins
      const cloudIds  = new Set(doc.pins.map(p => p.id));
      const localOnly = _pins.filter(p => !cloudIds.has(p.id));
      _pins = [...doc.pins, ...localOnly].slice(0, MAX_PINS);
      _saveLocal();
      _render();
    } catch (e) {
      console.warn('[home-dock] cloud load failed:', e.message);
    }
  }

  // ── Public API (consumed by games.js on other pages) ────────────────────────

  function isPinned(id) {
    return _pins.some(p => p.id === id);
  }

  function pin(game) {
    if (isPinned(game.id)) return;
    if (_pins.length >= MAX_PINS) _pins.pop(); // drop oldest from end
    if (game.type === 'vm') {
      _pins.unshift({ id: game.id, name: game.name, type: 'vm' });
    } else {
      _pins.unshift({ id: game.id, name: game.name, path: game.path, image: game.image });
    }
    _saveLocal();
    _saveCloud();
    _render();
  }

  function unpin(id) {
    _pins = _pins.filter(p => p.id !== id);
    _saveLocal();
    _saveCloud();
    _render();
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  function _render() {
    const dock = document.getElementById('hero-dock');
    if (!dock) return;

    if (!_pins.length) {
      dock.innerHTML = `
        <div class="hero__dock-empty">
          <i class="fa-solid fa-thumbtack"></i>
          <span>Right-click any game to pin it here</span>
        </div>`;
      return;
    }

    dock.innerHTML = '';
    _pins.forEach(game => {
      const item = document.createElement('a');
      item.className    = 'hero__dock-item';
      item.href         = game.type === 'vm' ? 'vms.html?autostart=1' : `games.html#${game.id}`;
      item.title        = game.name;
      item.dataset.id   = game.id;
      if (game.path) item.dataset.path = game.path;

      const thumb = game.type === 'vm'
        ? `<div class="hero__dock-item__icon"><i class="fa-solid fa-desktop"></i></div>`
        : `<img src="${PGCDN_BASE}/${game.image}" alt="${game.name}" loading="lazy" />`;

      item.innerHTML = `
        ${thumb}
        <span class="hero__dock-item__name">${game.name}</span>
        <button class="hero__dock-unpin" title="Unpin" aria-label="Unpin ${game.name}">
          <i class="fa-solid fa-xmark"></i>
        </button>`;

      // Unpin button
      item.querySelector('.hero__dock-unpin').addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        unpin(game.id);
      });

      dock.appendChild(item);
    });
  }

  // ── Init ─────────────────────────────────────────────────────────────────────

  _loadLocal();
  _render();

  if (typeof PlutoniumStore !== 'undefined') {
    PlutoniumStore.onAuthChange(user => { if (user) _loadCloud(); });
  }

  // Expose for games.js and vms.js (cross-page)
  window.HomeDock = { pin, unpin, isPinned };

})();
