(function () {
  'use strict';

  const DB_NAME    = 'plutonium_personal_games';
  const DB_VERSION = 1;
  const FILE_STORE = 'pg_files';
  const META_STORE = 'pg_meta';

  // Firestore paths (users/{uid}/…)
  const CLOUD_META = 'personal_games/meta';          // { games: [...] }
  // per-game file stored at personal_games/files/<id>  { html: '<string>' }
  const CLOUD_FILE = id => `personal_games/files/${id}`;

  const MAX_BYTES  = 1 * 1024 * 1024; // 1 MiB

  let _db = null;

  // ── IndexedDB helpers ────────────────────────────────────────────────────

  function openDB() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(FILE_STORE)) {
          db.createObjectStore(FILE_STORE);
        }
      };
      req.onsuccess = e => { _db = e.target.result; resolve(_db); };
      req.onerror   = e => reject(e.target.error);
    });
  }

  function dbGet(store, key) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const req = db.transaction(store, 'readonly').objectStore(store).get(key);
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    }));
  }

  function dbPut(store, value, key) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const tx  = db.transaction(store, 'readwrite');
      const req = key !== undefined
        ? tx.objectStore(store).put(value, key)
        : tx.objectStore(store).put(value);
      req.onsuccess = () => resolve();
      req.onerror   = e => reject(e.target.error);
    }));
  }

  function dbDelete(store, key) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const req = db.transaction(store, 'readwrite').objectStore(store).delete(key);
      req.onsuccess = () => resolve();
      req.onerror   = e => reject(e.target.error);
    }));
  }

  function dbGetAll(store) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const req = db.transaction(store, 'readonly').objectStore(store).getAll();
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    }));
  }

  function dbDeleteGameFiles(id) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const range = IDBKeyRange.bound(`${id}/`, `${id}/\uffff`);
      const tx  = db.transaction(FILE_STORE, 'readwrite');
      const req = tx.objectStore(FILE_STORE).delete(range);
      req.onsuccess = () => resolve();
      req.onerror   = e => reject(e.target.error);
    }));
  }

  // ── Service worker ───────────────────────────────────────────────────────

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/pg-sw.js', { scope: '/' }).catch(err => {
      console.warn('[personal-games] SW registration failed:', err);
    });
  }

  // ── Utilities ────────────────────────────────────────────────────────────

  function uid() {
    return 'pg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload  = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error);
      fr.readAsText(file);
    });
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload  = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(file);
    });
  }

  // ── Modal helpers ────────────────────────────────────────────────────────

  const _overlay = document.getElementById('pg-modal-overlay');
  const _modals  = {
    file: document.getElementById('pg-modal-file'),
    edit: document.getElementById('pg-modal-edit'),
  };

  function openModal(name) {
    _overlay.classList.add('active');
    _modals[name].classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeModal(name) {
    _overlay.classList.remove('active');
    Object.values(_modals).forEach(m => m.classList.remove('active'));
    document.body.style.overflow = '';
    if (name) _resetModal(name);
  }

  function _resetModal(name) {
    if (name === 'file') {
      document.getElementById('pg-file-input').value = '';
      document.getElementById('pg-file-name').value  = '';
      document.getElementById('pg-file-art-input').value = '';
      _setArtPreview('file', null);
      document.getElementById('pg-file-drop').classList.remove('has-file');
      document.getElementById('pg-file-drop-label').textContent = 'Click or drag an HTML file here';
      _pendingFileUpload = null;
    }
  }

  _overlay.addEventListener('click', e => {
    if (e.target === _overlay) closeModal();
  });

  document.querySelectorAll('.pg-modal__close').forEach(btn => {
    btn.addEventListener('click', () => closeModal());
  });

  function _setArtPreview(prefix, dataURL) {
    const img     = document.getElementById(`pg-${prefix}-art-preview`);
    const wrapper = document.getElementById(`pg-${prefix}-art-preview-wrap`);
    if (dataURL) {
      img.src = dataURL;
      wrapper.style.display = '';
    } else {
      img.src = '';
      wrapper.style.display = 'none';
    }
  }

  // art picker for file modal
  const _fileArtInput = document.getElementById('pg-file-art-input');
  _fileArtInput.addEventListener('change', async () => {
    const f = _fileArtInput.files[0];
    if (!f) return;
    _setArtPreview('file', await readFileAsDataURL(f));
  });
  document.getElementById('pg-file-art-btn').addEventListener('click', () => _fileArtInput.click());
  document.getElementById('pg-file-art-clear').addEventListener('click', () => {
    _fileArtInput.value = '';
    _setArtPreview('file', null);
  });

  // art picker for edit modal
  document.getElementById('pg-edit-art-btn').addEventListener('click', () => {
    document.getElementById('pg-edit-art-input').click();
  });
  document.getElementById('pg-edit-art-input').addEventListener('change', async function () {
    const f = this.files[0];
    if (!f) return;
    _setArtPreview('edit', await readFileAsDataURL(f));
  });
  document.getElementById('pg-edit-art-clear').addEventListener('click', () => {
    document.getElementById('pg-edit-art-input').value = '';
    _setArtPreview('edit', null);
  });

  // ── File upload ──────────────────────────────────────────────────────────

  let _pendingFileUpload = null;

  const fileInput   = document.getElementById('pg-file-input');
  const fileDrop    = document.getElementById('pg-file-drop');
  const fileDropLbl = document.getElementById('pg-file-drop-label');

  function _handleFileSelection(file) {
    if (!file || !file.name.match(/\.html?$/i)) {
      _showPgToast('Please select an HTML file.', 2500);
      return;
    }
    if (file.size > MAX_BYTES) {
      _showPgToast(`File is too large (${(file.size / 1024 / 1024).toFixed(2)} MiB). Maximum is 1 MiB.`, 4000);
      return;
    }
    _pendingFileUpload = file;
    fileDrop.classList.add('has-file');
    fileDropLbl.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    if (!document.getElementById('pg-file-name').value) {
      document.getElementById('pg-file-name').value = file.name.replace(/\.html?$/i, '');
    }
  }

  fileInput.addEventListener('change', () => _handleFileSelection(fileInput.files[0]));
  fileDrop.addEventListener('click', () => fileInput.click());
  fileDrop.addEventListener('dragover', e => { e.preventDefault(); fileDrop.classList.add('drag-over'); });
  fileDrop.addEventListener('dragleave', () => fileDrop.classList.remove('drag-over'));
  fileDrop.addEventListener('drop', e => {
    e.preventDefault();
    fileDrop.classList.remove('drag-over');
    _handleFileSelection(e.dataTransfer.files[0]);
  });

  document.getElementById('pg-file-save').addEventListener('click', async () => {
    if (!_pendingFileUpload) {
      _showPgToast('Please select an HTML file first.', 2500);
      return;
    }
    const rawName = document.getElementById('pg-file-name').value.trim();
    const name    = rawName || _pendingFileUpload.name.replace(/\.html?$/i, '');
    const artFile = document.getElementById('pg-file-art-input').files[0];
    const artURL  = artFile ? await readFileAsDataURL(artFile) : null;

    const btn = document.getElementById('pg-file-save');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      const id   = uid();
      const html = await readFileAsText(_pendingFileUpload);

      // Save to IDB for local service-worker playback
      const enc = new TextEncoder().encode(html);
      await dbPut(FILE_STORE, { type: 'text/html', data: enc.buffer }, `${id}/index.html`);

      const meta = { id, name, type: 'file', art: artURL, addedAt: Date.now() };
      await dbPut(META_STORE, meta);

      closeModal('file');
      _renderMyGames();
      _saveCloud(id, html);
      _showPgToast(`"${name}" added!`, 2500);
    } catch (e) {
      console.error('[personal-games] save failed:', e);
      _showPgToast('Failed to save game.', 3000);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Add Game';
    }
  });

  // ── Edit modal ───────────────────────────────────────────────────────────

  let _editingId = null;

  async function _openEdit(meta) {
    _editingId = meta.id;
    document.getElementById('pg-edit-name').value = meta.name || '';
    _setArtPreview('edit', meta.art || null);
    openModal('edit');
  }

  document.getElementById('pg-edit-save').addEventListener('click', async () => {
    if (!_editingId) return;
    const name    = document.getElementById('pg-edit-name').value.trim();
    const artFile = document.getElementById('pg-edit-art-input').files[0];

    const btn = document.getElementById('pg-edit-save');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      const meta = await dbGet(META_STORE, _editingId);
      if (!meta) throw new Error('not found');
      if (name)    meta.name = name;
      if (artFile) meta.art  = await readFileAsDataURL(artFile);
      const previewWrap = document.getElementById('pg-edit-art-preview-wrap');
      if (previewWrap.style.display === 'none') meta.art = null;

      await dbPut(META_STORE, meta);
      closeModal('edit');
      _renderMyGames();
      _saveCloud();
      _showPgToast(`"${meta.name}" updated.`, 2000);
    } catch (e) {
      _showPgToast('Failed to update game.', 3000);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save';
      _editingId = null;
    }
  });

  // ── Delete ───────────────────────────────────────────────────────────────

  async function _deleteGame(meta) {
    try {
      await dbDeleteGameFiles(meta.id);
      await dbDelete(META_STORE, meta.id);
      _renderMyGames();
      _saveCloud();
      // Remove file doc from Firestore too
      if (typeof PlutoniumStore !== 'undefined' && PlutoniumStore.currentUser) {
        PlutoniumStore.deleteDoc(CLOUD_FILE(meta.id)).catch(() => {});
      }
      _showPgToast(`"${meta.name}" deleted.`, 2000);
    } catch (e) {
      _showPgToast('Failed to delete game.', 3000);
    }
  }

  // ── Launch ───────────────────────────────────────────────────────────────

  function _launchPersonalGame(meta) {
    const url = `/pg-game/${meta.id}/index.html`;
    if (window.PGViewer) {
      window.PGViewer.open(url, meta.name, { id: meta.id, name: meta.name, personal: true });
    } else {
      window.open(url, '_blank');
    }
  }

  // ── Card builder ─────────────────────────────────────────────────────────

  function _buildPersonalCard(meta) {
    const card = document.createElement('div');
    card.className = 'pgcdn-card pg-personal-card';
    card.title = meta.name;

    const imgSrc = meta.art || '';
    card.innerHTML = `
      ${imgSrc
        ? `<img class="pgcdn-card__img" src="${imgSrc}" alt="${meta.name}" />`
        : `<div class="pgcdn-card__img pg-no-art"><i class="fa-solid fa-file-code"></i></div>`
      }
      <div class="pgcdn-card__name">${meta.name}</div>
      <button class="pg-card-more" title="Options" aria-label="Options">
        <i class="fa-solid fa-ellipsis-vertical"></i>
      </button>
    `;

    card.addEventListener('click', () => _launchPersonalGame(meta));

    card.querySelector('.pg-card-more').addEventListener('click', e => {
      e.stopPropagation();
      _showCtxMenu(e, [
        { icon: 'fa-solid fa-play',   label: 'Play',         action: () => _launchPersonalGame(meta) },
        { icon: 'fa-solid fa-pencil', label: 'Edit details', action: () => _openEdit(meta) },
        'sep',
        { icon: 'fa-solid fa-trash',  label: 'Delete', danger: true, action: () => _confirmDelete(meta) },
      ]);
    });

    return card;
  }

  // ── Context menu ─────────────────────────────────────────────────────────

  function _showCtxMenu(e, items) {
    const ctxMenu = document.getElementById('pgcdn-ctx-menu');
    if (!ctxMenu) return;
    e.preventDefault();
    ctxMenu.innerHTML = '';

    items.forEach(item => {
      if (item === 'sep') {
        const sep = document.createElement('div');
        sep.className = 'ctx-sep';
        ctxMenu.appendChild(sep);
        return;
      }
      const el = document.createElement('div');
      el.className = 'ctx-item' + (item.danger ? ' ctx-item--danger' : '');
      el.innerHTML = `<i class="${item.icon}"></i>${item.label}`;
      el.addEventListener('click', () => {
        ctxMenu.classList.add('hidden');
        item.action();
      });
      ctxMenu.appendChild(el);
    });

    ctxMenu.classList.remove('hidden');
    const mw = ctxMenu.offsetWidth, mh = ctxMenu.offsetHeight;
    let x = e.clientX, y = e.clientY;
    if (x + mw > window.innerWidth  - 8) x = window.innerWidth  - mw - 8;
    if (y + mh > window.innerHeight - 8) y = window.innerHeight - mh - 8;
    ctxMenu.style.left = x + 'px';
    ctxMenu.style.top  = y + 'px';

    const dismiss = () => ctxMenu.classList.add('hidden');
    setTimeout(() => {
      document.addEventListener('click',  dismiss, { once: true });
      document.addEventListener('scroll', dismiss, { once: true, capture: true });
    }, 0);
  }

  function _confirmDelete(meta) {
    _showPgToast(`Delete "${meta.name}"?`, [
      { label: 'Cancel', action: () => {} },
      { label: 'Delete', danger: true, action: () => _deleteGame(meta) },
    ]);
  }

  // ── Cloud sync ────────────────────────────────────────────────────────────

  const _cloudBadge = document.getElementById('pg-cloud-badge');

  function _setBadge(state) {
    if (!_cloudBadge) return;
    if (state === 'saving') {
      _cloudBadge.textContent = '↑ Saving…';
      _cloudBadge.className   = 'pg-cloud-badge pg-cloud-badge--saving';
    } else if (state === 'syncing') {
      _cloudBadge.textContent = '↓ Syncing…';
      _cloudBadge.className   = 'pg-cloud-badge pg-cloud-badge--saving';
    } else if (state === true) {
      _cloudBadge.textContent = '✓ Synced';
      _cloudBadge.className   = 'pg-cloud-badge pg-cloud-badge--ok';
    } else if (state === 'error') {
      _cloudBadge.textContent = '⚠ Sync failed';
      _cloudBadge.className   = 'pg-cloud-badge pg-cloud-badge--error';
    } else {
      _cloudBadge.textContent = '';
      _cloudBadge.className   = 'pg-cloud-badge';
    }
  }

  // _saveCloud(gameId?, htmlText?) — saves meta list, and optionally saves a file doc.
  async function _saveCloud(newId, newHtml) {
    if (typeof PlutoniumStore === 'undefined' || !PlutoniumStore.currentUser) return;
    _setBadge('saving');
    try {
      // 1. Save metadata list
      const games = await dbGetAll(META_STORE).catch(() => []);
      const serializable = games.map(({ id, name, type, art, addedAt }) =>
        ({ id, name, type, art: art || null, addedAt })
      );
      await PlutoniumStore.setDoc(CLOUD_META, { games: serializable });

      // 2. If a new file was just added, upload its HTML to Firestore
      if (newId && newHtml != null) {
        await PlutoniumStore.setDoc(CLOUD_FILE(newId), { html: newHtml });
      }

      _setBadge(true);
    } catch (e) {
      console.warn('[personal-games] cloud save failed:', e.message);
      _setBadge('error');
    }
  }

  // _loadCloud() — on sign-in, fetch meta, then download missing HTML files into IDB.
  async function _loadCloud() {
    if (typeof PlutoniumStore === 'undefined' || !PlutoniumStore.currentUser) return;
    _setBadge('syncing');
    try {
      const doc = await PlutoniumStore.getDoc(CLOUD_META).catch(() => null);
      if (!doc || !Array.isArray(doc.games)) { _setBadge(true); return; }

      // Merge metadata for entries not already in local IDB
      const localGames = await dbGetAll(META_STORE).catch(() => []);
      const localIds   = new Set(localGames.map(g => g.id));
      const missing    = doc.games.filter(g => !localIds.has(g.id));

      for (const g of missing) {
        await dbPut(META_STORE, {
          id: g.id, name: g.name, type: g.type,
          art: g.art || null, addedAt: g.addedAt,
        });
      }

      // Download HTML for every game whose file isn't in IDB yet
      let downloaded = 0;
      for (const g of doc.games) {
        const fileKey = `${g.id}/index.html`;
        const existing = await dbGet(FILE_STORE, fileKey).catch(() => null);
        if (existing) continue;

        try {
          const fileDoc = await PlutoniumStore.getDoc(CLOUD_FILE(g.id));
          if (!fileDoc?.html) continue;
          const enc = new TextEncoder().encode(fileDoc.html);
          await dbPut(FILE_STORE, { type: 'text/html', data: enc.buffer }, fileKey);
          downloaded++;
        } catch (_) {}
      }

      if (missing.length > 0 || downloaded > 0) {
        _renderMyGames();
        if (downloaded > 0) {
          _showPgToast(
            `${downloaded} game${downloaded !== 1 ? 's' : ''} downloaded from cloud.`,
            3000
          );
        }
      }

      _setBadge(true);
    } catch (e) {
      console.warn('[personal-games] cloud load failed:', e.message);
      _setBadge('error');
    }
  }

  if (typeof PlutoniumStore !== 'undefined') {
    PlutoniumStore.onAuthChange(user => {
      if (user) {
        _loadCloud();
      } else {
        _setBadge(null);
      }
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  async function _renderMyGames() {
    const grid  = document.getElementById('pg-personal-grid');
    const empty = document.getElementById('pg-personal-empty');
    const count = document.getElementById('pg-personal-count');
    if (!grid) return;

    let games;
    try {
      games = await dbGetAll(META_STORE);
    } catch (e) {
      games = [];
    }

    games.sort((a, b) => b.addedAt - a.addedAt);
    count.textContent = games.length ? `${games.length} game${games.length !== 1 ? 's' : ''}` : '';

    grid.innerHTML = '';
    if (!games.length) {
      empty.style.display = '';
    } else {
      empty.style.display = 'none';
      games.forEach(meta => grid.appendChild(_buildPersonalCard(meta)));
    }
  }

  // ── Toast ─────────────────────────────────────────────────────────────────

  const _pgToast     = document.getElementById('pgcdn-toast');
  const _pgToastMsg  = document.getElementById('pgcdn-toast-msg');
  const _pgToastActs = document.getElementById('pgcdn-toast-actions');
  let   _pgToastTimer = null;

  function _showPgToast(msg, actionsOrDuration, autoDismiss = 0) {
    clearTimeout(_pgToastTimer);
    _pgToastMsg.textContent = msg;
    _pgToastActs.innerHTML  = '';

    const actions = Array.isArray(actionsOrDuration) ? actionsOrDuration : [];
    const dismiss = typeof actionsOrDuration === 'number' ? actionsOrDuration : autoDismiss;

    actions.forEach(a => {
      const btn = document.createElement('button');
      btn.className = 'toast-btn' + (a.danger ? ' toast-btn--danger' : '');
      btn.textContent = a.label;
      btn.addEventListener('click', () => {
        _pgToast.classList.remove('toast-visible');
        clearTimeout(_pgToastTimer);
        a.action();
      });
      _pgToastActs.appendChild(btn);
    });

    _pgToast.classList.add('toast-visible');
    if (dismiss > 0) _pgToastTimer = setTimeout(() => _pgToast.classList.remove('toast-visible'), dismiss);
  }

  // ── Boot ──────────────────────────────────────────────────────────────────

  document.getElementById('pg-add-file-btn').addEventListener('click', () => openModal('file'));

  _renderMyGames();

})();
