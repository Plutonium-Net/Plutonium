(() => {
  'use strict';

  /* ── Persistence ────────────────────────────────────────────────────── */
  const WISP_KEY     = 'plu_wisp_server';
  const PROXY_KEY    = 'plu_proxy_engine';
  const DEFAULT_WISP = 'wss://wisp-us-east-1.cgamz.online/';
  const CLOUD_DOC_SETTINGS = 'web/settings';
  const CLOUD_DOC_PINS     = 'web/pins';
  const CLOUD_DOC_TABS     = 'web/tabs';

  /* ── State ──────────────────────────────────────────────────────────── */
  let sjController = null;
  let bareConn     = null;
  let swReady      = false;
  let tabs         = [];  // [{ id, title, url, iframe }]
  let activeId     = null;
  let nextId       = 0;

  /* ── DOM ────────────────────────────────────────────────────────────── */
  const tabList    = document.getElementById('tab-list');
  const frameStack = document.getElementById('frame-stack');
  const newtabPage = document.getElementById('newtab-page');
  const omniInput  = document.getElementById('omnibar-input');
  const btnGo      = document.getElementById('btn-go');
  const btnBack    = document.getElementById('btn-back');
  const btnFwd     = document.getElementById('btn-fwd');
  const btnReload  = document.getElementById('btn-reload');
  const btnNewTab  = document.getElementById('btn-new-tab');
  const statusEl      = document.getElementById('web-status');
  // New-tab page
  const ntClockTime   = document.getElementById('nt-clock-time');
  const ntClockDate   = document.getElementById('nt-clock-date');
  const ntSearchInput = document.getElementById('nt-search-input');
  const ntSearchBtn   = document.getElementById('nt-search-btn');
  const ntPinsEl      = document.getElementById('nt-pins');
  const ntAddPin      = document.getElementById('nt-add-pin');
  const ntProxyBtns     = document.querySelectorAll('.nt-toggle-btn');
  const ntDropdown      = document.getElementById('nt-wisp-dropdown');
  const ntDropdownTrigger = document.getElementById('nt-dropdown-trigger');
  const ntDropdownLabel = document.getElementById('nt-dropdown-label');
  const ntDropdownMenu  = document.getElementById('nt-dropdown-menu');
  const ntDropdownItems = document.querySelectorAll('.nt-dropdown__item');
  const ntWispCustom    = document.getElementById('nt-wisp-custom');
  const ntStatusEl      = document.getElementById('nt-status');

  /* ── Restore settings ───────────────────────────────────────────────── */
  const PINS_KEY = 'plu_pins';
  let selectedProxy = localStorage.getItem(PROXY_KEY) || 'uv';

  const WISP_PRESETS = [
    'wss://wisp-us-east-1.cgamz.online/',
    'wss://wisp-us-east-2.cgamz.online/',
    'wss://wisp-us-west.cgamz.online/',
    'wss://wisp-europe.cgamz.online/',
    'wss://wisp-asia.cgamz.online/',
  ];

  /* ── Cloud sync helpers ─────────────────────────────────────────────── */
  const store = () => (typeof PlutoniumStore !== 'undefined' ? PlutoniumStore : null);

  // Debounce timer for settings (proxy + wisp) — avoids rapid writes on dropdown navigate
  let _settingsTimer = null;
  function cloudSaveSettings() {
    const s = store();
    if (!s || !s.currentUser) return;
    clearTimeout(_settingsTimer);
    _settingsTimer = setTimeout(() => {
      s.setDoc(CLOUD_DOC_SETTINGS, {
        proxy: selectedProxy,
        wisp:  localStorage.getItem(WISP_KEY) || DEFAULT_WISP,
      }).catch(console.warn);
    }, 800);
  }

  function cloudSavePins() {
    const s = store();
    if (!s || !s.currentUser) return;
    s.setDoc(CLOUD_DOC_PINS, { pins: loadPins() }).catch(console.warn);
  }

  function cloudSaveTabs() {
    const s = store();
    if (!s || !s.currentUser) return;
    const snapshot = tabs
      .filter(t => t.url)
      .map(t => ({ title: t.title, url: t.url }));
    s.setDoc(CLOUD_DOC_TABS, { tabs: snapshot }).catch(console.warn);
  }

  function syncProxyButtons() {
    ntProxyBtns.forEach(b => b.classList.toggle('active', b.dataset.proxy === selectedProxy));
  }

  function setDropdownLabel(item) {
    ntDropdownLabel.innerHTML = item.innerHTML;
  }

  function syncWispDropdown() {
    const saved = localStorage.getItem(WISP_KEY) || DEFAULT_WISP;
    const match = [...ntDropdownItems].find(i => i.dataset.value === saved);
    if (match) {
      setDropdownLabel(match);
      ntDropdownItems.forEach(i => i.classList.toggle('active', i === match));
      ntWispCustom.style.display = 'none';
    } else {
      ntDropdownLabel.innerHTML = '<i class="fa-solid fa-pen nt-dropdown__pen"></i> Custom…';
      ntDropdownItems.forEach(i => i.classList.toggle('active', i.dataset.value === 'custom'));
      ntWispCustom.style.display = '';
      ntWispCustom.value = saved;
    }
  }

  syncProxyButtons();
  syncWispDropdown();

  /* ── Proxy toggle ───────────────────────────────────────────────────── */
  ntProxyBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      selectedProxy = btn.dataset.proxy;
      localStorage.setItem(PROXY_KEY, selectedProxy);
      syncProxyButtons();
      cloudSaveSettings();
    });
  });

  /* ── Custom WISP dropdown ───────────────────────────────────────────── */
  ntDropdownTrigger.addEventListener('click', e => {
    e.stopPropagation();
    ntDropdown.classList.toggle('open');
  });

  document.addEventListener('click', () => ntDropdown.classList.remove('open'));

  ntDropdownItems.forEach(item => {
    item.addEventListener('click', () => {
      ntDropdown.classList.remove('open');
      if (item.dataset.value === 'custom') {
        ntDropdownLabel.innerHTML = '<i class="fa-solid fa-pen nt-dropdown__pen"></i> Custom…';
        ntDropdownItems.forEach(i => i.classList.toggle('active', i === item));
        ntWispCustom.style.display = '';
        ntWispCustom.focus();
      } else {
        setDropdownLabel(item);
        ntDropdownItems.forEach(i => i.classList.toggle('active', i === item));
        ntWispCustom.style.display = 'none';
        localStorage.setItem(WISP_KEY, item.dataset.value);
        applyTransport();
        cloudSaveSettings();
      }
    });
  });

  ntWispCustom.addEventListener('change', () => {
    const v = ntWispCustom.value.trim();
    if (v) { localStorage.setItem(WISP_KEY, v); applyTransport(); cloudSaveSettings(); }
  });

  /* ── Clock ──────────────────────────────────────────────────────────── */
  function tickClock() {
    const now  = new Date();
    const raw  = now.getHours();
    const h    = String(raw % 12 || 12);
    const m    = String(now.getMinutes()).padStart(2, '0');
    const ampm = raw < 12 ? 'AM' : 'PM';
    ntClockTime.textContent = `${h}:${m} ${ampm}`;
    ntClockDate.textContent = now.toLocaleDateString(undefined, {
      weekday: 'long', month: 'long', day: 'numeric'
    });
  }
  tickClock();
  setInterval(tickClock, 5000);

  /* ── DDG search ─────────────────────────────────────────────────────── */
  function doNtSearch() {
    const q = ntSearchInput.value.trim();
    if (!q) return;
    // navigate active tab through proxy
    navigateTab(activeId ?? createTab(), 'https://duckduckgo.com/?q=' + encodeURIComponent(q));
    ntSearchInput.value = '';
  }
  ntSearchBtn.addEventListener('click', doNtSearch);
  ntSearchInput.addEventListener('keydown', e => { if (e.key === 'Enter') doNtSearch(); });

  /* ── Pins ───────────────────────────────────────────────────────────── */
  function loadPins() {
    try { return JSON.parse(localStorage.getItem(PINS_KEY)) || []; }
    catch { return []; }
  }
  function savePins(pins) {
    localStorage.setItem(PINS_KEY, JSON.stringify(pins));
  }
  function renderPins() {
    ntPinsEl.innerHTML = '';
    const pins = loadPins();
    pins.forEach((pin, idx) => {
      const div = document.createElement('div');
      div.className = 'nt-pin';

      const icon = document.createElement('div');
      icon.className = 'nt-pin__icon';
      const img = document.createElement('img');
      try {
        img.src = `https://www.google.com/s2/favicons?domain=${new URL(pin.url).hostname}&sz=32`;
      } catch { img.src = ''; }
      img.onerror = () => { icon.innerHTML = '<i class="fa-solid fa-globe"></i>'; };
      icon.appendChild(img);

      const label = document.createElement('span');
      label.className = 'nt-pin__label';
      label.textContent = pin.title;

      const rm = document.createElement('button');
      rm.className = 'nt-pin__remove';
      rm.innerHTML = '<i class="fa-solid fa-xmark"></i>';
      rm.title = 'Remove pin';
      rm.addEventListener('click', e => {
        e.stopPropagation();
        const p = loadPins();
        p.splice(idx, 1);
        savePins(p);
        renderPins();
        cloudSavePins();
      });

      div.appendChild(icon);
      div.appendChild(label);
      div.appendChild(rm);
      div.addEventListener('click', () => {
        if (activeId === null) createTab(pin.url);
        else navigateTab(activeId, pin.url);
      });
      ntPinsEl.appendChild(div);
    });
  }
  renderPins();

  ntAddPin.addEventListener('click', () => {
    const url = prompt('Pin URL:');
    if (!url) return;
    let title = '';
    try { title = new URL(url.startsWith('http') ? url : 'https://' + url).hostname; }
    catch { title = url; }
    const pins = loadPins();
    pins.push({ url: url.startsWith('http') ? url : 'https://' + url, title });
    savePins(pins);
    renderPins();
    cloudSavePins();
  });

  /* ── Helpers ────────────────────────────────────────────────────────── */
  function wispUrl() {
    const saved = localStorage.getItem(WISP_KEY) || DEFAULT_WISP;
    return saved.replace(/\/?$/, '/');
  }

  function setStatus(msg, error = false) {
    statusEl.textContent = msg;
    statusEl.classList.toggle('browser__status--error', error);
  }

  function setNtStatus(msg, state = '') {
    ntStatusEl.textContent = msg;
    ntStatusEl.className = 'nt-status' + (state ? ` nt-status--${state}` : '');
  }

  function normaliseUrl(raw) {
    raw = raw.trim();
    if (!raw) return null;
    if (!raw.includes('.') || raw.includes(' '))
      return 'https://search.brave.com/search?q=' + encodeURIComponent(raw);
    if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
    try { return new URL(raw).href; }
    catch { return 'https://search.brave.com/search?q=' + encodeURIComponent(raw); }
  }

  function encodeProxy(url) {
    if (selectedProxy === 'uv') {
      if (typeof __uv$config === 'undefined') throw new Error('UV not loaded');
      return __uv$config.prefix + __uv$config.encodeUrl(url);
    }
    if (!sjController) throw new Error('ScramJet not ready');
    return sjController.encodeUrl(url);
  }

  /* ── Tab management ─────────────────────────────────────────────────── */
  function getTab(id) { return tabs.find(t => t.id === id); }

  function createTab(url = null) {
    const id  = nextId++;
    // iframe is created lazily on first navigation — blank tabs show newtab-page
    const tab = { id, title: 'New Tab', url: null, iframe: null };
    tabs.push(tab);
    activateTab(id);
    if (url) navigateTab(id, url);
    return id;
  }

  function closeTab(id) {
    const idx = tabs.findIndex(t => t.id === id);
    if (idx === -1) return;
    if (tabs[idx].iframe) tabs[idx].iframe.remove();
    tabs.splice(idx, 1);
    if (!tabs.length) { createTab(); return; }
    activateTab(tabs[Math.min(idx, tabs.length - 1)].id);
    renderTabList();
    cloudSaveTabs();
  }

  function activateTab(id) {
    activeId = id;
    // show/hide iframes — only tabs that have an iframe
    tabs.forEach(t => { if (t.iframe) t.iframe.classList.toggle('active', t.id === id); });
    // show/hide new-tab page
    const tab = getTab(id);
    if (tab) {
      const isBlank = tab.url === null;
      newtabPage.classList.toggle('active', isBlank);
      omniInput.value = tab.url || '';
      if (isBlank) setNtStatus(swReady ? 'Ready' : '…', swReady ? 'ok' : '');
    }
    renderTabList();
  }

  function navigateTab(id, rawUrl) {
    if (!swReady) { setNtStatus('SW not ready…', 'error'); setStatus('SW not ready…', true); return; }
    const target = normaliseUrl(rawUrl);
    if (!target) return;
    let proxied;
    try { proxied = encodeProxy(target); }
    catch (e) { setStatus(e.message, true); setNtStatus(e.message, 'error'); return; }
    const tab = getTab(id);
    if (!tab) return;
    // create iframe lazily on first navigation
    if (!tab.iframe) {
      tab.iframe = document.createElement('iframe');
      tab.iframe.allow = 'fullscreen';
      frameStack.appendChild(tab.iframe);
    }
    tab.url   = target;
    tab.title = new URL(target).hostname;
    tab.iframe.src = proxied;
    // make this iframe active, hide others
    tabs.forEach(t => { if (t.iframe) t.iframe.classList.toggle('active', t.id === id); });
    omniInput.value = target;
    newtabPage.classList.remove('active');
    cloudSaveTabs();
    // try updating title on load
    tab.iframe.addEventListener('load', () => {
      try {
        const u = new URL(tab.iframe.contentWindow.location.href);
        tab.title = u.hostname;
        updateTabEl(id);
        cloudSaveTabs();
      } catch { /* cross-origin */ }
    });
    updateTabEl(id);
  }

  /* ── Tab list rendering ─────────────────────────────────────────────── */
  function renderTabList() {
    tabList.innerHTML = '';
    tabs.forEach(tab => {
      const li = buildTabEl(tab);
      tabList.appendChild(li);
    });
  }

  function buildTabEl(tab) {
    const li = document.createElement('li');
    li.className = 'browser__tab' + (tab.id === activeId ? ' active' : '');
    li.dataset.id = tab.id;
    li.draggable = true;

    // Grip
    const grip = document.createElement('span');
    grip.className = 'browser__tab__grip';
    grip.innerHTML = '<span></span><span></span><span></span><span></span>';
    grip.title = 'Drag to reorder';

    // Favicon
    const favicon = document.createElement('span');
    favicon.className = 'browser__tab__favicon';
    favicon.innerHTML = '<i class="fa-solid fa-globe"></i>';
    if (tab.url) {
      try {
        const img = document.createElement('img');
        img.src = `https://www.google.com/s2/favicons?domain=${new URL(tab.url).hostname}&sz=16`;
        img.onerror = () => { favicon.innerHTML = '<i class="fa-solid fa-globe"></i>'; };
        favicon.innerHTML = '';
        favicon.appendChild(img);
      } catch { /* globe */ }
    }

    // Title
    const title = document.createElement('span');
    title.className = 'browser__tab__title';
    title.textContent = tab.title;

    // Close
    const close = document.createElement('button');
    close.className = 'browser__tab__close';
    close.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    close.title = 'Close tab';
    close.addEventListener('click', e => { e.stopPropagation(); closeTab(tab.id); });

    li.appendChild(grip);
    li.appendChild(favicon);
    li.appendChild(title);
    li.appendChild(close);

    li.addEventListener('click', () => activateTab(tab.id));

    // ── Drag-to-reorder ──────────────────────────────────────────────
    li.addEventListener('dragstart', e => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(tab.id));
      li.classList.add('dragging');
    });
    li.addEventListener('dragend', () => {
      li.classList.remove('dragging');
      tabList.querySelectorAll('.browser__tab').forEach(el => el.classList.remove('drag-over'));
    });
    li.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      tabList.querySelectorAll('.browser__tab').forEach(el => el.classList.remove('drag-over'));
      li.classList.add('drag-over');
    });
    li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
    li.addEventListener('drop', e => {
      e.preventDefault();
      li.classList.remove('drag-over');
      const fromId = parseInt(e.dataTransfer.getData('text/plain'), 10);
      const toId   = tab.id;
      if (fromId === toId) return;
      const fromIdx = tabs.findIndex(t => t.id === fromId);
      const toIdx   = tabs.findIndex(t => t.id === toId);
      if (fromIdx === -1 || toIdx === -1) return;
      const [moved] = tabs.splice(fromIdx, 1);
      tabs.splice(toIdx, 0, moved);
      renderTabList();
      cloudSaveTabs();
    });

    return li;
  }

  function updateTabEl(id) {
    const li = tabList.querySelector(`[data-id="${id}"]`);
    const tab = getTab(id);
    if (!li || !tab) return;
    const t = li.querySelector('.browser__tab__title');
    if (t) t.textContent = tab.title;
    const f = li.querySelector('.browser__tab__favicon');
    if (f && tab.url) {
      try {
        const img = document.createElement('img');
        img.src = `https://www.google.com/s2/favicons?domain=${new URL(tab.url).hostname}&sz=16`;
        img.onerror = () => { f.innerHTML = '<i class="fa-solid fa-globe"></i>'; };
        f.innerHTML = '';
        f.appendChild(img);
      } catch { /* keep */ }
    }
  }

  /* ── Omnibar ────────────────────────────────────────────────────────── */
  function goFromOmnibar() {
    const url = omniInput.value.trim();
    if (!url) return;
    if (activeId === null) createTab(url);
    else navigateTab(activeId, url);
  }

  btnGo.addEventListener('click', goFromOmnibar);
  omniInput.addEventListener('keydown', e => { if (e.key === 'Enter') goFromOmnibar(); });
  omniInput.addEventListener('focus', () => omniInput.select());

  /* ── Nav buttons ────────────────────────────────────────────────────── */
  btnBack.addEventListener('click', () => {
    const t = getTab(activeId);
    if (t) try { t.iframe.contentWindow.history.back(); } catch { /* x-origin */ }
  });
  btnFwd.addEventListener('click', () => {
    const t = getTab(activeId);
    if (t) try { t.iframe.contentWindow.history.forward(); } catch { /* x-origin */ }
  });
  btnReload.addEventListener('click', () => {
    const t = getTab(activeId);
    if (!t) return;
    try { t.iframe.contentWindow.location.reload(); } catch { t.iframe.src = t.iframe.src; }
  });
  btnNewTab.addEventListener('click', () => createTab());

  /* ── BareMux ────────────────────────────────────────────────────────── */
  async function applyTransport() {
    if (typeof BareMux === 'undefined') return;
    try {
      if (!bareConn) bareConn = new BareMux.BareMuxConnection('/baremux/worker.js');
      await bareConn.setTransport('/libcurl/index.mjs', [{ wisp: wispUrl() }]);
    } catch (e) { console.warn('[web] BareMux failed:', e); }
  }

  /* ── ScramJet IDB repair ────────────────────────────────────────────── */
  const SJ_DB     = '$scramjet';
  const SJ_STORES = ['config','cookies','redirectTrackers','referrerPolicies','publicSuffixList'];

  function maybeRepairSjDb() {
    return new Promise(resolve => {
      const req = indexedDB.open(SJ_DB);
      req.onupgradeneeded = () => { req.transaction.abort(); };
      req.onsuccess = () => {
        const db = req.result;
        const missing = SJ_STORES.filter(s => !db.objectStoreNames.contains(s));
        db.close();
        if (!missing.length) { resolve(); return; }
        const del = indexedDB.deleteDatabase(SJ_DB);
        del.onsuccess = del.onerror = del.onblocked = () => resolve();
      };
      req.onerror = () => resolve();
    });
  }

  async function initScramjet() {
    if (typeof $scramjetLoadController === 'undefined') return;
    try {
      await maybeRepairSjDb();
      const { ScramjetController } = $scramjetLoadController();
      sjController = new ScramjetController({
        prefix: '/sj/service/',
        files: { wasm: '/sj/scramjet.wasm.wasm', all: '/sj/scramjet.all.js', sync: '/sj/scramjet.sync.js' },
      });
      await sjController.init();
    } catch (e) { console.warn('[web] ScramJet init failed:', e); }
  }

  /* ── Service Worker ─────────────────────────────────────────────────── */
  async function registerSW() {
    if (!('serviceWorker' in navigator)) {
      setStatus('No SW support', true);
      setNtStatus('No SW support', 'error');
      return;
    }
    try {
      await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      swReady = true;
      setStatus('Ready');
      setNtStatus('Ready', 'ok');
      await applyTransport();
      await initScramjet();
    } catch (e) {
      setStatus('SW failed', true);
      setNtStatus('SW registration failed', 'error');
      console.error('[web] SW error:', e);
    }
  }

  /* ── Cloud sync — load on sign-in ──────────────────────────────────── */
  if (typeof PlutoniumStore !== 'undefined') {
    PlutoniumStore.onAuthChange(async (user) => {
      if (!user) return; // signed out — keep current localStorage values

      // Load settings (proxy + wisp)
      try {
        const settings = await PlutoniumStore.getDoc(CLOUD_DOC_SETTINGS);
        if (settings) {
          if (settings.proxy) {
            selectedProxy = settings.proxy;
            localStorage.setItem(PROXY_KEY, selectedProxy);
            syncProxyButtons();
          }
          if (settings.wisp) {
            localStorage.setItem(WISP_KEY, settings.wisp);
            syncWispDropdown();
            applyTransport();
          }
        }
      } catch { /* not critical */ }

      // Load pins
      try {
        const doc = await PlutoniumStore.getDoc(CLOUD_DOC_PINS);
        if (doc && Array.isArray(doc.pins)) {
          savePins(doc.pins);
          renderPins();
        }
      } catch { /* not critical */ }

      // Restore tabs — open any saved tabs that aren't already open
      try {
        const doc = await PlutoniumStore.getDoc(CLOUD_DOC_TABS);
        if (doc && Array.isArray(doc.tabs) && doc.tabs.length) {
          // Only restore if user currently has a single blank tab (fresh load)
          const onlyBlank = tabs.length === 1 && tabs[0].url === null;
          if (onlyBlank) {
            // Close the blank placeholder before restoring
            const blankId = tabs[0].id;
            doc.tabs.forEach(t => { if (t.url) createTab(t.url); });
            closeTab(blankId);
          }
        }
      } catch { /* not critical */ }
    });
  }

  /* ── Boot ───────────────────────────────────────────────────────────── */
  registerSW();
  createTab();
})();
