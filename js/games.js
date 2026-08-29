(function () {
  'use strict';

  const PGCDN_BASE = 'https://g.cdn.plutoniumnet.work';
  const LS_KEY = 'plu_games_data';
  const CLOUD_DOC = 'games_data/saved';
  const SHELF_LIMIT = 10;
  // Grid tiles are 4× the original size (2 by 2 of the old tile).
  const GRID_MIN = 300; // min card width (matches the CSS grid)
  const GRID_GAP = 18;  // gap (matches the CSS grid)

  let games = [];
  let filteredGames = [];
  let data = { favourites: [], recent: [] };
  let knownSaves = null;
  let pendingSaves = null;
  let syncGameId = null;
  let currentGame = null;
  let historySort = 'recent';
  let historyQuery = '';
  let activePanel = 'pgcdn';
  let luminStarted = false;

  const els = {};

  function $(id) { return document.getElementById(id); }

  function initEls() {
    [
      'pgcdn-grid-wrap', 'pgcdn-count', 'pgcdn-search', 'pgcdn-sync-badge',
      'pgcdn-shelf-recent', 'pgcdn-recent-row',
      'history-list', 'history-count', 'history-search', 'history-clear',
      'pgcdn-ctx-menu', 'pgcdn-toast', 'pgcdn-toast-msg', 'pgcdn-toast-actions',
      'game-viewer', 'game-iframe', 'game-restore-overlay', 'viewer-bar',
      'viewer-bar-ghost', 'viewer-title', 'vbtn-fav',
      'games-preload-overlay', 'games-preload-label'
    ].forEach(id => { els[id] = $(id); });
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) data = { favourites: [], recent: [], ...JSON.parse(raw) };
    } catch (_) {}
  }

  function saveLocal() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch (_) {}
  }

  async function saveCloud() {
    if (typeof PlutoniumStore === 'undefined' || !PlutoniumStore.currentUser) return;
    try {
      await PlutoniumStore.setDoc(CLOUD_DOC, {
        favourites: data.favourites,
        recent: data.recent.map(g => ({ id: g.id, ts: g.ts })),
        savedGames: knownSaves ? Array.from(knownSaves) : undefined
      });
      setBadge(true);
    } catch (e) {
      console.warn('[games] cloud save failed:', e.message);
    }
  }

  async function loadCloud() {
    if (typeof PlutoniumStore === 'undefined' || !PlutoniumStore.currentUser) return;
    try {
      const doc = await PlutoniumStore.getDoc(CLOUD_DOC);
      if (!doc) {
        knownSaves = new Set();
        return;
      }

      knownSaves = new Set(doc.savedGames || []);
      data.favourites = Array.from(new Set(data.favourites.concat(doc.favourites || [])));

      const cloudRecent = (doc.recent || [])
        .map(r => {
          const game = games.find(g => g.id === r.id);
          return game ? { ...game, ts: r.ts } : null;
        })
        .filter(Boolean);

      const seen = new Set();
      data.recent = data.recent.concat(cloudRecent)
        .filter(g => {
          if (seen.has(g.id)) return false;
          seen.add(g.id);
          return true;
        })
        .sort((a, b) => b.ts - a.ts);

      saveLocal();
      renderShelves();
      renderHistory();
      renderGrid();
      setBadge(true);
    } catch (e) {
      console.warn('[games] cloud load failed:', e.message);
    }
  }

  function setBadge(synced) {
    const badge = els['pgcdn-sync-badge'];
    if (!badge) return;
    badge.className = 'pgcdn-sync-badge ' + (synced ? 'synced' : 'unsynced');
    badge.innerHTML = synced
      ? '<i class="fa-solid fa-cloud-arrow-up"></i> Synced to account'
      : '<i class="fa-solid fa-cloud"></i> Sign in to sync across devices';
  }

  function isFav(id) { return data.favourites.includes(id); }

  function toggleFav(id) {
    data.favourites = isFav(id)
      ? data.favourites.filter(f => f !== id)
      : data.favourites.concat(id);
    saveLocal();
    saveCloud();
    renderShelves();
    renderHistory();
    renderGrid();
    updateViewerFav();
  }

  function recordPlay(game) {
    data.recent = data.recent.filter(g => g.id !== game.id);
    data.recent.unshift({ ...game, ts: Date.now() });
    saveLocal();
    saveCloud();
    renderShelves();
    renderHistory();
  }

  async function onSaveData(gameId, saves) {
    if (typeof PlutoniumStore === 'undefined' || !PlutoniumStore.currentUser) return;
    if (!gameId || !saves || !Object.keys(saves).length) return;
    try {
      await PlutoniumStore.setDoc('game_saves/' + gameId, { saves: JSON.stringify(saves) });
      if (knownSaves && !knownSaves.has(gameId)) {
        knownSaves.add(gameId);
        await saveCloud();
      }
    } catch (e) {
      console.warn('[games] save-sync write failed:', e.message);
    }
  }

  async function prefetchGameSaves(gameId) {
    pendingSaves = null;
    if (typeof PlutoniumStore === 'undefined' || !PlutoniumStore.currentUser) return;
    if (!gameId || (knownSaves && !knownSaves.has(gameId))) return;
    showRestoreOverlay();
    try {
      const doc = await PlutoniumStore.getDoc('game_saves/' + gameId);
      if (doc && doc.saves) {
        pendingSaves = JSON.parse(doc.saves);
        if (knownSaves) knownSaves.add(gameId);
      }
    } catch (e) {
      console.warn('[games] save-sync prefetch failed:', e.message);
    } finally {
      hideRestoreOverlay();
    }
  }

  function showRestoreOverlay() {
    if (els['game-restore-overlay']) els['game-restore-overlay'].classList.add('active');
  }

  function hideRestoreOverlay() {
    if (els['game-restore-overlay']) els['game-restore-overlay'].classList.remove('active');
  }

  function pushPendingSaves() {
    const iframe = els['game-iframe'];
    if (!pendingSaves || !iframe || !iframe.contentWindow) return;
    iframe.contentWindow.postMessage({ plu: true, type: 'plu_sync_restore', saves: pendingSaves }, '*');
    pendingSaves = null;
  }

  function requestSaveSnapshot() {
    const iframe = els['game-iframe'];
    if (!syncGameId || !iframe || !iframe.contentWindow) return;
    iframe.contentWindow.postMessage({ plu: true, type: 'plu_sync_request' }, '*');
  }

  window.addEventListener('message', e => {
    if (!e.data || !e.data.plu) return;
    if (e.data.type === 'plu_sync_ready') {
      pushPendingSaves();
      setTimeout(requestSaveSnapshot, 1000);
    }
    if (e.data.type === 'plu_sync_data' && syncGameId) {
      onSaveData(syncGameId, e.data.saves);
    }
  });

  let toastTimer = null;

  function showToast(message, actions, autoDismiss) {
    clearTimeout(toastTimer);
    if (!els['pgcdn-toast']) return;
    els['pgcdn-toast-msg'].textContent = message;
    els['pgcdn-toast-actions'].innerHTML = '';
    (actions || []).forEach(action => {
      const btn = document.createElement('button');
      btn.className = 'toast-btn' + (action.danger ? ' toast-btn--danger' : '');
      btn.textContent = action.label;
      btn.addEventListener('click', () => {
        hideToast();
        action.action();
      });
      els['pgcdn-toast-actions'].appendChild(btn);
    });
    els['pgcdn-toast'].classList.add('toast-visible');
    if (autoDismiss) toastTimer = setTimeout(hideToast, autoDismiss);
  }

  function hideToast() {
    if (els['pgcdn-toast']) els['pgcdn-toast'].classList.remove('toast-visible');
    clearTimeout(toastTimer);
  }

  function showCtx(e, items) {
    const menu = els['pgcdn-ctx-menu'];
    if (!menu) return;
    e.preventDefault();
    menu.innerHTML = '';
    items.forEach(item => {
      if (item === 'sep') {
        const sep = document.createElement('div');
        sep.className = 'ctx-sep';
        menu.appendChild(sep);
        return;
      }
      const el = document.createElement('button');
      el.className = 'ctx-item' + (item.danger ? ' ctx-item--danger' : '');
      el.innerHTML = '<i class="' + item.icon + '"></i><span>' + item.label + '</span>';
      el.addEventListener('click', () => {
        hideCtx();
        item.action();
      });
      menu.appendChild(el);
    });
    menu.classList.remove('hidden');

    const rect = menu.getBoundingClientRect();
    let x = e.clientX;
    let y = e.clientY;
    if (x + rect.width > window.innerWidth - 8) x = window.innerWidth - rect.width - 8;
    if (y + rect.height > window.innerHeight - 8) y = window.innerHeight - rect.height - 8;
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    setTimeout(() => {
      document.addEventListener('click', hideCtx, { once: true });
      document.addEventListener('scroll', hideCtx, { once: true, capture: true });
    }, 0);
  }

  function hideCtx() {
    if (els['pgcdn-ctx-menu']) els['pgcdn-ctx-menu'].classList.add('hidden');
  }

  function pinGame(game) {
    const P = window.Pins || (window.parent && window.parent.Pins);
    if (!P) return;
    if (P.find(game.id)) P.remove(game.id);
    else P.add({ id: game.id, name: game.name, image: game.image || undefined });
  }

  function showCardCtx(e, game, zone) {
    const P = window.Pins || (window.parent && window.parent.Pins);
    const pinned = !!(P && P.find(game.id));
    const items = [
      { icon: 'fa-solid fa-play', label: 'Play', action: () => launchGame(game) },
      'sep',
      { icon: 'fa-solid fa-thumbtack', label: pinned ? 'Unpin from Home' : 'Pin to Home', action: () => pinGame(game) }
    ];
    if (zone === 'recent' || zone === 'history') {
      items.push({
        icon: 'fa-solid fa-clock-rotate-left',
        label: 'Remove from Recent',
        danger: true,
        action: () => {
          data.recent = data.recent.filter(g => g.id !== game.id);
          saveLocal();
          saveCloud();
          renderShelves();
          renderHistory();
        }
      });
    }
    showCtx(e, items);
  }

  function gameImage(game) { return PGCDN_BASE + '/' + game.image; }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[ch]);
  }

  function buildCard(game, zone) {
    const card = document.createElement('article');
    card.className = 'pgcdn-card';
    card.dataset.id = game.id;
    card.title = game.name;
    card.innerHTML =
      '<img class="pgcdn-card__img" src="' + gameImage(game) + '" alt="' + escapeHtml(game.name) + '" loading="lazy" decoding="async">' +
      '<div class="pgcdn-card__name">' + escapeHtml(game.name) + '</div>' +
      '';
    card.addEventListener('click', () => launchGame(game));
    card.addEventListener('contextmenu', e => showCardCtx(e, game, zone || 'grid'));
    return card;
  }

  // The catalog is small (~100 games), so every tile is rendered once and the
  // browser handles visibility via `content-visibility: auto`. Scrolling then
  // requires zero JS, which keeps the page smooth.
  let gridContainer = null;

  function renderGrid() {
    const wrap = els['pgcdn-grid-wrap'];
    const total = filteredGames.length;
    els['pgcdn-count'].textContent = total + ' game' + (total === 1 ? '' : 's');

    const frag = document.createDocumentFragment();
    filteredGames.forEach(game => {
      const card = buildCard(game, 'grid');
      card.classList.add('pgcdn-card--virtual');
      frag.appendChild(card);
    });

    wrap.innerHTML = '<div class="pgcdn-virtual" id="pgcdn-virtual"></div>';
    gridContainer = $('pgcdn-virtual');
    if (!total) gridContainer.classList.add('is-empty');
    gridContainer.appendChild(frag);
    measureGridWidth();
  }

  // Keep the offscreen-size hint (`--card-w`) in sync with the real column
  // width so the scrollbar never jumps while content-visibility skips layout.
  function measureGridWidth() {
    if (!gridContainer) return;
    const width = gridContainer.clientWidth;
    if (!width) return; // panel hidden — keep last good value
    const columns = Math.max(1, Math.floor((width + GRID_GAP) / (GRID_MIN + GRID_GAP)));
    const cardWidth = Math.floor((width - GRID_GAP * (columns - 1)) / columns);
    gridContainer.style.setProperty('--card-w', cardWidth + 'px');
  }

  function applySearch(query) {
    const q = query.trim().toLowerCase();
    filteredGames = q ? games.filter(g => String(g.name || '').toLowerCase().includes(q)) : games.slice();
    renderGrid();
  }

  function renderShelves() {
    renderShelf('pgcdn-shelf-recent', 'pgcdn-recent-row', data.recent.slice(0, SHELF_LIMIT), 'recent');
  }

  function renderShelf(shelfId, rowId, shelfGames, zone) {
    const shelf = els[shelfId];
    const row = els[rowId];
    if (!shelf || !row) return;
    row.innerHTML = '';
    if (!shelfGames.length) {
      shelf.hidden = true;
      return;
    }
    shelf.hidden = false;
    shelfGames.forEach(game => row.appendChild(buildCard(game, zone)));
  }

  function getHistoryGames() {
    let list = data.recent.slice();
    if (historyQuery) list = list.filter(g => g.name.toLowerCase().includes(historyQuery));
    if (historySort === 'az') list.sort((a, b) => a.name.localeCompare(b.name));
    else list.sort((a, b) => b.ts - a.ts);
    return list;
  }

  function renderHistory() {
    const list = els['history-list'];
    const count = els['history-count'];
    if (!list) return;
    const history = getHistoryGames();
    count.textContent = data.recent.length ? history.length + ' of ' + data.recent.length + ' played' : '';
    if (!data.recent.length) {
      list.innerHTML = '<div class="pgcdn-status"><i class="fa-solid fa-clock-rotate-left"></i><span>No history yet</span></div>';
      return;
    }
    if (!history.length) {
      list.innerHTML = '<div class="pgcdn-status"><i class="fa-solid fa-magnifying-glass"></i><span>No games found</span></div>';
      return;
    }
    const frag = document.createDocumentFragment();
    history.forEach(game => {
      const row = document.createElement('div');
      row.className = 'history-list__row';
      row.innerHTML =
        '<img class="history-list__thumb" src="' + gameImage(game) + '" alt="' + escapeHtml(game.name) + '" loading="lazy" decoding="async">' +
        '<div class="history-list__info">' +
          '<div class="history-list__name">' + escapeHtml(game.name) + '</div>' +
          '<div class="history-list__time">' + relativeTime(game.ts) + '</div>' +
        '</div>' +
        '';
      row.addEventListener('click', () => launchGame(game));
      row.addEventListener('contextmenu', e => showCardCtx(e, game, 'history'));
      frag.appendChild(row);
    });
    list.innerHTML = '';
    list.appendChild(frag);
  }

  function relativeTime(ts) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + 'm ago';
    if (hours < 24) return hours + 'h ago';
    if (days < 30) return days + 'd ago';
    return new Date(ts).toLocaleDateString();
  }

  async function launchGame(game) {
    syncGameId = game.id;
    recordPlay(game);
    await prefetchGameSaves(game.id);
    openViewer(PGCDN_BASE + '/' + game.path, game.name, game);
  }

  let barTimer = null;
  let barManualHide = false;

  function updateViewerFav() {
    if (!currentGame || !els['vbtn-fav']) return;
    const fav = isFav(currentGame.id);
    els['vbtn-fav'].classList.toggle('is-fav', fav);
    els['vbtn-fav'].querySelector('i').className = 'fa-' + (fav ? 'solid' : 'regular') + ' fa-heart';
  }

  function openViewer(url, name, game) {
    const viewer = els['game-viewer'];
    const iframe = els['game-iframe'];
    if (!viewer || !iframe) return;
    iframe.src = url;
    currentGame = game || null;
    els['viewer-title'].textContent = name || '';
    viewer.classList.add('active');
    document.body.classList.add('viewer-open');
    barManualHide = false;
    updateViewerFav();
    showBar();
    scheduleBarHide();
  }

  function closeViewer() {
    requestSaveSnapshot();
    syncGameId = null;
    if (els['game-viewer']) els['game-viewer'].classList.remove('active');
    if (els['game-iframe']) els['game-iframe'].src = '';
    if (els['viewer-title']) els['viewer-title'].textContent = '';
    currentGame = null;
    document.body.classList.remove('viewer-open');
    clearTimeout(barTimer);
    hideBar();
  }

  function showBar() {
    els['viewer-bar'].classList.remove('bar-hidden');
    els['viewer-bar-ghost'].classList.remove('ghost-visible');
  }

  function hideBar() {
    els['viewer-bar'].classList.add('bar-hidden');
    els['viewer-bar-ghost'].classList.add('ghost-visible');
  }

  function scheduleBarHide() {
    clearTimeout(barTimer);
    barTimer = setTimeout(() => {
      if (!barManualHide) hideBar();
    }, 2600);
  }

  function wireViewer() {
    $('vbtn-back').addEventListener('click', closeViewer);
    $('vbtn-reload').addEventListener('click', () => {
      if (els['game-iframe']) els['game-iframe'].src = els['game-iframe'].src;
    });
    $('vbtn-fullscreen').addEventListener('click', () => {
      const iframe = els['game-iframe'];
      if (!iframe) return;
      if (iframe.requestFullscreen) iframe.requestFullscreen();
      else if (iframe.webkitRequestFullscreen) iframe.webkitRequestFullscreen();
    });
    $('vbtn-hide').addEventListener('click', () => {
      barManualHide = true;
      hideBar();
    });
    els['vbtn-fav'].addEventListener('click', () => {
      if (currentGame) toggleFav(currentGame.id);
    });
    els['game-viewer'].addEventListener('mousemove', () => {
      if (barManualHide) return;
      showBar();
      scheduleBarHide();
    });
    els['viewer-bar-ghost'].addEventListener('mouseenter', () => {
      barManualHide = false;
      showBar();
      scheduleBarHide();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && els['game-viewer'].classList.contains('active') && !document.fullscreenElement) closeViewer();
    });
    document.addEventListener('fullscreenchange', () => {
      const icon = document.querySelector('#vbtn-fullscreen i');
      if (icon) icon.className = document.fullscreenElement ? 'fa-solid fa-compress' : 'fa-solid fa-expand';
    });
  }

  function positionSourceSlider() {
    const tabs = document.querySelector('.source-tabs');
    const active = tabs && tabs.querySelector('.source-tab.active');
    if (!tabs || !active) return;
    const tabsRect = tabs.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const borderOffset = tabs.clientLeft;
    tabs.style.setProperty('--source-slider-left', (activeRect.left - tabsRect.left - borderOffset) + 'px');
    tabs.style.setProperty('--source-slider-width', activeRect.width + 'px');
    tabs.classList.add('is-positioned');
  }

  function wireTabs() {
    document.querySelectorAll('.source-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        activePanel = tab.dataset.panel;
        document.querySelectorAll('.source-tab').forEach(t => t.classList.toggle('active', t === tab));
        positionSourceSlider();
        document.querySelectorAll('.source-panel').forEach(panel => panel.classList.toggle('active', panel.id === 'panel-' + activePanel));
        if (activePanel === 'lumin' && !luminStarted && window.Lumin) {
          luminStarted = true;
          Lumin.init({ container: '#lumin-container', theme: 'dark', columns: 6, rows: 4 });
        }
        // Grid may have been resized while hidden — refresh the size hint.
        if (activePanel === 'pgcdn') measureGridWidth();
      });
    });
    // The workspace can still be transitioning into view when tabs are wired,
    // so the first measurement may use stale/hidden geometry. Re-measure once
    // the browser has committed the initial layout and again after the first paint.
    positionSourceSlider();
    requestAnimationFrame(() => {
      positionSourceSlider();
      requestAnimationFrame(positionSourceSlider);
    });
    window.addEventListener('resize', positionSourceSlider);
  }

  function wireInputs() {
    let searchTimer = null;
    els['pgcdn-search'].addEventListener('input', e => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => applySearch(e.target.value), 90);
    });

    let historyTimer = null;
    els['history-search'].addEventListener('input', e => {
      clearTimeout(historyTimer);
      historyTimer = setTimeout(() => {
        historyQuery = e.target.value.trim().toLowerCase();
        renderHistory();
      }, 90);
    });

    function positionHistorySlider() {
      const group = document.querySelector('.history-sort-group');
      if (!group) return;
      const buttons = Array.from(group.querySelectorAll('.history-sort-btn'));
      if (!buttons.length) return;
      const active = group.querySelector('.history-sort-btn.active') || buttons[0];
      buttons.forEach(btn => btn.classList.toggle('active', btn === active));
      const buttonIndex = buttons.indexOf(active);
      const buttonWidth = active.getBoundingClientRect().width;
      const gap = parseFloat(getComputedStyle(group).gap) || 0;
      group.style.setProperty('--history-slider-offset', (buttonIndex * (buttonWidth + gap)) + 'px');
    }

    document.querySelectorAll('.history-sort-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.history-sort-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        historySort = btn.dataset.sort;
        positionHistorySlider();
        renderHistory();
      });
    });
    positionHistorySlider();
    requestAnimationFrame(() => {
      positionHistorySlider();
      requestAnimationFrame(positionHistorySlider);
    });
    window.addEventListener('resize', positionHistorySlider);

    els['history-clear'].addEventListener('click', () => {
      showToast('Clear all play history?', [
        { label: 'Cancel', action: () => {} },
        {
          label: 'Clear',
          danger: true,
          action: () => {
            data.recent = [];
            saveLocal();
            saveCloud();
            renderShelves();
            renderHistory();
            showToast('History cleared', [], 1800);
          }
        }
      ]);
    });

    document.addEventListener('keydown', e => {
      if (e.key !== '/') return;
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const target = activePanel === 'history' ? els['history-search'] : els['pgcdn-search'];
      if (!target) return;
      e.preventDefault();
      target.focus();
      target.select();
    });

    window.addEventListener('resize', measureGridWidth);
  }

  // Preload every game thumbnail (e.g. `https://g.cdn.../img/...`) so the
  // catalog is fully warm by the time the preload overlay is lifted.
  function preloadImages(list, onProgress) {
    return new Promise(resolve => {
      const items = (list || []).filter(g => g && g.image);
      const total = items.length;
      if (!total) { resolve(); return; }
      let finished = 0;
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const tick = () => {
        finished++;
        if (onProgress) onProgress(finished, total);
        if (finished >= total) settle();
      };
      items.forEach(g => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = tick;
        img.onerror = tick;
        img.src = gameImage(g);
      });
      // Backstop: never leave the page blocked if a request hangs.
      setTimeout(settle, 15000);
    });
  }

  function finishPreload() {
    const overlay = els['games-preload-overlay'];
    if (!overlay) return;
    overlay.classList.add('done');
    document.body.classList.remove('preload-open');
  }

  async function loadGames() {
    els['pgcdn-grid-wrap'].innerHTML = '<div class="pgcdn-status"><div class="pgcdn-spinner"></div><span>Loading games...</span></div>';
    try {
      const res = await fetch(PGCDN_BASE + '/config.json', { cache: 'default' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const cfg = await res.json();
      games = (cfg.games || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
      filteredGames = games.slice();
      renderGrid();
      renderShelves();
      renderHistory();

      const routeSuffix = window.PluWorkspaceRouteSuffix || '';
      const launchId = decodeURIComponent((routeSuffix.match(/#(.*)$/) || [,''])[1]);
      if (launchId) {
        // Deep-linked straight into a game — don't block on thumbnail preload.
        const game = games.find(g => g.id === launchId);
        if (game) launchGame(game);
        window.PluWorkspaceRouteSuffix = '';
        history.replaceState(null, '', location.pathname);
      } else {
        // Preload all images before letting the user in.
        await preloadImages(games, (done, total) => {
          const label = els['games-preload-label'];
          if (label) label.textContent = 'Preloading Images… (' + done + '/' + total + ')';
        });
      }
    } catch (e) {
      els['pgcdn-grid-wrap'].innerHTML = '<div class="pgcdn-status"><i class="fa-solid fa-triangle-exclamation"></i><span>Failed to load games</span></div>';
    } finally {
      finishPreload();
    }
  }

  function setFavicon() {
    const map = {
      '#e8175d': 'plutonium-pink',
      '#7c3aed': 'violet',
      '#3c5085': 'blue',
      '#059669': 'emerald',
      '#d97706': 'amber',
      '#dc2626': 'red',
      '#0891b2': 'cyan',
      '#c026d3': 'fuchsia'
    };
    function iconName() {
      try {
        const state = JSON.parse(localStorage.getItem('plu_theme') || '{}');
        return map[String(state.accentColor || '').trim().toLowerCase()] || 'plutonium-pink';
      } catch (_) {
        return 'plutonium-pink';
      }
    }
    const link = document.querySelector('link[rel="icon"][type="image/png"]');
    if (link) link.href = 'img/logos/icon-' + iconName() + '.png';
  }

  async function init() {
    initEls();
    if (els['games-preload-overlay']) document.body.classList.add('preload-open');
    loadLocal();
    wireTabs();
    wireInputs();
    wireViewer();
    setFavicon();
    setBadge(false);
    renderHistory();
    await loadGames();
    if (typeof PlutoniumStore !== 'undefined') {
      PlutoniumStore.onAuthChange(user => {
        if (user) loadCloud();
        else setBadge(false);
      });
    }
  }

  window.PGViewer = { open: openViewer, close: closeViewer };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
