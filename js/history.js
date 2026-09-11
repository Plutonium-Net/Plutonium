(function () {
  'use strict';

  const STORAGE_KEY = 'plu_history';
  const DELETED_KEY = 'plu_history_deleted';
  const DOC_NAME    = 'history';
  const MAX_ENTRIES = 600;
  const PUSH_MS     = 8000;
  const HOUR_MS     = 3600000;
  const REPEAT_MS   = 60000;
  const TOMBSTONE_TTL_MS = 30 * 24 * HOUR_MS;

  const TYPE_META = {
    search: { label: 'Search',          icon: 'fa-magnifying-glass' },
    web:    { label: 'Web',             icon: 'fa-globe' },
    game:   { label: 'Game',            icon: 'fa-gamepad' },
    cloud:  { label: 'Cloud game',      icon: 'fa-cloud' },
    media:  { label: 'Media',           icon: 'fa-clapperboard' },
    ai:     { label: 'AI chat',         icon: 'fa-robot' },
    vm:     { label: 'Virtual machine', icon: 'fa-display' },
  };

  const FILTERS = [
    { key: 'all',    label: 'All' },
    { key: 'search', label: 'Searches' },
    { key: 'web',    label: 'Web' },
    { key: 'game',   label: 'Games' },
    { key: 'cloud',  label: 'Cloud' },
    { key: 'media',  label: 'Media' },
    { key: 'ai',     label: 'AI' },
    { key: 'vm',     label: 'VMs' },
  ];

  const ENGINE_LABELS = {
    core:    'UV',
    runtime: 'SJ',
    remote:  'Hyperbeam',
  };

  let entries       = loadEntries();
  let deleted       = loadDeleted();
  let activeFilter  = 'all';
  let searchQuery   = '';
  let pushTimer     = null;
  let periodicTimer = null;
  let lastPushHash  = '';
  let clearArmed    = false;
  let clearTimer    = null;
  let bound         = false;

  function loadEntries() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed.map(function (e) {
        return {
          id:     String(e && e.id || ''),
          type:   String(e && e.type || ''),
          title:  String(e && e.title || ''),
          sub:    e && e.sub ? String(e.sub) : '',
          href:   e && e.href ? String(e.href) : '',
          engine: e && e.engine ? String(e.engine) : '',
          ts:     Number(e && e.ts) || 0,
        };
      }).filter(function (e) {
        return e.type && e.title && e.ts;
      }).sort(function (a, b) {
        return b.ts - a.ts;
      });
    } catch (_) {
      return [];
    }
  }

  function saveEntries() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); } catch (_) {}
  }

  /* Tombstones record "this id was deleted at ts" so a cloud pull can't
     resurrect an entry the user removed here (or on another device). */
  function loadDeleted() {
    try {
      const raw = localStorage.getItem(DELETED_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      const cutoff = Date.now() - TOMBSTONE_TTL_MS;
      const out = {};
      Object.keys(parsed).forEach(function (id) {
        const ts = Number(parsed[id]) || 0;
        if (id && ts >= cutoff) out[id] = ts;
      });
      return out;
    } catch (_) {
      return {};
    }
  }

  function saveDeleted() {
    try { localStorage.setItem(DELETED_KEY, JSON.stringify(deleted)); } catch (_) {}
  }

  function mergeDeleted(a, b) {
    const out = {};
    [a, b].forEach(function (src) {
      if (!src || typeof src !== 'object') return;
      Object.keys(src).forEach(function (id) {
        const ts = Number(src[id]) || 0;
        if (!id || !ts) return;
        if (!out[id] || ts > out[id]) out[id] = ts;
      });
    });
    const cutoff = Date.now() - TOMBSTONE_TTL_MS;
    Object.keys(out).forEach(function (id) {
      if (out[id] < cutoff) delete out[id];
    });
    return out;
  }

  function isDeleted(entry) {
    const key = String((entry && entry.id) || '');
    const ts = key ? deleted[key] : 0;
    return !!ts && ts >= (Number(entry && entry.ts) || 0);
  }

  function makeId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function record(entry) {
    if (!entry || !entry.type || !entry.title) return null;
    const type = TYPE_META[entry.type] ? entry.type : 'web';
    const href = entry.href ? String(entry.href) : '';
    const head = entries[0];

    if (head && head.type === type && head.title === entry.title && head.href === href && Date.now() - head.ts < REPEAT_MS) {
      head.ts = Date.now();
      saveEntries();
      schedulePush();
      if (isOpen()) render();
      return head;
    }

    const item = {
      id:     makeId(),
      type:   type,
      title:  String(entry.title).slice(0, 300),
      sub:    entry.sub ? String(entry.sub).slice(0, 200) : '',
      href:   href,
      engine: entry.engine && ENGINE_LABELS[entry.engine] ? String(entry.engine) : '',
      ts:     Date.now(),
    };

    entries.unshift(item);
    if (entries.length > MAX_ENTRIES) entries = entries.slice(0, MAX_ENTRIES);
    saveEntries();
    schedulePush();
    if (isOpen()) render();
    return item;
  }

  function getEntries() { return entries.slice(); }

  function removeEntry(id) {
    const key = String(id || '');
    if (!key) return false;
    if (!entries.some(function (e) { return e.id === key; })) return false;
    deleted[key] = Date.now();
    entries = entries.filter(function (e) { return e.id !== key; });
    saveEntries();
    saveDeleted();
    if (isOpen()) render();
    push();
    return true;
  }

  function clearAll() {
    if (!entries.length) return false;
    const ts = Date.now();
    entries.forEach(function (e) { if (e.id) deleted[e.id] = ts; });
    entries = [];
    saveEntries();
    saveDeleted();
    if (isOpen()) render();
    push();
    return true;
  }

  function mergeEntries(list) {
    const byId = new Map();
    entries.concat(list).forEach(function (e) {
      if (isDeleted(e)) return;
      const key = String(e.id || e.ts);
      const existing = byId.get(key);
      if (!existing || (Number(e.ts) || 0) > (Number(existing.ts) || 0)) byId.set(key, e);
    });
    return Array.from(byId.values()).sort(function (a, b) {
      return (Number(b.ts) || 0) - (Number(a.ts) || 0);
    }).slice(0, MAX_ENTRIES);
  }

  function fingerprint(list) {
    return list.length + ':' + (list[0] ? list[0].id + ':' + list[0].ts : '');
  }

  function stateHash() {
    return fingerprint(entries) + '|' + Object.keys(deleted).sort().join(',');
  }

  function refreshFromStorage() {
    const stored        = loadEntries();
    const storedDeleted = loadDeleted();
    const incoming      = fingerprint(stored) + '|' + Object.keys(storedDeleted).sort().join(',');
    if (incoming === stateHash()) return false;
    deleted = mergeDeleted(deleted, storedDeleted);
    entries = mergeEntries(stored);
    saveEntries();
    saveDeleted();
    return true;
  }

  window.addEventListener('storage', function (e) {
    if (e.key !== STORAGE_KEY && e.key !== DELETED_KEY) return;
    if (!refreshFromStorage()) return;
    if (isOpen()) render();
  });

  async function push() {
    if (typeof PlutoniumStore === 'undefined' || !PlutoniumStore.currentUser) return;
    const hash = stateHash();
    if (hash === lastPushHash) return;
    try {
      await PlutoniumStore.setDoc(DOC_NAME, { entries: entries, deleted: deleted, lastSync: new Date() });
      lastPushHash = hash;
    } catch (e) {
      console.warn('[History] push failed:', e);
    }
  }

  async function pull() {
    if (typeof PlutoniumStore === 'undefined' || !PlutoniumStore.currentUser) return;
    try {
      const doc = await PlutoniumStore.getDoc(DOC_NAME);
      const remote = doc && Array.isArray(doc.entries)
        ? doc.entries.filter(function (e) { return e && e.type && e.ts && e.title; })
        : [];
      const remoteDeleted = doc && doc.deleted && typeof doc.deleted === 'object' && !Array.isArray(doc.deleted)
        ? doc.deleted
        : {};
      deleted = mergeDeleted(deleted, remoteDeleted);
      entries = mergeEntries(remote);
      saveEntries();
      saveDeleted();
      lastPushHash = '';
      if (isOpen()) render();
      push();
    } catch (e) {
      console.warn('[History] pull failed:', e);
    }
  }

  function schedulePush() {
    if (pushTimer) return;
    pushTimer = setTimeout(function () { pushTimer = null; push(); }, PUSH_MS);
  }

  function startPeriodicPush() {
    if (periodicTimer) return;
    periodicTimer = setInterval(push, PUSH_MS * 2);
  }

  function stopPeriodicPush() {
    if (!periodicTimer) return;
    clearInterval(periodicTimer);
    periodicTimer = null;
  }

  if (typeof PlutoniumStore !== 'undefined' && typeof PlutoniumStore.onAuthChange === 'function') {
    PlutoniumStore.onAuthChange(function (u) {
      if (u) { pull(); startPeriodicPush(); }
      else stopPeriodicPush();
    });
  }
  window.addEventListener('pagehide', function () { push(); });

  function engineLabel(engine) { return ENGINE_LABELS[engine] || ''; }

  function isOpen() {
    const dlg = document.getElementById('history-dialog');
    return !!dlg && !dlg.hidden;
  }

  function startOfDay(ts) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function groupLabel(ts) {
    const now = Date.now();
    if (now - ts < HOUR_MS) return 'Last hour';
    const today = startOfDay(now);
    const day   = startOfDay(ts);
    if (day === today) return 'Today';
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (day === startOfDay(yesterday.getTime())) return 'Yesterday';
    return new Date(ts).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }

  function timeLabel(ts) {
    return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  function visibleEntries() {
    const q = searchQuery.trim().toLowerCase();
    return entries.filter(function (e) {
      if (activeFilter !== 'all' && e.type !== activeFilter) return false;
      if (!q) return true;
      return (e.title + ' ' + e.sub + ' ' + e.href + ' ' + engineLabel(e.engine)).toLowerCase().indexOf(q) !== -1;
    });
  }

  function openDialog() {
    const scrim = document.getElementById('history-scrim');
    const dlg   = document.getElementById('history-dialog');
    if (!scrim || !dlg) return;
    bindOnce();
    refreshFromStorage();
    render();
    if (typeof PlutoniumStore !== 'undefined' && PlutoniumStore.currentUser) pull();
    dlg.hidden = false;
    scrim.hidden = false;
    dlg.offsetHeight;
    dlg.style.opacity = '1';
    dlg.style.transform = 'translate(-50%,-50%) scale(1)';
    scrim.style.opacity = '1';
    const input = document.getElementById('history-search-input');
    if (input) setTimeout(function () { input.focus(); }, 150);
  }

  function closeDialog() {
    const scrim = document.getElementById('history-scrim');
    const dlg   = document.getElementById('history-dialog');
    if (!dlg || !scrim || dlg.hidden) return;
    disarmClearButton();
    dlg.style.opacity = '0';
    dlg.style.transform = 'translate(-50%,-50%) scale(0.96)';
    scrim.style.opacity = '0';
    setTimeout(function () { dlg.hidden = true; scrim.hidden = true; }, 200);
  }

  function disarmClearButton() {
    clearArmed = false;
    if (clearTimer) { clearTimeout(clearTimer); clearTimer = null; }
    const btn = document.getElementById('history-dialog-clear');
    if (!btn) return;
    btn.classList.remove('is-armed');
    btn.innerHTML = '<i class="fas fa-trash-can"></i>Clear all';
  }

  function updateClearButton() {
    const btn = document.getElementById('history-dialog-clear');
    if (!btn) return;
    const empty = !entries.length;
    btn.disabled = empty;
    if (empty) disarmClearButton();
  }

  function bindOnce() {
    if (bound) return;
    bound = true;

    const scrim = document.getElementById('history-scrim');
    const dlg   = document.getElementById('history-dialog');
    const input = document.getElementById('history-search-input');
    const clear = document.getElementById('history-search-clear');
    const clearAllBtn = document.getElementById('history-dialog-clear');

    document.getElementById('history-dialog-close').addEventListener('click', closeDialog);
    scrim.addEventListener('click', closeDialog);

    function applyQuery() {
      searchQuery = input.value;
      if (clear) clear.hidden = !input.value;
      renderList();
    }

    input.addEventListener('input', applyQuery);
    input.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (searchQuery) { input.value = ''; applyQuery(); }
      else closeDialog();
    });
    if (clear) clear.addEventListener('click', function () { input.value = ''; applyQuery(); input.focus(); });

    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', function () {
        if (!clearArmed) {
          clearArmed = true;
          clearAllBtn.classList.add('is-armed');
          clearAllBtn.innerHTML = '<i class="fas fa-trash-can"></i>Clear all?';
          clearTimer = setTimeout(disarmClearButton, 3000);
          return;
        }
        disarmClearButton();
        clearAll();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) closeDialog();
    });
  }

  function render() {
    updateClearButton();
    renderTags();
    renderList();
  }

  function renderTags() {
    const bar = document.getElementById('history-tags');
    if (!bar) return;
    bar.innerHTML = '';
    FILTERS.forEach(function (f) {
      const count = f.key === 'all'
        ? entries.length
        : entries.filter(function (e) { return e.type === f.key; }).length;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'history-tag' + (activeFilter === f.key ? ' active' : '');
      btn.innerHTML = '<span class="history-tag__label"></span>' +
        (count ? '<span class="history-tag__count">' + count + '</span>' : '');
      btn.querySelector('.history-tag__label').textContent = f.label;
      btn.addEventListener('click', function () {
        activeFilter = f.key;
        renderTags();
        renderList();
      });
      bar.appendChild(btn);
    });
  }

  function renderList() {
    const list = document.getElementById('history-list');
    if (!list) return;
    list.innerHTML = '';

    const items = visibleEntries();
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'history-empty';
      empty.innerHTML = '<i class="fa-solid ' + (entries.length ? 'fa-magnifying-glass' : 'fa-clock-rotate-left') + '"></i>';
      const msg = document.createElement('div');
      msg.className = 'history-empty__text';
      msg.textContent = entries.length
        ? 'No history matches that search.'
        : 'Nothing here yet. Searches, games, media, AI chats and VMs show up here as you use Plutonium.';
      empty.appendChild(msg);
      list.appendChild(empty);
      return;
    }

    let group = '';
    let groupEl = null;
    items.forEach(function (entry) {
      const label = groupLabel(entry.ts);
      if (label !== group) {
        group = label;
        groupEl = document.createElement('div');
        groupEl.className = 'history-group';
        const head = document.createElement('div');
        head.className = 'history-group__label';
        head.textContent = label;
        groupEl.appendChild(head);
        list.appendChild(groupEl);
      }
      groupEl.appendChild(makeRow(entry));
    });
  }

  function makeRow(entry) {
    const meta = TYPE_META[entry.type] || TYPE_META.web;
    const row = document.createElement('div');
    row.className = 'history-row';
    row.dataset.type = entry.type;
    row.setAttribute('role', 'button');
    row.tabIndex = 0;
    row.innerHTML =
      '<span class="history-row__icon"><i class="fa-solid ' + meta.icon + '"></i></span>' +
      '<span class="history-row__body">' +
        '<span class="history-row__title"></span>' +
        '<span class="history-row__sub"></span>' +
      '</span>' +
      '<span class="history-row__time"></span>' +
      '<button class="history-row__delete" type="button"><i class="fas fa-trash-can"></i></button>';

    row.querySelector('.history-row__title').textContent = entry.title;

    const parts = [meta.label];
    const engine = engineLabel(entry.engine);
    if (engine) parts.push(engine);
    if (entry.sub) parts.push(entry.sub);
    const subEl = row.querySelector('.history-row__sub');
    subEl.textContent = parts.join(' · ');
    subEl.title = parts.join(' · ');

    row.querySelector('.history-row__time').textContent = timeLabel(entry.ts);
    row.title = entry.href || entry.title;

    function activate() {
      if (!entry.href || typeof navigate !== 'function') return;
      closeDialog();
      navigate(entry.href);
    }
    row.addEventListener('click', activate);
    row.addEventListener('keydown', function (e) {
      if (e.key === 'Delete') {
        e.preventDefault();
        removeEntry(entry.id);
        return;
      }
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      activate();
    });

    const del = row.querySelector('.history-row__delete');
    del.title = 'Delete from history';
    del.setAttribute('aria-label', 'Delete ' + entry.title + ' from history');
    del.addEventListener('click', function (e) {
      e.stopPropagation();
      removeEntry(entry.id);
    });

    return row;
  }

  window.historyManager = {
    record:     record,
    getEntries: getEntries,
    remove:     removeEntry,
    clear:      clearAll,
    push:       push,
    pull:       pull,
    STORAGE_KEY: STORAGE_KEY,
    DELETED_KEY: DELETED_KEY,
    MAX_ENTRIES: MAX_ENTRIES,
  };

  window.openHistoryDialog  = openDialog;
  window.closeHistoryDialog = closeDialog;
})();
