/* games.js — Plutonium games page logic */

(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────────
  const PGCDN_BASE    = 'https://g.cdn.plutoniumnet.work';
  const LS_KEY        = 'plu_games_data';
  const CLOUD_DOC     = 'games_data';
  const SHELF_RECENT  = 10;   // shown in the Recent shelf on the main panel

  // ── State ──────────────────────────────────────────────────────────────────
  let _pgcdnGames = [];   // full game list from config.json
  let _data       = { favourites: [], recent: [] };
  // favourites: string[] of game ids
  // recent:     { id, name, image, path, ts }[] — unlimited, newest first

  // ── Local persistence ──────────────────────────────────────────────────────
  function _loadLocal() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) _data = { favourites: [], recent: [], ...JSON.parse(raw) };
    } catch (_) {}
  }

  function _saveLocal() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(_data)); } catch (_) {}
  }

  // ── Cloud sync ─────────────────────────────────────────────────────────────
  async function _saveCloud() {
    if (typeof PlutoniumStore === 'undefined' || !PlutoniumStore.currentUser) return;
    try {
      await PlutoniumStore.setDoc(CLOUD_DOC, {
        favourites: _data.favourites,
        recent:     _data.recent.map(g => ({ id: g.id, ts: g.ts })),  // full history
      });
      _setBadge(true);
    } catch (e) {
      console.warn('[games] cloud save failed:', e.message);
    }
  }

  async function _loadCloud() {
    if (typeof PlutoniumStore === 'undefined' || !PlutoniumStore.currentUser) return;
    try {
      const doc = await PlutoniumStore.getDoc(CLOUD_DOC);
      if (!doc) return;

      // Merge favourites — union of local + cloud
      const favSet = new Set([..._data.favourites, ...(doc.favourites || [])]);
      _data.favourites = [...favSet];

      // Merge recent — cloud ids mapped back to full game objects, merged with local, deduped, sorted by ts
      const cloudRecent = (doc.recent || [])
        .map(r => {
          const game = _pgcdnGames.find(g => g.id === r.id);
          return game ? { ...game, ts: r.ts } : null;
        })
        .filter(Boolean);

      const merged = [..._data.recent, ...cloudRecent];
      const seen   = new Set();
      _data.recent = merged
        .filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; })
        .sort((a, b) => b.ts - a.ts);
      // no slice — keep full history

      _saveLocal();
      _renderShelves();
      _renderHistory();
      _setBadge(true);
    } catch (e) {
      console.warn('[games] cloud load failed:', e.message);
    }
  }

  // ── Sync badge (small indicator below shelves) ─────────────────────────────
  function _setBadge(synced) {
    const badge = document.getElementById('pgcdn-sync-badge');
    if (!badge) return;
    if (synced) {
      badge.className = 'pgcdn-sync-badge synced';
      badge.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Synced to account';
    } else {
      badge.className = 'pgcdn-sync-badge unsynced';
      badge.innerHTML = '<i class="fa-solid fa-cloud"></i> Sign in to sync across devices';
    }
  }

  // ── Favourites ─────────────────────────────────────────────────────────────
  function _isFav(id) { return _data.favourites.includes(id); }

  function _toggleFav(id) {
    if (_isFav(id)) {
      _data.favourites = _data.favourites.filter(f => f !== id);
    } else {
      _data.favourites.push(id);
    }
    _saveLocal();
    _saveCloud();
    _renderShelves();
    _updateAllFavBtns(id);
    _updateViewerFavBtn();
  }

  function _updateAllFavBtns(id) {
    document.querySelectorAll(`[data-fav-id="${id}"]`).forEach(btn => {
      btn.classList.toggle('is-fav', _isFav(id));
    });
  }

  // ── Recent plays ───────────────────────────────────────────────────────────
  function _recordPlay(game) {
    _data.recent = _data.recent.filter(r => r.id !== game.id);
    _data.recent.unshift({ ...game, ts: Date.now() });
    // no cap — keep full history
    _saveLocal();
    _saveCloud();
    _renderShelves();
    _renderHistory();
  }

  // ── Toast ──────────────────────────────────────────────────────────────────
  const _toast        = document.getElementById('pgcdn-toast');
  const _toastMsg     = document.getElementById('pgcdn-toast-msg');
  const _toastActions = document.getElementById('pgcdn-toast-actions');
  let _toastTimer     = null;

  function _showToast(msg, actions = [], autoDismiss = 0) {
    clearTimeout(_toastTimer);
    _toastMsg.textContent = msg;
    _toastActions.innerHTML = '';
    actions.forEach(a => {
      const btn = document.createElement('button');
      btn.className = 'toast-btn' + (a.danger ? ' toast-btn--danger' : '');
      btn.textContent = a.label;
      btn.addEventListener('click', () => { _hideToast(); a.action(); });
      _toastActions.appendChild(btn);
    });
    _toast.classList.add('toast-visible');
    if (autoDismiss > 0) _toastTimer = setTimeout(_hideToast, autoDismiss);
  }

  function _hideToast() {
    _toast.classList.remove('toast-visible');
    clearTimeout(_toastTimer);
  }

  // ── Context menu ───────────────────────────────────────────────────────────
  const _ctxMenu = document.getElementById('pgcdn-ctx-menu');
  let _ctxDismiss = null;

  function _showCtx(e, items) {
    e.preventDefault();
    _ctxMenu.innerHTML = '';

    items.forEach(item => {
      if (item === 'sep') {
        const sep = document.createElement('div');
        sep.className = 'ctx-sep';
        _ctxMenu.appendChild(sep);
        return;
      }
      const el = document.createElement('div');
      el.className = 'ctx-item' + (item.danger ? ' ctx-item--danger' : '');
      el.innerHTML = `<i class="${item.icon}"></i>${item.label}`;
      el.addEventListener('click', () => { _hideCtx(); item.action(); });
      _ctxMenu.appendChild(el);
    });

    // Position — keep inside viewport
    _ctxMenu.classList.remove('hidden');
    const mw = _ctxMenu.offsetWidth;
    const mh = _ctxMenu.offsetHeight;
    let x = e.clientX, y = e.clientY;
    if (x + mw > window.innerWidth  - 8) x = window.innerWidth  - mw - 8;
    if (y + mh > window.innerHeight - 8) y = window.innerHeight - mh - 8;
    _ctxMenu.style.left = x + 'px';
    _ctxMenu.style.top  = y + 'px';

    // Dismiss on next click / scroll / ESC
    setTimeout(() => {
      _ctxDismiss = () => _hideCtx();
      document.addEventListener('click',   _ctxDismiss, { once: true });
      document.addEventListener('scroll',  _ctxDismiss, { once: true, capture: true });
      document.addEventListener('keydown', _ctxEsc);
    }, 0);
  }

  function _ctxEsc(e) {
    if (e.key === 'Escape') _hideCtx();
  }

  function _hideCtx() {
    _ctxMenu.classList.add('hidden');
    document.removeEventListener('keydown', _ctxEsc);
  }

  // ── Build a card (used for grid + shelves) ─────────────────────────────────
  // zone: 'grid' | 'favs' | 'recent'
  function _buildCard(game, zone = 'grid') {
    const card = document.createElement('div');
    card.className = 'pgcdn-card';
    card.title = game.name;
    card.innerHTML = `
      <img class="pgcdn-card__img" src="${PGCDN_BASE}/${game.image}" alt="${game.name}" loading="lazy" />
      <div class="pgcdn-card__name">${game.name}</div>
      <button class="pgcdn-fav-btn ${_isFav(game.id) ? 'is-fav' : ''}" data-fav-id="${game.id}" title="Favourite" aria-label="Favourite">
        <i class="fa-${_isFav(game.id) ? 'solid' : 'regular'} fa-heart"></i>
      </button>
    `;
    card.querySelector('.pgcdn-fav-btn').addEventListener('click', e => {
      e.stopPropagation();
      const btn = e.currentTarget;
      _toggleFav(game.id);
      btn.innerHTML = `<i class="fa-${_isFav(game.id) ? 'solid' : 'regular'} fa-heart"></i>`;
    });
    card.addEventListener('click', () => pgcdnLaunch(game));
    card.addEventListener('contextmenu', e => _showCardCtx(e, game, zone));
    return card;
  }

  function _showCardCtx(e, game, zone) {
    const isFav    = _isFav(game.id);
    const isRecent = _data.recent.some(r => r.id === game.id);

    const items = [
      {
        icon:   'fa-solid fa-play',
        label:  'Play',
        action: () => pgcdnLaunch(game),
      },
      'sep',
    ];

    // Favs shelf: only show destructive remove (no redundant toggle)
    if (zone === 'favs') {
      items.push({
        icon:   'fa-solid fa-heart-crack',
        label:  'Remove from Favourites',
        danger: true,
        action: () => {
          _data.favourites = _data.favourites.filter(f => f !== game.id);
          _saveLocal(); _saveCloud(); _renderShelves(); _updateAllFavBtns(game.id); _updateViewerFavBtn();
        },
      });
    } else {
      items.push({
        icon:   `fa-${isFav ? 'solid' : 'regular'} fa-heart`,
        label:  isFav ? 'Remove from Favourites' : 'Add to Favourites',
        action: () => _toggleFav(game.id),
      });
    }

    if (zone === 'recent' || zone === 'grid') {
      if (isRecent) {
        items.push({
          icon:   'fa-solid fa-clock-rotate-left',
          label:  'Remove from Recent',
          danger: true,
          action: () => {
            _data.recent = _data.recent.filter(r => r.id !== game.id);
            _saveLocal(); _saveCloud(); _renderShelves(); _renderHistory();
          },
        });
      }
    }

    _showCtx(e, items);
  }

  // ── Render shelves ─────────────────────────────────────────────────────────
  function _renderShelves() {
    // Favourites
    const favShelf = document.getElementById('pgcdn-shelf-favs');
    const favRow   = document.getElementById('pgcdn-favs-row');
    const favGames = _data.favourites
      .map(id => _pgcdnGames.find(g => g.id === id))
      .filter(Boolean);

    if (favGames.length) {
      favRow.innerHTML = '';
      favGames.forEach(g => favRow.appendChild(_buildCard(g, 'favs')));
      favShelf.style.display = '';
    } else {
      favShelf.style.display = 'none';
    }

    // Recent — top SHELF_RECENT only
    const recentShelf = document.getElementById('pgcdn-shelf-recent');
    const recentRow   = document.getElementById('pgcdn-recent-row');

    if (_data.recent.length) {
      recentRow.innerHTML = '';
      _data.recent.slice(0, SHELF_RECENT).forEach(g => recentRow.appendChild(_buildCard(g, 'recent')));
      recentShelf.style.display = '';
    } else {
      recentShelf.style.display = 'none';
    }
  }

  // ── Render history panel ───────────────────────────────────────────────────
  function _renderHistory() {
    const list  = document.getElementById('history-list');
    const count = document.getElementById('history-count');
    if (!list) return;

    if (!_data.recent.length) {
      count.textContent = '';
      list.innerHTML = `<div class="pgcdn-status"><i class="fa-solid fa-clock-rotate-left"></i><span>No history yet</span></div>`;
      return;
    }

    count.textContent = `${_data.recent.length} game${_data.recent.length !== 1 ? 's' : ''} played`;
    list.innerHTML = '';

    _data.recent.forEach(game => {
      const row = document.createElement('div');
      row.className = 'history-list__row';
      row.innerHTML = `
        <img class="history-list__thumb" src="${PGCDN_BASE}/${game.image}" alt="${game.name}" loading="lazy" />
        <div class="history-list__info">
          <div class="history-list__name">${game.name}</div>
          <div class="history-list__time">${_relativeTime(game.ts)}</div>
        </div>
        <button class="history-list__fav ${_isFav(game.id) ? 'is-fav' : ''}" data-fav-id="${game.id}" title="Favourite" aria-label="Favourite">
          <i class="fa-${_isFav(game.id) ? 'solid' : 'regular'} fa-heart"></i>
        </button>
      `;
      row.querySelector('.history-list__fav').addEventListener('click', e => {
        e.stopPropagation();
        const btn = e.currentTarget;
        _toggleFav(game.id);
        btn.className = `history-list__fav ${_isFav(game.id) ? 'is-fav' : ''}`;
        btn.innerHTML = `<i class="fa-${_isFav(game.id) ? 'solid' : 'regular'} fa-heart"></i>`;
      });
      row.addEventListener('click', () => pgcdnLaunch(game));
      list.appendChild(row);
    });
  }

  function _relativeTime(ts) {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(diff / 86400000);
    if (m < 1)  return 'Just now';
    if (m < 60) return `${m}m ago`;
    if (h < 24) return `${h}h ago`;
    if (d < 30) return `${d}d ago`;
    return new Date(ts).toLocaleDateString();
  }

  // ── PlutoniumGCDN init ────────────────────────────────────────────────────
  async function pgcdnInit() {
    _loadLocal();

    try {
      const res = await fetch(`${PGCDN_BASE}/config.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const cfg = await res.json();
      _pgcdnGames = cfg.games || [];
      pgcdnRender(_pgcdnGames);
      _renderShelves();
      _renderHistory();
    } catch (e) {
      document.getElementById('pgcdn-grid-wrap').innerHTML =
        `<div class="pgcdn-status"><i class="fa-solid fa-triangle-exclamation"></i><span>Failed to load games</span></div>`;
    }
  }

  function pgcdnRender(games) {
    const wrap  = document.getElementById('pgcdn-grid-wrap');
    const count = document.getElementById('pgcdn-count');
    count.textContent = `${games.length} game${games.length !== 1 ? 's' : ''}`;

    if (!games.length) {
      wrap.innerHTML = `<div class="pgcdn-status"><i class="fa-solid fa-magnifying-glass"></i><span>No games found</span></div>`;
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'pgcdn-grid';
    games.forEach(game => grid.appendChild(_buildCard(game)));

    wrap.innerHTML = '';
    wrap.appendChild(grid);
  }

  function pgcdnLaunch(game) {
    _recordPlay(game);
    openViewer(`${PGCDN_BASE}/${game.path}`, game.name, game);
  }

  document.getElementById('pgcdn-search').addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    pgcdnRender(q ? _pgcdnGames.filter(g => g.name.toLowerCase().includes(q)) : _pgcdnGames);
  });

  pgcdnInit();

  // ── History clear ─────────────────────────────────────────────────────────
  document.getElementById('history-clear').addEventListener('click', () => {
    _showToast('Clear all play history?', [
      {
        label:  'Cancel',
        action: () => {},
      },
      {
        label:  'Clear',
        danger: true,
        action: () => {
          _data.recent = [];
          _saveLocal();
          _saveCloud();
          _renderShelves();
          _renderHistory();
          _showToast('History cleared', [], 2000);
        },
      },
    ]);
  });

  // ── Auth sync ──────────────────────────────────────────────────────────────
  if (typeof PlutoniumStore !== 'undefined') {
    PlutoniumStore.onAuthChange(async user => {
      if (user) {
        await _loadCloud();
      } else {
        _setBadge(false);
      }
    });
  } else {
    _setBadge(false);
  }

  // ── Source tab switching ───────────────────────────────────────────────────
  let _luminInited = false;

  document.querySelectorAll('.source-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.source-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.source-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('panel-' + tab.dataset.panel).classList.add('active');

      if (tab.dataset.panel === 'lumin' && !_luminInited) {
        _luminInited = true;
        Lumin.init({
          container: '#lumin-container',
          theme: 'dark',
          columns: 6,
          rows: 4,
        });
      }
    });
  });

  // ── Game viewer ───────────────────────────────────────────────────────────
  const viewer      = document.getElementById('game-viewer');
  const iframe      = document.getElementById('game-iframe');
  const viewerBar   = document.getElementById('viewer-bar');
  const viewerGhost = document.getElementById('viewer-bar-ghost');
  const viewerTitle = document.getElementById('viewer-title');
  const vbtnFav     = document.getElementById('vbtn-fav');

  let _barHideTimer  = null;
  let _barManualHide = false;
  let _currentGame   = null;  // game object currently open in viewer

  function _updateViewerFavBtn() {
    if (!_currentGame) return;
    const fav = _isFav(_currentGame.id);
    vbtnFav.classList.toggle('is-fav', fav);
    vbtnFav.querySelector('i').className = `fa-${fav ? 'solid' : 'regular'} fa-heart`;
  }

  function openViewer(url, name, game) {
    iframe.src = url;
    viewerTitle.textContent = name || '';
    _currentGame = game || null;
    viewer.classList.add('active');
    _barManualHide = false;
    _updateViewerFavBtn();
    document.getElementById('plu-nav')?.style.setProperty('display', 'none');
    showBar();
    scheduleBarHide();
  }

  function closeViewer() {
    viewer.classList.remove('active');
    iframe.src = '';
    viewerTitle.textContent = '';
    _currentGame = null;
    clearTimeout(_barHideTimer);
    _barManualHide = false;
    hideBar();
    document.getElementById('plu-nav')?.style.removeProperty('display');
  }

  function showBar() {
    viewerBar.classList.remove('bar-hidden');
    viewerGhost.classList.remove('ghost-visible');
  }

  function hideBar() {
    viewerBar.classList.add('bar-hidden');
    viewerGhost.classList.add('ghost-visible');
  }

  function scheduleBarHide() {
    clearTimeout(_barHideTimer);
    _barHideTimer = setTimeout(hideBar, 3000);
  }

  viewer.addEventListener('mousemove', () => {
    if (_barManualHide) return;
    showBar();
    scheduleBarHide();
  });

  viewerGhost.addEventListener('mouseenter', () => {
    _barManualHide = false;
    showBar();
    scheduleBarHide();
  });

  viewerBar.addEventListener('mouseenter', () => clearTimeout(_barHideTimer));
  viewerBar.addEventListener('mouseleave', () => { if (!_barManualHide) scheduleBarHide(); });

  // Magnification
  const _vbtns = Array.from(viewerBar.querySelectorAll('.viewer-btn'));
  viewerBar.addEventListener('mousemove', e => {
    _vbtns.forEach(btn => {
      const r = btn.getBoundingClientRect();
      const dist = Math.abs(e.clientX - (r.left + r.width / 2));
      const t = Math.max(0, 1 - dist / 80);
      const scale = 1 + 0.7 * t * t;
      btn.style.transform = `scale(${scale.toFixed(3)})`;
      btn.style.color = t > 0.85 ? 'var(--pink)' : '';
    });
  });
  viewerBar.addEventListener('mouseleave', () => {
    _vbtns.forEach(btn => { btn.style.transform = ''; btn.style.color = ''; });
  });

  vbtnFav.addEventListener('click', () => {
    if (!_currentGame) return;
    _toggleFav(_currentGame.id);
    _updateViewerFavBtn();
  });

  document.getElementById('vbtn-back').addEventListener('click', closeViewer);

  document.getElementById('vbtn-reload').addEventListener('click', () => {
    iframe.src = iframe.src;
  });

  document.getElementById('vbtn-fullscreen').addEventListener('click', () => {
    if (iframe.requestFullscreen) iframe.requestFullscreen();
    else if (iframe.webkitRequestFullscreen) iframe.webkitRequestFullscreen();
  });

  document.getElementById('vbtn-hide').addEventListener('click', () => {
    clearTimeout(_barHideTimer);
    _barManualHide = true;
    hideBar();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && viewer.classList.contains('active') && !document.fullscreenElement) {
      closeViewer();
    }
  });

  document.addEventListener('fullscreenchange', () => {
    const icon = document.querySelector('#vbtn-fullscreen i');
    icon.className = document.fullscreenElement
      ? 'fa-solid fa-compress'
      : 'fa-solid fa-expand';
  });

})();
