(function () {
  'use strict';

  const PGCDN_BASE = 'https://g.cdn.plutoniumnet.work';
  const GAME_ORIGIN = (function () {
    try { return new URL(PGCDN_BASE).origin; } catch (_) { return '*'; }
  })();

  const LS_KEY = 'plu_games_data';
  const CLOUD_DOC = 'games_data/saved';
  const SHELF_LIMIT = 10;
  const GRID_MIN = 300;
  const GRID_GAP = 18;

  const IDB_KEY = '__plu_idb__';
  const SAVE_DOC_PREFIX = 'game_saves/';

  const SAVE_WRITE_DELAY = 1200;
  const FINAL_SAVE_GRACE = 1600;
  const SAVE_RETRY_DELAY = 15000;
  const SAVE_MAX_CHARS = 900000;

  let games = [];
  let filteredGames = [];
  let data = { recent: [] };
  let knownSaves = null;
  let pendingSaves = null;
  let syncGameId = null;
  let closingGameId = null;
  let currentGame = null;
  let pendingGameUrl = null;
  let launchAnimating = false;
  let historySort = 'recent';
  let historyQuery = '';
  let activePanel = 'pgcdn';
  let luminStarted = false;

  const saveState = new Map();
  const saveQueue = new Map();
  const oversizeWarned = new Set();
  let saveWriteTimer = null;
  let badgeFlashTimer = null;
  let closeFrameTimer = null;

  const els = {};

  function $(id) { return document.getElementById(id); }

  function initEls() {
    [
      'pgcdn-grid-wrap', 'pgcdn-count', 'pgcdn-search', 'pgcdn-sync-badge',
      'pgcdn-shelf-recent', 'pgcdn-recent-row',
      'history-list', 'history-count', 'history-search', 'history-clear',
      'pgcdn-ctx-menu', 'pgcdn-toast', 'pgcdn-toast-msg', 'pgcdn-toast-actions',
      'game-viewer', 'game-iframe', 'game-restore-overlay', 'viewer-bar',
      'viewer-bar-ghost', 'viewer-title', 'viewer-timer', 'viewer-save',
      'game-launch', 'game-launch-btn', 'viewer-bar-hint', 'viewer-bar-logo',
      'game-corner-logo', 'game-launch-logo',
      'games-preload-overlay', 'games-preload-label',
      'pg-details-overlay', 'pg-details', 'pg-details-close', 'pg-details-banner',
      'pg-details-chips', 'pg-details-title', 'pg-details-desc',
      'pg-details-controls-wrap', 'pg-details-controls', 'pg-details-play', 'pg-details-pin'
    ].forEach(id => { els[id] = $(id); });
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) data = { recent: [], ...JSON.parse(raw) };
    } catch (_) {}
  }

  function saveLocal() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch (_) {}
  }

  async function saveCloud() {
    if (typeof PlutoniumStore === 'undefined' || !PlutoniumStore.currentUser) return;
    try {
      await PlutoniumStore.setDoc(CLOUD_DOC, {
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
    clearTimeout(badgeFlashTimer);
    badge.className = 'pgcdn-sync-badge ' + (synced ? 'synced' : 'unsynced');
    badge.innerHTML = synced
      ? '<i class="fa-solid fa-cloud-arrow-up"></i> Synced to account'
      : '<i class="fa-solid fa-cloud"></i> Sign in to sync across devices';
  }

  function flashBadge(text) {
    const badge = els['pgcdn-sync-badge'];
    if (!badge) return;
    if (typeof PlutoniumStore === 'undefined' || !PlutoniumStore.currentUser) return;
    clearTimeout(badgeFlashTimer);
    badge.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> ' + text;
    badgeFlashTimer = setTimeout(() => setBadge(true), 1200);
  }

  function recordPlay(game) {
    data.recent = data.recent.filter(g => g.id !== game.id);
    data.recent.unshift({ ...game, ts: Date.now() });
    saveLocal();
    saveCloud();
    renderShelves();
    renderHistory();
  }

  function saveStateFor(gameId) {
    let st = saveState.get(gameId);
    if (!st) {
      st = { sig: '', idb: null, retryAfter: 0 };
      saveState.set(gameId, st);
    }
    return st;
  }

  function idbBlobOf(saves) {
    if (!saves || typeof saves !== 'object') return null;
    const blob = saves[IDB_KEY];
    return typeof blob === 'string' && blob.length ? blob : null;
  }

  function scheduleSaveWrite() {
    if (saveWriteTimer) clearTimeout(saveWriteTimer);
    saveWriteTimer = setTimeout(flushSaveWrites, SAVE_WRITE_DELAY);
  }

  async function onSaveData(gameId, saves) {
    if (typeof PlutoniumStore === 'undefined' || !PlutoniumStore.currentUser) return;
    if (!gameId || !saves || typeof saves !== 'object') return;
    if (!Object.keys(saves).length) return;

    const st = saveStateFor(gameId);
    if (Date.now() < st.retryAfter) return;

    const fresh = idbBlobOf(saves);
    if (fresh) st.idb = fresh;
    else if (st.idb) saves[IDB_KEY] = st.idb;

    const sig = JSON.stringify(saves);
    if (sig === st.sig) return;

    saveQueue.set(gameId, { saves, sig });
    scheduleSaveWrite();
    renderSaveChip();
  }

  async function flushSaveWrites() {
    saveWriteTimer = null;
    const jobs = Array.from(saveQueue.entries());
    saveQueue.clear();

    for (const [gameId, job] of jobs) {
      const st = saveStateFor(gameId);
      const payload = JSON.stringify(job.saves);

      if (payload.length > SAVE_MAX_CHARS) {
        st.sig = job.sig;
        if (!oversizeWarned.has(gameId)) {
          oversizeWarned.add(gameId);
          console.warn('[games] save for "' + gameId + '" is ' +
            Math.round(payload.length / 1024) + ' KB and exceeds the store limit; not persisted.');
        }
        continue;
      }

      try {
        await PlutoniumStore.setDoc(SAVE_DOC_PREFIX + gameId, {
          saves: payload,
          updatedAt: Date.now()
        });
        st.sig = job.sig;
        st.retryAfter = 0;
        lastSaveAt = Date.now();
        flashBadge('Saved');
        renderSaveChip();

        if (knownSaves && !knownSaves.has(gameId)) {
          knownSaves.add(gameId);
          await saveCloud();
        }
      } catch (e) {
        st.retryAfter = Date.now() + SAVE_RETRY_DELAY;
        console.warn('[games] save-sync write failed:', e.message);
        renderSaveChip();
      }
    }
  }

  async function prefetchGameSaves(gameId) {
    pendingSaves = null;
    if (typeof PlutoniumStore === 'undefined' || !PlutoniumStore.currentUser) return;
    if (!gameId || (knownSaves && !knownSaves.has(gameId))) return;
    showRestoreOverlay();
    try {
      const doc = await PlutoniumStore.getDoc(SAVE_DOC_PREFIX + gameId);
      if (doc && doc.saves) {
        const parsed = JSON.parse(doc.saves);
        pendingSaves = parsed;

        const st = saveStateFor(gameId);
        st.sig = JSON.stringify(parsed);
        st.idb = idbBlobOf(parsed) || st.idb;

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

  function frameTarget() {
    const iframe = els['game-iframe'];
    return iframe && iframe.contentWindow ? iframe.contentWindow : null;
  }

  function postToGame(message) {
    const target = frameTarget();
    if (!target) return false;
    try {
      target.postMessage(message, GAME_ORIGIN);
    } catch (_) {
      return false;
    }
    return true;
  }

  function pushPendingSaves() {
    if (!pendingSaves) return;
    const saves = pendingSaves;
    pendingSaves = null;
    postToGame({ plu: true, type: 'plu_sync_restore', saves });
  }

  function requestSaveSnapshot() {
    if (!syncGameId && !closingGameId) return;
    postToGame({ plu: true, type: 'plu_sync_request' });
  }

  window.addEventListener('message', e => {
    if (!e.data || e.data.plu !== true) return;

    const iframe = els['game-iframe'];
    if (!iframe || e.source !== iframe.contentWindow) return;

    const ownerId = syncGameId || closingGameId;

    if (e.data.type === 'plu_sync_ready') {
      pushPendingSaves();
      setTimeout(requestSaveSnapshot, 1000);
    } else if (e.data.type === 'plu_sync_data' && ownerId) {
      onSaveData(ownerId, e.data.saves);
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

  function shellPins() {
    return window.Pins || (window.parent && window.parent.Pins) || null;
  }

  function pinGame(game) {
    const P = shellPins();
    if (!P) return;
    if (P.find(game.id)) P.remove(game.id);
    else P.add({ id: game.id, name: game.name, image: game.image || undefined });
  }

  /* ------------------------------------------------------------------ *
   * Game overview modal
   *
   * Per-game copy comes from the games CDN: either inline on the game's
   * config.json entry (`description`, `controls`, `banner`, `cloudSync`) or,
   * when present, from a sidecar `/details.json` map keyed by game id.
   * ------------------------------------------------------------------ */

  const PGCDN_DETAILS_URL = PGCDN_BASE + '/details.json';
  const detailsCache = new Map();
  let detailsIndexPromise = null;
  let detailsGame = null;
  let detailsRequest = 0;

  function loadDetailsIndex() {
    if (!detailsIndexPromise) {
      detailsIndexPromise = fetch(PGCDN_DETAILS_URL, { cache: 'default' })
        .then(res => (res.ok ? res.json() : null))
        .then(json => (json && typeof json === 'object' && !Array.isArray(json) ? json : {}))
        .catch(() => ({}));
    }
    return detailsIndexPromise;
  }

  function absoluteCdnUrl(value) {
    const path = String(value || '').trim();
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    return PGCDN_BASE + '/' + path.replace(/^\.?\.?\//, '');
  }

  function normalizeControls(value) {
    if (!value) return [];
    const list = Array.isArray(value) ? value : String(value).split(/\r?\n|;/);
    return list.map(entry => {
      if (entry && typeof entry === 'object') {
        const keys = String(entry.keys || entry.key || entry.input || '').trim();
        const action = String(entry.action || entry.label || entry.does || '').trim();
        return keys || action ? { keys, action } : null;
      }
      const text = String(entry || '').trim();
      if (!text) return null;
      const split = text.match(/^([^:]{1,26})\s*:\s*(.+)$/);
      return split ? { keys: split[1].trim(), action: split[2].trim() } : { keys: '', action: text };
    }).filter(Boolean);
  }

  async function loadGameDetails(game) {
    const cached = detailsCache.get(game.id);
    if (cached) return cached;
    const index = await loadDetailsIndex();
    const extra = (index && index[game.id]) || {};
    const meta = Object.assign({}, game.details || {}, extra);
    const details = {
      description: typeof meta.description === 'string' ? meta.description.trim() : '',
      controls: normalizeControls(meta.controls),
      banner: absoluteCdnUrl(meta.banner || meta.bannerImage || meta.hero),
      cloudSync: meta.cloudSync === true ? true : (meta.cloudSync === false ? false : null),
      tags: Array.isArray(meta.tags) ? meta.tags.slice(0, 4).map(t => String(t).trim()).filter(Boolean) : []
    };
    detailsCache.set(game.id, details);
    return details;
  }

  /* ---- generated banner art ---------------------------------------- *
   * The CDN only ships square thumbnails, so a wide hero banner is
   * composed here: the key art as a blurred ambient backdrop, the sharp
   * artwork contained on the right and the title set on the left, tinted
   * with the current accent. A `banner` field on the CDN still wins.
   * ------------------------------------------------------------------ */

  const BANNER_W = 1200;
  const BANNER_H = 400;
  const BANNER_FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
  const bannerCache = new Map();

  function accentColor() {
    let raw = '';
    try { raw = getComputedStyle(document.documentElement).getPropertyValue('--ui-accent').trim(); } catch (_) {}
    return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw) ? raw : '#e8175d';
  }

  function hexToRgba(hex, alpha) {
    let value = hex.replace('#', '');
    if (value.length === 3) value = value.split('').map(c => c + c).join('');
    const int = parseInt(value, 16);
    return 'rgba(' + ((int >> 16) & 255) + ',' + ((int >> 8) & 255) + ',' + (int & 255) + ',' + alpha + ')';
  }

  function loadArtwork(url) {
    return new Promise(resolve => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  function coverRect(sourceW, sourceH, destW, destH) {
    const scale = Math.max(destW / sourceW, destH / sourceH);
    const w = sourceW * scale;
    const h = sourceH * scale;
    return { x: (destW - w) / 2, y: (destH - h) / 2, w, h };
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  async function generateBanner(game) {
    const accent = accentColor();
    const cacheKey = game.id + '|' + accent;
    if (bannerCache.has(cacheKey)) return bannerCache.get(cacheKey);

    const img = await loadArtwork(gameImage(game));
    if (!img || !img.naturalWidth || !img.naturalHeight) {
      bannerCache.set(cacheKey, '');
      return '';
    }

    let dataUrl = '';
    try {
      const canvas = document.createElement('canvas');
      canvas.width = BANNER_W;
      canvas.height = BANNER_H;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // ambient backdrop: downscale the art, stretch it back up (cheap blur)
        const small = document.createElement('canvas');
        small.width = 48;
        small.height = 16;
        const smallCtx = small.getContext('2d');
        const cover = coverRect(img.naturalWidth, img.naturalHeight, small.width, small.height);
        smallCtx.drawImage(img, cover.x, cover.y, cover.w, cover.h);
        ctx.drawImage(small, 0, 0, BANNER_W, BANNER_H);

        ctx.fillStyle = 'rgba(8,6,10,0.42)';
        ctx.fillRect(0, 0, BANNER_W, BANNER_H);

        const glow = ctx.createRadialGradient(BANNER_W * 0.2, BANNER_H * 0.85, 8, BANNER_W * 0.2, BANNER_H * 0.85, BANNER_W * 0.62);
        glow.addColorStop(0, hexToRgba(accent, 0.34));
        glow.addColorStop(1, hexToRgba(accent, 0));
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, BANNER_W, BANNER_H);

        const scrim = ctx.createLinearGradient(0, 0, BANNER_W, 0);
        scrim.addColorStop(0, 'rgba(6,5,8,0.88)');
        scrim.addColorStop(0.46, 'rgba(6,5,8,0.44)');
        scrim.addColorStop(1, 'rgba(6,5,8,0.1)');
        ctx.fillStyle = scrim;
        ctx.fillRect(0, 0, BANNER_W, BANNER_H);

        // sharp key art, contained on the right, lifted off the backdrop
        const artH = BANNER_H * 0.82;
        const artW = Math.min(artH * (img.naturalWidth / img.naturalHeight), BANNER_W * 0.42);
        const artX = BANNER_W - artW - 56;
        const artY = (BANNER_H - artH) / 2;

        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.7)';
        ctx.shadowBlur = 44;
        ctx.shadowOffsetY = 12;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        roundRectPath(ctx, artX, artY, artW, artH, 20);
        ctx.fill();
        ctx.restore();

        ctx.save();
        roundRectPath(ctx, artX, artY, artW, artH, 20);
        ctx.clip();
        ctx.drawImage(img, artX, artY, artW, artH);
        ctx.restore();

        ctx.save();
        roundRectPath(ctx, artX + 0.5, artY + 0.5, artW - 1, artH - 1, 20);
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();

        // wordmark on the calm left side (the modal prints the title below)
        const padX = 58;
        const markY = Math.round(BANNER_H / 2) - 26;

        ctx.fillStyle = accent;
        roundRectPath(ctx, padX, markY, 54, 6, 3);
        ctx.fill();

        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.font = '700 20px ' + BANNER_FONT;
        ctx.fillStyle = 'rgba(255,255,255,0.94)';
        ctx.fillText('PLUTONIUM NETWORK', padX, markY + 26);

        dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      }
    } catch (_) {
      dataUrl = '';
    }

    bannerCache.set(cacheKey, dataUrl);
    return dataUrl;
  }

  function setBannerSrc(src, onError) {
    const img = els['pg-details-banner'];
    if (!img || !src) return;
    img.classList.add('swapping');

    const cleanup = () => {
      img.removeEventListener('load', settle);
      img.removeEventListener('error', failed);
    };
    const settle = () => { img.classList.remove('swapping'); cleanup(); };
    const failed = () => { cleanup(); if (onError) onError(); else img.classList.remove('swapping'); };

    img.addEventListener('load', settle);
    img.addEventListener('error', failed);
    img.src = src;
    if (img.complete && img.naturalWidth) settle();
  }

  function cloudChipHtml(game, details) {
    const signedIn = typeof PlutoniumStore !== 'undefined' && !!PlutoniumStore.currentUser;
    const savedHere = !!(knownSaves && knownSaves.has(game.id));

    if (savedHere) {
      return '<span class="pg-details__chip pg-details__chip--ok"><i class="fa-solid fa-cloud-arrow-up"></i> Cloud saves active</span>';
    }
    if (details.cloudSync === true) {
      return signedIn
        ? '<span class="pg-details__chip pg-details__chip--ok"><i class="fa-solid fa-cloud-arrow-up"></i> Cloud sync</span>'
        : '<span class="pg-details__chip pg-details__chip--warn"><i class="fa-solid fa-cloud"></i> Cloud sync \u00b7 sign in</span>';
    }
    if (details.cloudSync === false) {
      return '<span class="pg-details__chip"><i class="fa-solid fa-cloud-slash"></i> No cloud sync</span>';
    }
    if (signedIn) {
      return '<span class="pg-details__chip pg-details__chip--muted"><i class="fa-solid fa-cloud"></i> Cloud sync not confirmed</span>';
    }
    return '<span class="pg-details__chip pg-details__chip--muted"><i class="fa-solid fa-user-lock"></i> Sign in to sync saves</span>';
  }

  function renderDetailsPin() {
    const btn = els['pg-details-pin'];
    if (!btn || !detailsGame) return;
    const P = shellPins();
    const pinned = !!(P && P.find(detailsGame.id));
    btn.classList.toggle('is-pinned', pinned);
    btn.innerHTML = '<i class="fa-solid fa-thumbtack"></i><span>' + (pinned ? 'Pinned' : 'Pin to Home') + '</span>';
  }

  function closeDetails() {
    if (!detailsGame) return;
    detailsGame = null;
    detailsRequest++;
    if (els['pg-details-overlay']) els['pg-details-overlay'].classList.remove('active');
  }

  function openDetails(game) {
    const overlay = els['pg-details-overlay'];
    if (!overlay || !game) return;
    detailsGame = game;
    const request = ++detailsRequest;

    els['pg-details-banner'].src = gameImage(game);
    els['pg-details-title'].textContent = game.name;
    els['pg-details-desc'].classList.add('is-loading');
    els['pg-details-desc'].textContent = 'Loading details\u2026';
    els['pg-details-controls'].innerHTML = '';
    els['pg-details-controls-wrap'].hidden = true;
    els['pg-details-chips'].innerHTML =
      '<span class="pg-details__chip"><i class="fa-solid fa-server"></i> Plutonium-GCDN</span>' +
      cloudChipHtml(game, { cloudSync: null });
    renderDetailsPin();

    overlay.classList.add('active');
    if (window.SoundFX) window.SoundFX.play('open');

    loadGameDetails(game).then(async details => {
      if (detailsRequest !== request || detailsGame !== game) return;

      const stillOpen = () => detailsRequest === request && detailsGame === game;

      if (details.banner) {
        // CDN art wins, but the games CDN answers missing files with its own
        // HTML page, so fall back to generated art if it fails to load.
        setBannerSrc(details.banner, () => {
          generateBanner(game).then(art => {
            if (stillOpen() && art) setBannerSrc(art);
          });
        });
      } else {
        const art = await generateBanner(game);
        if (!stillOpen()) return;
        if (art) setBannerSrc(art);
      }

      els['pg-details-desc'].classList.remove('is-loading');
      els['pg-details-desc'].textContent = details.description ||
        'No description has been added for this game yet.';

      let chips = '<span class="pg-details__chip"><i class="fa-solid fa-server"></i> Plutonium-GCDN</span>';
      chips += cloudChipHtml(game, details);
      details.tags.forEach(tag => {
        chips += '<span class="pg-details__chip">' + escapeHtml(tag) + '</span>';
      });
      els['pg-details-chips'].innerHTML = chips;

      if (details.controls.length) {
        els['pg-details-controls'].innerHTML = details.controls.map(row => {
          const action = escapeHtml(row.action);
          return '<span class="pg-details__key">' +
            (row.keys ? '<kbd>' + escapeHtml(row.keys) + '</kbd>' : '') +
            '<span>' + action + '</span></span>';
        }).join('');
        els['pg-details-controls-wrap'].hidden = false;
      }
    });
  }

  function wireDetails() {
    const overlay = els['pg-details-overlay'];
    if (!overlay) return;
    overlay.addEventListener('click', e => {
      if (e.target === overlay || e.target === els['pg-details']) closeDetails();
    });
    if (els['pg-details-close']) els['pg-details-close'].addEventListener('click', closeDetails);
    if (els['pg-details-play']) {
      els['pg-details-play'].addEventListener('click', () => {
        const game = detailsGame;
        closeDetails();
        if (game) launchGame(game, true);
      });
    }
    if (els['pg-details-pin']) {
      els['pg-details-pin'].addEventListener('click', () => {
        if (!detailsGame) return;
        pinGame(detailsGame);
        renderDetailsPin();
        if (window.SoundFX) window.SoundFX.play('switch');
      });
    }
  }

  function showCardCtx(e, game, zone) {
    const P = window.Pins || (window.parent && window.parent.Pins);
    const pinned = !!(P && P.find(game.id));
    const items = [
      { icon: 'fa-solid fa-play', label: 'Play', action: () => launchGame(game, true) },
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
    card.addEventListener('click', () => openDetails(game));
    card.addEventListener('contextmenu', e => showCardCtx(e, game, zone || 'grid'));
    return card;
  }

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

  function measureGridWidth() {
    if (!gridContainer) return;
    const width = gridContainer.clientWidth;
    if (!width) return;
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

  // --- Viewer dock: session clock --------------------------------------
  let sessionTimer = null;
  let sessionStart = 0;
  let saveChipTimer = null;

  function formatSession(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const mm = h ? String(m).padStart(2, '0') : String(m);
    return (h ? h + ':' : '') + mm + ':' + String(s).padStart(2, '0');
  }

  function startSessionTimer() {
    stopSessionTimer();
    sessionStart = Date.now();
    if (els['viewer-timer']) els['viewer-timer'].textContent = '0:00';
    sessionTimer = setInterval(() => {
      if (els['viewer-timer']) els['viewer-timer'].textContent = formatSession(Date.now() - sessionStart);
    }, 1000);
  }

  function stopSessionTimer() {
    if (sessionTimer) clearInterval(sessionTimer);
    sessionTimer = null;
    sessionStart = 0;
  }

  // --- Viewer dock: save-sync chip -------------------------------------
  let lastSaveAt = 0;
  let manualSavingUntil = 0;
  let saveChipMode = '';

  function saveChipState() {
    if (typeof PlutoniumStore === 'undefined' || !PlutoniumStore.currentUser) {
      return { mode: 'off', icon: 'fa-solid fa-cloud', label: 'Sign in to sync',
               title: 'Sign in to sync saves across devices' };
    }
    if (Date.now() < manualSavingUntil || saveQueue.size) {
      return { mode: 'saving', icon: 'fa-solid fa-arrows-rotate', label: 'Saving\u2026',
               title: 'Uploading your save to the cloud' };
    }
    const st = syncGameId ? saveStateFor(syncGameId) : null;
    if (st && st.retryAfter && Date.now() < st.retryAfter) {
      return { mode: 'retry', icon: 'fa-solid fa-triangle-exclamation', label: 'Retry sync',
               title: 'Last sync failed. Click to retry now.' };
    }
    if (lastSaveAt) {
      return { mode: 'saved', icon: 'fa-solid fa-cloud-arrow-up', label: 'Saved',
               title: 'Saved to your account \u00b7 ' + relativeTime(lastSaveAt) };
    }
    return { mode: 'idle', icon: 'fa-solid fa-cloud', label: 'Save sync on',
             title: 'Cloud save sync is active. Click to save now.' };
  }

  function renderSaveChip(force) {
    const chip = els['viewer-save'];
    if (!chip) return;
    const info = saveChipState();
    if (!force && info.mode === saveChipMode) return;
    saveChipMode = info.mode;
    chip.className = 'viewer-save viewer-save--' + info.mode;
    chip.innerHTML = '<i class="' + info.icon + '"></i><span>' + info.label + '</span>';
    chip.title = info.title;
  }

  function saveNow() {
    if (typeof PlutoniumStore === 'undefined' || !PlutoniumStore.currentUser) {
      showToast('Sign in to sync saves across devices', [], 2400);
      return;
    }
    if (!syncGameId) return;
    saveStateFor(syncGameId).retryAfter = 0;
    manualSavingUntil = Date.now() + 1400;
    renderSaveChip(true);
    requestSaveSnapshot();
    setTimeout(() => { if (saveQueue.size) flushSaveWrites(); }, 700);
    clearTimeout(saveChipTimer);
    saveChipTimer = setTimeout(() => renderSaveChip(true), 1700);
  }

  async function launchGame(game, autostart) {
    cancelFrameRelease();
    syncGameId = game.id;
    recordPlay(game);
    if (typeof accountManager !== 'undefined' && accountManager.recordRecent) {
      accountManager.recordRecent({ type: 'game', title: game.name, href: 'pluto://games#' + encodeURIComponent(game.id) })
    }
    await prefetchGameSaves(game.id);
    openViewer(PGCDN_BASE + '/' + game.path, game.name, game);
    if (autostart) startLaunch();
  }

  // Route suffixes look like `#<gameId>` (open the game) optionally with
  // `?autostart=1` (quick-launch it from a home pin or the spotlight).
  function parseGameRoute(suffix) {
    const raw = suffix || '';
    const launchId = decodeURIComponent((raw.match(/#([^?&]*)/) || [,''])[1] || '');
    const autostart = /(?:^|[?&])autostart=1(?:&|#|$)/.test(raw);
    const query = (raw.match(/\?([^#]*)/) || [,''])[1] || '';
    const searchQuery = (new URLSearchParams(query).get('q') || '').trim();
    return { launchId, autostart, searchQuery };
  }

  let barManualHide = false;

  function openViewer(url, name, game) {
    const viewer = els['game-viewer'];
    const iframe = els['game-iframe'];
    if (!viewer || !iframe) return;
    closeDetails();
    pendingGameUrl = url;
    currentGame = game || null;
    els['viewer-title'].textContent = name || '';
    iframe.classList.remove('entering');
    if (els['game-launch']) {
      els['game-launch-btn'].textContent = 'Launch "' + (name || 'Game') + '"';
      els['game-launch-btn'].disabled = false;
      els['game-launch'].classList.remove('done', 'hidden');
    }
    viewer.classList.add('active');
    document.body.classList.add('viewer-open');
    updateBrandLogos();
    if (els['game-corner-logo']) els['game-corner-logo'].classList.remove('visible');
    barManualHide = false;
    lastSaveAt = 0;
    manualSavingUntil = 0;
    saveChipMode = '';
    renderSaveChip(true);
    hideBar();
  }

  function startLaunch() {
    if (launchAnimating || !pendingGameUrl) return;
    const btn = els['game-launch-btn'];
    if (!btn) return;
    launchAnimating = true;
    btn.disabled = true;
    if (window.SoundFX) window.SoundFX.play('launch');

    const rect = btn.getBoundingClientRect();
    const box = document.createElement('div');
    box.className = 'transition-box';
    box.style.width = rect.width + 'px';
    box.style.height = rect.height + 'px';
    box.style.left = rect.left + 'px';
    box.style.top = rect.top + 'px';
    box.style.borderRadius = getComputedStyle(btn).borderRadius;
    document.body.appendChild(box);

    if (els['game-launch']) els['game-launch'].classList.add('done');

    const startWidth = rect.width;
    const startHeight = rect.height;
    const targetSize = 60;
    const centerX = rect.left + startWidth / 2;
    const centerY = rect.top + startHeight / 2;

    let progress = 0;
    const shrink = setInterval(() => {
      progress += 0.025;
      if (progress >= 1) {
        clearInterval(shrink);
        box.style.width = targetSize + 'px';
        box.style.height = targetSize + 'px';
        box.style.left = (centerX - targetSize / 2) + 'px';
        box.style.top = (centerY - targetSize / 2) + 'px';
        box.style.borderRadius = '50%';
        setTimeout(() => driftDown(box), 300);
      } else {
        const eased = 1 - Math.pow(1 - progress, 3);
        const w = startWidth - (startWidth - targetSize) * eased;
        const h = startHeight - (startHeight - targetSize) * eased;
        box.style.width = w + 'px';
        box.style.height = h + 'px';
        box.style.left = (centerX - w / 2) + 'px';
        box.style.top = (centerY - h / 2) + 'px';
        box.style.borderRadius = (targetSize / Math.max(w, h)) * 100 + '%';
      }
    }, 12);

    function driftDown(box) {
      const bar = els['viewer-bar'];
      const r = bar.getBoundingClientRect();
      const barRect = { left: r.left, top: r.top - 16, width: r.width, height: r.height };
      const targetTop = barRect.top + barRect.height / 2 - targetSize / 2;
      const currentTop = parseFloat(box.style.top);
      const totalDistance = targetTop - currentTop;
      let progress = 0;

      const drift = setInterval(() => {
        progress += 0.015;
        if (progress >= 1) {
          clearInterval(drift);
          box.style.top = targetTop + 'px';
          expandIntoBar(box, barRect);
        } else {
          const eased = 1 - Math.pow(1 - progress, 3);
          box.style.top = (currentTop + totalDistance * eased) + 'px';
        }
      }, 10);
    }

    function expandIntoBar(box, barRect) {
      const initialLeft = parseFloat(box.style.left);
      const initialTop = parseFloat(box.style.top);
      const initialWidth = parseFloat(box.style.width);
      const initialHeight = parseFloat(box.style.height);
      const dLeft = initialLeft - barRect.left;
      const dTop = initialTop - barRect.top;
      const dWidth = barRect.width - initialWidth;
      const dHeight = barRect.height - initialHeight;
      let progress = 0;

      const expand = setInterval(() => {
        progress += 0.015;
        if (progress >= 1) {
          clearInterval(expand);
          box.remove();
          loadGame();
        } else {
          const eased = 1 - Math.pow(1 - progress, 3);
          box.style.left = (initialLeft - dLeft * eased) + 'px';
          box.style.top = (initialTop - dTop * eased) + 'px';
          box.style.width = (initialWidth + dWidth * eased) + 'px';
          box.style.height = (initialHeight + dHeight * eased) + 'px';
          box.style.borderRadius = (12 + (48 * eased)) + 'px';
        }
      }, 10);
    }

    function loadGame() {
      launchAnimating = false;
      if (els['game-launch']) els['game-launch'].classList.add('hidden');
      if (els['game-corner-logo']) els['game-corner-logo'].classList.add('visible');
      els['game-iframe'].src = pendingGameUrl;
      els['game-iframe'].classList.add('entering');
      startSessionTimer();
      renderSaveChip(true);
      showBar();
    }
  }

  function releaseGameFrame() {
    clearTimeout(closeFrameTimer);
    closeFrameTimer = null;
    closingGameId = null;
    if (els['game-iframe']) {
      els['game-iframe'].src = '';
      els['game-iframe'].classList.remove('entering');
    }
  }

  function cancelFrameRelease() {
    clearTimeout(closeFrameTimer);
    closeFrameTimer = null;
    closingGameId = null;
  }

  function closeViewer() {
    if (window.SoundFX) window.SoundFX.play('close');

    const closingId = syncGameId;
    if (closingId) {
      closingGameId = closingId;
      syncGameId = null;
      requestSaveSnapshot();
      clearTimeout(closeFrameTimer);
      closeFrameTimer = setTimeout(releaseGameFrame, FINAL_SAVE_GRACE);
    } else {
      releaseGameFrame();
    }

    if (els['game-viewer']) els['game-viewer'].classList.remove('active');
    if (els['viewer-title']) els['viewer-title'].textContent = '';
    if (els['game-launch']) els['game-launch'].classList.remove('done', 'hidden');
    if (els['game-corner-logo']) els['game-corner-logo'].classList.remove('visible');
    currentGame = null;
    pendingGameUrl = null;
    launchAnimating = false;
    document.body.classList.remove('viewer-open');
    clearTimeout(saveChipTimer);
    stopSessionTimer();
    hideBar();
    hideBarHint();
    const stray = document.querySelector('.transition-box');
    if (stray) stray.remove();
  }

  let barHintTimer = null;

  function showBarHint() {
    const hint = els['viewer-bar-hint'];
    if (!hint) return;
    hint.classList.add('hint-visible');
    clearTimeout(barHintTimer);
    barHintTimer = setTimeout(() => hint.classList.remove('hint-visible'), 3500);
  }

  function hideBarHint() {
    const hint = els['viewer-bar-hint'];
    if (!hint) return;
    hint.classList.remove('hint-visible');
    clearTimeout(barHintTimer);
  }

  function showBar() {
    els['viewer-bar'].classList.remove('bar-hidden');
    els['viewer-bar-ghost'].classList.remove('ghost-visible');
    hideBarHint();
  }

  function hideBar() {
    els['viewer-bar'].classList.add('bar-hidden');
    const ghost = els['viewer-bar-ghost'];
    const viewer = els['game-viewer'];
    const launchActive = !!(els['game-launch'] && !els['game-launch'].classList.contains('hidden'));
    if (ghost) ghost.classList.toggle('ghost-visible', !!viewer && viewer.classList.contains('active') && !launchActive);
  }

  function wireViewer() {
    $('vbtn-back').addEventListener('click', closeViewer);
    const saveChip = els['viewer-save'];
    if (saveChip) saveChip.addEventListener('click', saveNow);
    const gameBackBtn = $('game-back-btn');
    if (gameBackBtn) gameBackBtn.addEventListener('click', closeViewer);
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
      showBarHint();
    });
    els['game-viewer'].addEventListener('mousemove', () => {
      if (barManualHide) return;
      if (els['game-launch'] && !els['game-launch'].classList.contains('hidden')) return;
      showBar();
    });
    els['viewer-bar-ghost'].addEventListener('click', () => {
      barManualHide = false;
      if (els['game-launch'] && !els['game-launch'].classList.contains('hidden')) return;
      showBar();
    });
    if (els['game-launch-btn']) {
      els['game-launch-btn'].addEventListener('click', startLaunch);
    }
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && detailsGame) closeDetails();
      if (e.key === 'Escape' && els['game-viewer'].classList.contains('active') && !document.fullscreenElement) closeViewer();
      if (e.key === 'Shift' && e.location === 1 && els['game-viewer'].classList.contains('active')) {
        if (els['game-launch'] && !els['game-launch'].classList.contains('hidden')) return;
        if (els['viewer-bar'].classList.contains('bar-hidden')) {
          barManualHide = false;
          showBar();
        } else {
          barManualHide = true;
          hideBar();
          showBarHint();
        }
      }
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
        if (activePanel === 'pgcdn') measureGridWidth();
      });
    });
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

      const route = parseGameRoute(window.PluWorkspaceRouteSuffix || '');
      const launchId = route.launchId;
      const searchQuery = route.searchQuery;
      if (launchId) {
        const game = games.find(g => g.id === launchId);
        if (game) launchGame(game, route.autostart);
        else showToast('That game is no longer available', [], 3200);
        window.PluWorkspaceRouteSuffix = '';
        history.replaceState(null, '', location.pathname);
      } else if (searchQuery) {
        els['pgcdn-search'].value = searchQuery;
        applySearch(searchQuery);
        window.PluWorkspaceRouteSuffix = '';
        history.replaceState(null, '', location.pathname);
        await preloadImages(filteredGames, (done, total) => {
          const label = els['games-preload-label'];
          if (label) label.textContent = 'Preloading Images… (' + done + '/' + total + ')';
        });
      } else {
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


  function accentIconName() {
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
    try {
      const state = JSON.parse(localStorage.getItem('plu_theme') || '{}');
      return map[String(state.accentColor || '').trim().toLowerCase()] || 'plutonium-pink';
    } catch (_) {
      return 'plutonium-pink';
    }
  }

  function setFavicon() {
    const link = document.querySelector('link[rel="icon"][type="image/png"]');
    if (link) link.href = 'img/logos/icon-' + accentIconName() + '.png';
  }

  function updateBrandLogos() {
    const name = accentIconName();
    ['viewer-bar-logo', 'game-corner-logo', 'game-launch-logo'].forEach(id => {
      const img = els[id];
      if (img) img.src = 'img/logos/icon-' + name + '.png';
    });
  }


  async function init() {
    initEls();
    if (els['games-preload-overlay']) document.body.classList.add('preload-open');
    loadLocal();
    wireTabs();
    wireInputs();
    wireViewer();
    wireDetails();
    setFavicon();
    setBadge(false);
    renderHistory();
    await loadGames();
    if (typeof PlutoniumStore !== 'undefined') {
      PlutoniumStore.onAuthChange(user => {
        if (user) loadCloud();
        else setBadge(false);
        renderSaveChip(true);
      });
    }
    window.addEventListener('plu-workspace-route', () => {
      const route = parseGameRoute(window.PluWorkspaceRouteSuffix || '');
      window.PluWorkspaceRouteSuffix = '';
      if (route.launchId) {
        const game = games.find(g => g.id === route.launchId);
        if (game) launchGame(game, route.autostart);
        else showToast('That game is no longer available', [], 3200);
        history.replaceState(null, '', location.pathname);
      } else if (route.searchQuery) {
        els['pgcdn-search'].value = route.searchQuery;
        applySearch(route.searchQuery);
        history.replaceState(null, '', location.pathname);
      }
    });
  }

  window.addEventListener('pagehide', () => {
    if (saveWriteTimer) {
      clearTimeout(saveWriteTimer);
      saveWriteTimer = null;
    }
    if (saveQueue.size) flushSaveWrites();
  });

  window.PGViewer = { open: openViewer, close: closeViewer, banner: generateBanner };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
