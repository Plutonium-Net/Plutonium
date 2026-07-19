(() => {
  'use strict';

  /* ── Persistence keys ───────────────────────────────────────────────── */
  const WISP_KEY  = 'plu_wisp_server';
  const PROXY_KEY = 'plu_proxy_engine';
  const DEFAULT_WISP = 'wss://aluu.xyz/wisp/';

  /* ── Shared state ───────────────────────────────────────────────────── */
  let sjController  = null;
  let bareConn      = null;   // single BareMuxConnection, shared by UV + SJ
  let swReady       = false;

  /* ── DOM refs ───────────────────────────────────────────────────────── */
  const urlInput      = document.getElementById('web-url');
  const goBtn         = document.getElementById('web-go');
  const settingsToggle= document.getElementById('web-settings-toggle');
  const settingsPanel = document.getElementById('web-settings');
  const proxyBtns     = document.querySelectorAll('.web-settings__proxy-btn');
  const wispInput     = document.getElementById('web-wisp');
  const statusEl      = document.getElementById('web-status');
  const frameWrap     = document.getElementById('web-frame-wrap');
  const frame         = document.getElementById('web-frame');
  const frameUrlEl    = document.getElementById('web-frame-url');
  const backBtn       = document.getElementById('web-back');
  const fwdBtn        = document.getElementById('web-fwd');
  const reloadBtn     = document.getElementById('web-reload');
  const closeBtn      = document.getElementById('web-close');

  /* ── Restore persisted settings ─────────────────────────────────────── */
  let selectedProxy = localStorage.getItem(PROXY_KEY) || 'uv';
  wispInput.value   = localStorage.getItem(WISP_KEY)  || DEFAULT_WISP;

  proxyBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.proxy === selectedProxy);
  });

  /* ── UI events ──────────────────────────────────────────────────────── */
  settingsToggle.addEventListener('click', () => {
    settingsPanel.classList.toggle('open');
  });

  proxyBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      selectedProxy = btn.dataset.proxy;
      localStorage.setItem(PROXY_KEY, selectedProxy);
      proxyBtns.forEach(b => b.classList.toggle('active', b === btn));
    });
  });

  wispInput.addEventListener('change', () => {
    const val = wispInput.value.trim();
    if (val) localStorage.setItem(WISP_KEY, val);
    // Re-point the shared transport at the new WISP URL
    applyTransport();
  });

  /* ── Helpers ────────────────────────────────────────────────────────── */
  function wispUrl() {
    return (wispInput.value.trim() || DEFAULT_WISP).replace(/\/?$/, '/');
  }

  function setStatus(msg, error = false) {
    statusEl.textContent = msg;
    statusEl.classList.toggle('web-settings__note--error', error);
  }

  /* ── BareMux — one connection, one transport call ───────────────────── */
  async function applyTransport() {
    if (typeof BareMux === 'undefined') return;
    try {
      if (!bareConn) {
        bareConn = new BareMux.BareMuxConnection('/baremux/worker.js');
      }
      await bareConn.setTransport('/libcurl/index.mjs', [{ wisp: wispUrl() }]);
    } catch (e) {
      console.warn('[web] BareMux transport failed:', e);
    }
  }

  /* ── ScramJet initialisation ────────────────────────────────────────── */
  // Only delete the $scramjet IDB if stores are missing (stale schema).
  // Do NOT delete unconditionally — deleteDatabase blocks if the SW still
  // has the DB open, causing initScramjet() to hang and sjController to
  // stay null on every reload after the first.
  const SJ_DB      = '$scramjet';
  const SJ_STORES  = ['config','cookies','redirectTrackers','referrerPolicies','publicSuffixList'];

  function maybeRepairSjDb() {
    return new Promise(resolve => {
      // Open without a version so we never trigger onupgradeneeded ourselves
      const req = indexedDB.open(SJ_DB);
      req.onupgradeneeded = () => {
        // DB didn't exist at all — abort, let ScramJet's own init() create it
        req.transaction.abort();
      };
      req.onsuccess = () => {
        const db = req.result;
        const missing = SJ_STORES.filter(s => !db.objectStoreNames.contains(s));
        db.close();
        if (!missing.length) { resolve(); return; }
        // Stale schema — delete and let init() rebuild
        const del = indexedDB.deleteDatabase(SJ_DB);
        del.onsuccess = del.onerror = del.onblocked = () => resolve();
      };
      req.onerror = () => resolve();
    });
  }

  async function initScramjet() {
    // $scramjetLoadController is set as a global by sj/scramjet.bundle.js
    if (typeof $scramjetLoadController === 'undefined') return;
    try {
      await maybeRepairSjDb();
      const { ScramjetController } = $scramjetLoadController();
      sjController = new ScramjetController({
        prefix: '/sj/service/',
        files: {
          wasm: '/sj/scramjet.wasm.wasm',
          all:  '/sj/scramjet.all.js',
          sync: '/sj/scramjet.sync.js',
        },
      });
      await sjController.init();
    } catch (e) {
      console.warn('[web] ScramJet init failed:', e);
    }
  }

  /* ── Service Worker registration ────────────────────────────────────── */
  async function registerSW() {
    if (!('serviceWorker' in navigator)) {
      setStatus('Service workers not supported in this browser.', true);
      return;
    }
    try {
      await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      swReady = true;
      setStatus('Ready');
      // Transport first, then SJ (SJ controller.init() posts to the SW which
      // needs BareMux already pointing at a transport)
      await applyTransport();
      await initScramjet();
    } catch (err) {
      setStatus('SW registration failed: ' + err.message, true);
      console.error('[web] SW error:', err);
    }
  }

  registerSW();

  /* ── URL normalisation ──────────────────────────────────────────────── */
  function normaliseUrl(raw) {
    raw = raw.trim();
    if (!raw) return null;
    if (!raw.includes('.') || raw.includes(' ')) {
      return 'https://search.brave.com/search?q=' + encodeURIComponent(raw);
    }
    if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
    try {
      return new URL(raw).href;
    } catch {
      return 'https://search.brave.com/search?q=' + encodeURIComponent(raw);
    }
  }

  /* ── Navigate ───────────────────────────────────────────────────────── */
  function navigate() {
    if (!swReady) { setStatus('Service worker not ready yet, please wait…', true); return; }

    const target = normaliseUrl(urlInput.value);
    if (!target) return;

    let proxied;
    if (selectedProxy === 'uv') {
      if (typeof __uv$config === 'undefined') {
        setStatus('Ultraviolet not loaded.', true); return;
      }
      proxied = __uv$config.prefix + __uv$config.encodeUrl(target);
    } else {
      if (!sjController) {
        setStatus('ScramJet not ready yet.', true); return;
      }
      proxied = sjController.encodeUrl(target);
    }

    frameUrlEl.textContent = target;
    frameWrap.style.display = 'flex';
    document.getElementById('web-page').classList.add('has-frame');
    frame.src = proxied;
    settingsPanel.classList.remove('open');
  }

  goBtn.addEventListener('click', navigate);
  urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') navigate(); });

  /* ── Frame controls ─────────────────────────────────────────────────── */
  backBtn.addEventListener('click',   () => frame.contentWindow?.history.back());
  fwdBtn.addEventListener('click',    () => frame.contentWindow?.history.forward());
  reloadBtn.addEventListener('click', () => { try { frame.contentWindow.location.reload(); } catch { frame.src = frame.src; } });

  closeBtn.addEventListener('click', () => {
    frame.src = 'about:blank';
    frameWrap.style.display = 'none';
    document.getElementById('web-page').classList.remove('has-frame');
    frameUrlEl.textContent = '';
  });
})();
