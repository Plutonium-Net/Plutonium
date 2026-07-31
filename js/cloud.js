(function () {
  'use strict';

  // ── Config ────────────────────────────────────────────────────────────────
  const SERVER  = 'https://cgapi.cdn.plutoniumnet.work';
  const API_KEY = 'b9c3d2c6509c74c0db54d77d9fbd31e26e9b85a86d3dfc0b6a1c5d91c8a7f4e37f2d1e6845bc9a1f0e8d4f63b72ac59f4c1de0a97b5f3d86e2c9a4f7813db6a';
  const AUTH    = 'Bearer ' + API_KEY;

  // ── State ─────────────────────────────────────────────────────────────────
  const grid       = document.getElementById('cg-grid');
  const searchInput = document.getElementById('cg-search');
  const countEl    = document.getElementById('cg-count');
  const tagsRow    = document.getElementById('cg-tags');

  let _allGames   = [];
  let _activeTag  = null;
  let _searchQ    = '';

  // ── Build tag filter pills ────────────────────────────────────────────────
  function _buildTagPills(games) {
    const tagSet = new Set();
    games.forEach(function (g) {
      (g.tags || []).forEach(function (t) { tagSet.add(t); });
    });
    const sorted = Array.from(tagSet).sort();
    tagsRow.innerHTML = '';

    sorted.forEach(function (tag) {
      const btn = document.createElement('button');
      btn.className = 'cg-tag-pill';
      btn.textContent = tag;
      btn.dataset.tag = tag;
      btn.addEventListener('click', function () {
        if (_activeTag === tag) {
          _activeTag = null;
          btn.classList.remove('active');
        } else {
          _activeTag = tag;
          tagsRow.querySelectorAll('.cg-tag-pill').forEach(function (b) {
            b.classList.toggle('active', b.dataset.tag === tag);
          });
        }
        _renderGrid();
      });
      tagsRow.appendChild(btn);
    });
  }

  // ── Filter + render cards ─────────────────────────────────────────────────
  function _renderGrid() {
    const q = _searchQ.trim().toLowerCase();
    const filtered = _allGames.filter(function (g) {
      const matchSearch = !q || g.name.toLowerCase().includes(q) || (g.description || '').toLowerCase().includes(q);
      const matchTag    = !_activeTag || (g.tags || []).includes(_activeTag);
      return matchSearch && matchTag;
    });

    countEl.textContent = filtered.length + ' game' + (filtered.length !== 1 ? 's' : '');

    grid.innerHTML = '';
    if (filtered.length === 0) {
      grid.innerHTML = '<p class="cg-empty">No games match your search.</p>';
      return;
    }

    filtered.forEach(function (game) {
      const card = document.createElement('div');
      card.className = 'cg-card';

      const tagPills = (game.tags || []).map(function (t) {
        return '<span class="cg-card__tag">' + t + '</span>';
      }).join('');

      card.innerHTML =
        '<img class="cg-card__img" src="' + game.image + '" alt="' + game.name + '" loading="lazy" />' +
        '<div class="cg-card__body">' +
          (tagPills ? '<div class="cg-card__tags">' + tagPills + '</div>' : '') +
          '<div class="cg-card__title">' + game.name + '</div>' +
          '<div class="cg-card__desc">' + game.description + '</div>' +
        '</div>';

      card.addEventListener('click', function () { _openDetail(game); });
      grid.appendChild(card);
    });
  }

  // ── Load game list ────────────────────────────────────────────────────────
  fetch('data/cloud.json')
    .then(function (r) { return r.json(); })
    .then(function (games) {
      _allGames = games.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
      _buildTagPills(games);
      _renderGrid();
    })
    .catch(function () {
      grid.innerHTML = '<p class="cg-empty">Failed to load games.</p>';
    });

  // ── Search input ──────────────────────────────────────────────────────────
  if (searchInput) {
    searchInput.addEventListener('input', function () {
      _searchQ = searchInput.value;
      _renderGrid();
    });
  }

  // ── Detail modal ──────────────────────────────────────────────────────────
  let _detailOverlay = null;

  function _ensureDetailOverlay() {
    if (_detailOverlay) return;

    _detailOverlay = document.createElement('div');
    _detailOverlay.id = 'cg-detail-overlay';
    _detailOverlay.innerHTML =
      '<div class="cg-detail-box">' +
        '<button class="cg-detail-close" id="cg-detail-close" aria-label="Close">✕</button>' +
        '<div class="cg-detail-hero" id="cg-detail-hero">' +
          '<img class="cg-detail-cover" id="cg-detail-cover" src="" alt="" />' +
          '<div class="cg-detail-scrim"></div>' +
        '</div>' +
        '<div class="cg-detail-body">' +
          '<div class="cg-detail-tags" id="cg-detail-tags"></div>' +
          '<h2 class="cg-detail-title" id="cg-detail-title"></h2>' +
          '<p class="cg-detail-desc" id="cg-detail-desc"></p>' +
          '<button class="cg-detail-play" id="cg-detail-play">' +
            '<span class="cg-detail-play__icon">▶</span> Play Now' +
          '</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(_detailOverlay);

    document.getElementById('cg-detail-close').addEventListener('click', _closeDetail);
    _detailOverlay.addEventListener('click', function (e) {
      if (e.target === _detailOverlay) _closeDetail();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && _detailOverlay && _detailOverlay.classList.contains('open')) {
        _closeDetail();
      }
    });
  }

  function _openDetail(game) {
    _ensureDetailOverlay();

    document.getElementById('cg-detail-cover').src = game.cover || game.image;
    document.getElementById('cg-detail-cover').alt = game.name;
    document.getElementById('cg-detail-title').textContent = game.name;
    document.getElementById('cg-detail-desc').textContent = game.description;

    const tagsEl = document.getElementById('cg-detail-tags');
    tagsEl.innerHTML = (game.tags || []).map(function (t) {
      return '<span class="cg-card__tag">' + t + '</span>';
    }).join('');

    const playBtn = document.getElementById('cg-detail-play');
    const newPlay = playBtn.cloneNode(true);
    playBtn.parentNode.replaceChild(newPlay, playBtn);
    newPlay.addEventListener('click', function () {
      _closeDetail();
      _launch(game);
    });

    _detailOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function _closeDetail() {
    if (!_detailOverlay) return;
    _detailOverlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  // ── Launch overlay ────────────────────────────────────────────────────────
  let _overlay     = null;
  let _iframe      = null;
  let _statusEl    = null;
  let _bar         = null;
  let _ghost       = null;
  let _barTimer    = null;
  let _currentUuid = null;
  let _currentGame = null;

  function _ensureOverlay() {
    if (_overlay) return;

    // ── fullscreen backdrop + loading panel ───────────────────────────────
    _overlay = document.createElement('div');
    _overlay.id = 'cg-launch-overlay';
    _overlay.innerHTML =
      '<div class="cg-launch-status" id="cg-launch-status">' +
        '<div class="cg-launch-status-inner">' +
          '<div class="cg-launch-game-title" id="cg-launch-game-title"></div>' +
          '<ol class="cg-steps" id="cg-steps">' +
            '<li class="cg-step" id="step-account">Creating account</li>' +
            '<li class="cg-step" id="step-request">Requesting game server</li>' +
            '<li class="cg-step" id="step-queue">Waiting in queue</li>' +
            '<li class="cg-step" id="step-start">Starting game</li>' +
          '</ol>' +
          '<div class="cg-step-error" id="cg-step-error"></div>' +
        '</div>' +
      '</div>' +
      '<iframe class="cg-launch-frame" id="cg-launch-frame" allowfullscreen allow="autoplay; fullscreen"></iframe>';
    document.body.appendChild(_overlay);

    _iframe   = document.getElementById('cg-launch-frame');
    _statusEl = document.getElementById('cg-launch-status');

    // ── floating control bar ──────────────────────────────────────────────
    _bar = document.createElement('div');
    _bar.id = 'cg-player-bar';
    _bar.className = 'cg-bar-hidden';
    _bar.innerHTML =
      '<button class="cg-player-btn" id="cg-player-close" title="Exit game" aria-label="Exit game">' +
        '<i class="fa-solid fa-arrow-left"></i>' +
      '</button>' +
      '<div class="cg-player-bar__sep"></div>' +
      '<span class="cg-player-bar__title" id="cg-player-title"></span>' +
      '<div class="cg-player-bar__sep"></div>' +
      '<button class="cg-player-btn" id="cg-player-fs" title="Fullscreen" aria-label="Fullscreen">' +
        '<i class="fa-solid fa-expand"></i>' +
      '</button>';
    document.body.appendChild(_bar);

    // ── ghost pill to peek the bar when hidden ────────────────────────────
    _ghost = document.createElement('div');
    _ghost.id = 'cg-player-ghost';
    document.body.appendChild(_ghost);

    // ── wire controls ─────────────────────────────────────────────────────
    document.getElementById('cg-player-close').addEventListener('click', _close);

    document.getElementById('cg-player-fs').addEventListener('click', function () {
      if (!document.fullscreenElement) {
        (_overlay.requestFullscreen || _overlay.webkitRequestFullscreen).call(_overlay);
      } else {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      }
    });

    document.addEventListener('fullscreenchange', _syncFsIcon);
    document.addEventListener('webkitfullscreenchange', _syncFsIcon);

    // show bar on any mouse movement over the overlay
    _overlay.addEventListener('mousemove', _peekBar);
    _overlay.addEventListener('mouseenter', _peekBar);

    // ghost pill hover shows bar
    _ghost.addEventListener('mouseenter', _peekBar);

    document.addEventListener('keydown', function (e) {
      if (!_overlay.classList.contains('open')) return;
      if (e.key === 'Escape') _close();
    });
  }

  function _syncFsIcon() {
    const btn = document.getElementById('cg-player-fs');
    if (!btn) return;
    const icon = btn.querySelector('i');
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      icon.className = 'fa-solid fa-compress';
      btn.title = 'Exit fullscreen';
    } else {
      icon.className = 'fa-solid fa-expand';
      btn.title = 'Fullscreen';
    }
  }

  function _peekBar() {
    _bar.classList.remove('cg-bar-hidden');
    _ghost.classList.remove('cg-ghost-visible');
    clearTimeout(_barTimer);
    _barTimer = setTimeout(function () {
      // only auto-hide when the stream is live (not during loading)
      if (_iframe.style.display !== 'none') {
        _bar.classList.add('cg-bar-hidden');
        _ghost.classList.add('cg-ghost-visible');
      }
    }, 3000);
  }

  function _showBar() {
    _bar.classList.remove('cg-bar-hidden');
    _ghost.classList.remove('cg-ghost-visible');
    clearTimeout(_barTimer);
  }

  function _hideBar() {
    _bar.classList.add('cg-bar-hidden');
    _ghost.classList.remove('cg-ghost-visible');
    clearTimeout(_barTimer);
  }

  function _close() {
    if (!_overlay) return;
    _overlay.classList.remove('open');
    _iframe.src = '';
    _hideBar();
    _ghost.classList.remove('cg-ghost-visible');
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    }
    if (_currentUuid) {
      navigator.sendBeacon(SERVER + '/cloud/v1/quitSession', JSON.stringify({ uuid: _currentUuid }));
      _currentUuid = null;
    }
    document.body.style.overflow = '';
  }

  const STEPS = ['step-account', 'step-request', 'step-queue', 'step-start'];

  function _setStep(id, label) {
    STEPS.forEach(function (sid) {
      const el = document.getElementById(sid);
      if (!el) return;
      const idx    = STEPS.indexOf(sid);
      const active = STEPS.indexOf(id);
      if (idx < active)        el.className = 'cg-step done';
      else if (idx === active) el.className = 'cg-step active';
      else                     el.className = 'cg-step';
      el.querySelector('.cg-step-suffix') && el.querySelector('.cg-step-suffix').remove();
    });
    if (label) {
      const el = document.getElementById(id);
      if (el) {
        const suffix = document.createElement('span');
        suffix.className = 'cg-step-suffix';
        suffix.textContent = label;
        el.appendChild(suffix);
      }
    }
    _statusEl.style.display = 'block';
    _iframe.style.display = 'none';
  }

  function _setError(msg) {
    STEPS.forEach(function (sid) {
      const el = document.getElementById(sid);
      if (el) el.className = 'cg-step';
    });
    const err = document.getElementById('cg-step-error');
    if (err) { err.textContent = msg; err.style.display = 'block'; }
    _statusEl.style.display = 'block';
    _iframe.style.display = 'none';
  }

  function _clearError() {
    const err = document.getElementById('cg-step-error');
    if (err) { err.textContent = ''; err.style.display = 'none'; }
  }

  function _showStream(uuid) {
    _currentUuid = uuid;
    _iframe.src = SERVER + '/cloud/v1/embed?id=' + encodeURIComponent(uuid);
    _statusEl.style.display = 'none';
    _iframe.style.display = 'block';
    // show the bar when streaming starts, then let it auto-hide
    _peekBar();
  }

  async function _launch(game) {
    _ensureOverlay();
    _currentGame = game;
    // set title in both the loading panel and the player bar
    const titleEl = document.getElementById('cg-launch-game-title');
    if (titleEl) titleEl.textContent = game.name;
    const barTitle = document.getElementById('cg-player-title');
    if (barTitle) barTitle.textContent = game.name;
    _overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    _showBar();
    _currentUuid = null;
    _iframe.src = '';
    _iframe.style.display = 'none';
    _clearError();
    _setStep('step-account');

    try {
      // ── 1. createSession (NDJSON stream) ──────────────────────────────────
      const res = await fetch(SERVER + '/cloud/v1/createSession', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': AUTH,
          'x-api-key':     API_KEY,
        },
        body: JSON.stringify({ game_key: game.game_key }),
      });

      if (!res.ok) {
        const err = await res.json().catch(function () { return {}; });
        _setError('Error: ' + (err.error || res.statusText));
        return;
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buf     = '';
      let   uuid    = null;
      let   queueUuid = null;

      while (true) {
        const chunk = await reader.read();
        if (chunk.value) buf += decoder.decode(chunk.value, { stream: !chunk.done });

        let nl;
        while ((nl = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let msg;
          try { msg = JSON.parse(line); } catch (_) { continue; }

          if (msg.status === 'error')            { _setError('Error: ' + msg.error); return; }
          if (msg.status === 'creating_account') { _setStep('step-account'); }
          if (msg.status === 'account_ready')    { _setStep('step-request'); }
          if (msg.status === 'requesting_game')  { _setStep('step-request'); }
          if (msg.status === 'queue')            { _setStep('step-queue', 'Position ' + msg.queue_pos); queueUuid = msg.uuid; }
          if (msg.status === 'finished_queue')   { uuid = msg.uuid; }
        }

        if (chunk.done) break;
      }

      // If we landed in a queue, poll getQueue until finished_queue
      if (!uuid && queueUuid) {
        while (true) {
          await new Promise(function (r) { setTimeout(r, 3500); });
          const qRes = await fetch(SERVER + '/cloud/v1/getQueue?uuid=' + encodeURIComponent(queueUuid), {
            headers: { 'Authorization': AUTH, 'x-api-key': API_KEY },
          });
          if (!qRes.ok) { _setError('Queue error: ' + qRes.statusText); return; }
          const q = await qRes.json();
          if (q.status === 'error')          { _setError('Error: ' + q.error); return; }
          if (q.status === 'queue')          { _setStep('step-queue', 'Position ' + q.queue_pos); }
          if (q.status === 'finished_queue') { uuid = q.uuid; break; }
        }
      }

      if (!uuid) { _setError('Session did not complete.'); return; }

      // ── 2. startGame ──────────────────────────────────────────────────────
      _setStep('step-start');
      const startRes = await fetch(SERVER + '/cloud/v1/startGame', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': AUTH,
          'x-api-key':     API_KEY,
        },
        body: JSON.stringify({ uuid }),
      });

      if (!startRes.ok) {
        const err = await startRes.json().catch(function () { return {}; });
        _setError('Error: ' + (err.error || startRes.statusText));
        return;
      }

      // ── 3. Open embed ─────────────────────────────────────────────────────
      _showStream(uuid);

    } catch (e) {
      _setError('Network error: ' + e.message);
    }
  }

})();
