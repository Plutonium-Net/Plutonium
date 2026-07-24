(function () {
  'use strict';

  // ── Config ────────────────────────────────────────────────────────────────
  const SERVER  = 'https://cgapi.cdn.plutoniumnet.work';
  const API_KEY = 'b9c3d2c6509c74c0db54d77d9fbd31e26e9b85a86d3dfc0b6a1c5d91c8a7f4e37f2d1e6845bc9a1f0e8d4f63b72ac59f4c1de0a97b5f3d86e2c9a4f7813db6a';
  const AUTH    = 'Bearer ' + API_KEY;

  // ── Build cards from JSON ─────────────────────────────────────────────────
  const grid = document.getElementById('cg-grid');

  function buildCards(games) {
    grid.innerHTML = '';
    games.forEach(function (game) {
      const card = document.createElement('div');
      card.className = 'cg-card';
      card.innerHTML =
        '<img class="cg-card__img" src="' + game.image + '" alt="' + game.name + '" loading="lazy" />' +
        '<div class="cg-card__body">' +
          '<div class="cg-card__title">' + game.name + '</div>' +
          '<div class="cg-card__desc">' + game.description + '</div>' +
        '</div>';
      card.addEventListener('click', function () { _launch(game); });
      grid.appendChild(card);
    });
  }

  // Load game list from examples/cloud.json
  fetch('examples/cloud.json')
    .then(function (r) { return r.json(); })
    .then(buildCards)
    .catch(function () {
      grid.innerHTML = '<p style="color:var(--muted);padding:40px">Failed to load games.</p>';
    });

  // ── Launch overlay ────────────────────────────────────────────────────────
  let _overlay     = null;
  let _iframe      = null;
  let _statusEl    = null;
  let _currentUuid = null;

  function _ensureOverlay() {
    if (_overlay) return;

    _overlay = document.createElement('div');
    _overlay.id = 'cg-launch-overlay';
    _overlay.innerHTML =
      '<div class="cg-launch-box">' +
        '<button class="cg-launch-close" id="cg-launch-close" aria-label="Close">✕</button>' +
        '<div class="cg-launch-status" id="cg-launch-status">' +
          '<ol class="cg-steps" id="cg-steps">' +
            '<li class="cg-step" id="step-account">Creating account</li>' +
            '<li class="cg-step" id="step-request">Requesting game server</li>' +
            '<li class="cg-step" id="step-queue">Waiting in queue</li>' +
            '<li class="cg-step" id="step-start">Starting game</li>' +
          '</ol>' +
          '<div class="cg-step-error" id="cg-step-error"></div>' +
        '</div>' +
        '<iframe class="cg-launch-frame" id="cg-launch-frame" allowfullscreen></iframe>' +
      '</div>';
    document.body.appendChild(_overlay);

    _iframe   = document.getElementById('cg-launch-frame');
    _statusEl = document.getElementById('cg-launch-status');

    document.getElementById('cg-launch-close').addEventListener('click', _close);
    _overlay.addEventListener('click', function (e) { if (e.target === _overlay) _close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') _close(); });
  }

  function _close() {
    if (!_overlay) return;
    _overlay.classList.remove('open');
    _iframe.src = '';
    if (_currentUuid) {
      navigator.sendBeacon(SERVER + '/cloud/v1/quitSession', JSON.stringify({ uuid: _currentUuid }));
      _currentUuid = null;
    }
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
      // clear any old suffix
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
  }

  async function _launch(game) {
    _ensureOverlay();
    _overlay.classList.add('open');
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

      // Read the createSession NDJSON stream
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
