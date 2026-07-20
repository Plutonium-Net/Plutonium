(function () {
  'use strict';

  const DB_NAME    = 'plutonium_personal_games';
  const DB_VERSION = 1;
  const FILE_STORE = 'pg_files';
  const META_STORE = 'pg_meta';

  const CLOUD_DOC  = 'personal_games/meta';   // Firestore: users/{uid}/personal_games/meta

  let _db = null;

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

  function dbHasGameFiles(id) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const range = IDBKeyRange.bound(`${id}/`, `${id}/\uffff`);
      const req   = db.transaction(FILE_STORE, 'readonly').objectStore(FILE_STORE).openCursor(range);
      req.onsuccess = e => resolve(!!e.target.result);
      req.onerror   = e => reject(e.target.error);
    }));
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/pg-sw.js', { scope: '/' }).catch(err => {
      console.warn('[personal-games] SW registration failed:', err);
    });
  }

  function uid() {
    return 'pg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function mimeFor(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const map = {
      html: 'text/html', htm: 'text/html', js: 'text/javascript',
      mjs: 'text/javascript', css: 'text/css', json: 'application/json',
      wasm: 'application/wasm', png: 'image/png', jpg: 'image/jpeg',
      jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
      svg: 'image/svg+xml', ico: 'image/x-icon', mp3: 'audio/mpeg',
      ogg: 'audio/ogg', wav: 'audio/wav', mp4: 'video/mp4',
      webm: 'video/webm', woff: 'font/woff', woff2: 'font/woff2',
      ttf: 'font/ttf', otf: 'font/otf', txt: 'text/plain',
      xml: 'application/xml', data: 'application/octet-stream',
    };
    return map[ext] || 'application/octet-stream';
  }

  function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload  = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error);
      fr.readAsArrayBuffer(file);
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

  const _overlay = document.getElementById('pg-modal-overlay');
  const _modals  = {
    file:   document.getElementById('pg-modal-file'),
    folder: document.getElementById('pg-modal-folder'),
    edit:   document.getElementById('pg-modal-edit'),
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
    if (name === 'folder') {
      document.getElementById('pg-folder-input').value = '';
      document.getElementById('pg-folder-name').value  = '';
      document.getElementById('pg-folder-art-input').value = '';
      _setArtPreview('folder', null);
      document.getElementById('pg-folder-drop').classList.remove('has-file');
      document.getElementById('pg-folder-drop-label').textContent = 'Click or drag a game folder here';
      _pendingFolderFiles = null;
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

  ['file', 'folder'].forEach(prefix => {
    const artInput = document.getElementById(`pg-${prefix}-art-input`);
    artInput.addEventListener('change', async () => {
      const f = artInput.files[0];
      if (!f) return;
      _setArtPreview(prefix, await readFileAsDataURL(f));
    });
    document.getElementById(`pg-${prefix}-art-btn`).addEventListener('click', () => artInput.click());
    document.getElementById(`pg-${prefix}-art-clear`).addEventListener('click', () => {
      artInput.value = '';
      _setArtPreview(prefix, null);
    });
  });

  let _pendingFileUpload = null;

  const fileInput    = document.getElementById('pg-file-input');
  const fileDrop     = document.getElementById('pg-file-drop');
  const fileDropLbl  = document.getElementById('pg-file-drop-label');

  function _handleFileSelection(file) {
    if (!file || !file.name.match(/\.html?$/i)) {
      _showPgToast('Please select an HTML file.', 2500);
      return;
    }
    _pendingFileUpload = file;
    fileDrop.classList.add('has-file');
    fileDropLbl.textContent = file.name;
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
    const file = e.dataTransfer.files[0];
    _handleFileSelection(file);
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
      const id  = uid();
      const buf = await readFileAsArrayBuffer(_pendingFileUpload);
      await dbPut(FILE_STORE, { type: 'text/html', data: buf }, `${id}/index.html`);
      const meta = { id, name, type: 'file', art: artURL, addedAt: Date.now() };
      await dbPut(META_STORE, meta);
      closeModal('file');
      _renderMyGames();
      _saveCloud();
      _showPgToast(`"${name}" added!`, 2500);
    } catch (e) {
      console.error('[personal-games] save failed:', e);
      _showPgToast('Failed to save game.', 3000);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Add Game';
    }
  });

  let _pendingFolderFiles = null;

  const folderInput   = document.getElementById('pg-folder-input');
  const folderDrop    = document.getElementById('pg-folder-drop');
  const folderDropLbl = document.getElementById('pg-folder-drop-label');

  function _handleFolderSelection(files) {
    if (!files || !files.length) return;
    const fileArr = Array.from(files);
    const hasMeta = fileArr.some(f =>
      (f.webkitRelativePath || f.name).replace(/^[^/]+\//, '') === 'index.html'
    );
    if (!hasMeta) {
      _showPgToast('The folder must contain an index.html file.', 3000);
      return;
    }
    _pendingFolderFiles = fileArr;
    folderDrop.classList.add('has-file');
    const firstPath = fileArr[0].webkitRelativePath || fileArr[0].name;
    const inferredName = firstPath.split('/')[0] || 'My Game';
    folderDropLbl.textContent = `${inferredName}/ (${fileArr.length} files)`;
    if (!document.getElementById('pg-folder-name').value) {
      document.getElementById('pg-folder-name').value = inferredName;
    }
  }

  folderInput.addEventListener('change', () => _handleFolderSelection(folderInput.files));

  folderDrop.addEventListener('click', () => folderInput.click());

  folderDrop.addEventListener('dragover', e => { e.preventDefault(); folderDrop.classList.add('drag-over'); });
  folderDrop.addEventListener('dragleave', () => folderDrop.classList.remove('drag-over'));
  folderDrop.addEventListener('drop', e => {
    e.preventDefault();
    folderDrop.classList.remove('drag-over');

    const items = e.dataTransfer.items;
    if (!items) return;

    const allFiles = [];
    let pending = 0;

    function readEntry(entry, basePath) {
      if (entry.isFile) {
        pending++;
        entry.file(file => {
          Object.defineProperty(file, 'webkitRelativePath', {
            value: basePath + file.name,
            writable: false,
          });
          allFiles.push(file);
          pending--;
          if (pending === 0) _handleFolderSelection(allFiles);
        });
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        pending++;
        reader.readEntries(entries => {
          pending--;
          entries.forEach(child => readEntry(child, basePath + entry.name + '/'));
          if (pending === 0 && allFiles.length) _handleFolderSelection(allFiles);
        });
      }
    }

    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry?.();
      if (entry) readEntry(entry, '');
    }
  });

  document.getElementById('pg-folder-save').addEventListener('click', async () => {
    if (!_pendingFolderFiles) {
      _showPgToast('Please select a game folder first.', 2500);
      return;
    }
    const rawName = document.getElementById('pg-folder-name').value.trim();
    const inferredName = (_pendingFolderFiles[0].webkitRelativePath || _pendingFolderFiles[0].name).split('/')[0];
    const name    = rawName || inferredName || 'My Game';
    const artFile = document.getElementById('pg-folder-art-input').files[0];
    const artURL  = artFile ? await readFileAsDataURL(artFile) : null;

    const btn = document.getElementById('pg-folder-save');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      const id = uid();

      for (const file of _pendingFolderFiles) {
        const relPath = (file.webkitRelativePath || file.name).replace(/^[^/]+\//, '');
        const buf     = await readFileAsArrayBuffer(file);
        await dbPut(FILE_STORE, { type: mimeFor(file.name), data: buf }, `${id}/${relPath}`);
      }

      const meta = { id, name, type: 'folder', art: artURL, addedAt: Date.now() };
      await dbPut(META_STORE, meta);
      closeModal('folder');
      _renderMyGames();
      _saveCloud();
      _showPgToast(`"${name}" added!`, 2500);
    } catch (e) {
      console.error('[personal-games] folder save failed:', e);
      _showPgToast('Failed to save game folder.', 3000);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Add Folder';
    }
  });

  let _editingId = null;

  async function _openEdit(meta) {
    _editingId = meta.id;
    document.getElementById('pg-edit-name').value = meta.name || '';
    _setArtPreview('edit', meta.art || null);
    openModal('edit');
  }

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

  document.getElementById('pg-edit-save').addEventListener('click', async () => {
    if (!_editingId) return;
    const name    = document.getElementById('pg-edit-name').value.trim();
    const artFile = document.getElementById('pg-edit-art-input').files[0];

    const btn = document.getElementById('pg-edit-save');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      const meta   = await dbGet(META_STORE, _editingId);
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

  async function _deleteGame(meta) {
    try {
      await dbDeleteGameFiles(meta.id);
      await dbDelete(META_STORE, meta.id);
      _renderMyGames();
      _saveCloud();
      _showPgToast(`"${meta.name}" deleted.`, 2000);
    } catch (e) {
      _showPgToast('Failed to delete game.', 3000);
    }
  }

  function _launchPersonalGame(meta) {
    const url = `/pg-game/${meta.id}/index.html`;
    if (window.PGViewer) {
      window.PGViewer.open(url, meta.name, { id: meta.id, name: meta.name, personal: true });
    } else {
      window.open(url, '_blank');
    }
  }

  function _buildPersonalCard(meta, hasFiles = true) {
    const card = document.createElement('div');
    card.className = 'pgcdn-card pg-personal-card' + (hasFiles ? '' : ' pg-card--cloud-only');
    card.title = meta.name;

    const imgSrc = meta.art || '';
    card.innerHTML = `
      ${imgSrc
        ? `<img class="pgcdn-card__img" src="${imgSrc}" alt="${meta.name}" />`
        : `<div class="pgcdn-card__img pg-no-art"><i class="fa-solid fa-${meta.type === 'folder' ? 'folder-open' : 'file-code'}"></i></div>`
      }
      ${!hasFiles ? `<div class="pg-cloud-only-badge" title="Files not on this device — re-upload to play"><i class="fa-solid fa-cloud"></i> Not downloaded</div>` : ''}
      <div class="pgcdn-card__name">${meta.name}</div>
      <button class="pg-card-more" title="Options" aria-label="Options">
        <i class="fa-solid fa-ellipsis-vertical"></i>
      </button>
    `;

    if (hasFiles) {
      card.addEventListener('click', () => _launchPersonalGame(meta));
    } else {
      card.addEventListener('click', () => {
        _showPgToast(`"${meta.name}" files aren't on this device. Re-upload the game to play it.`, 4000);
      });
    }

    card.querySelector('.pg-card-more').addEventListener('click', e => {
      e.stopPropagation();
      const items = [];
      if (hasFiles) {
        items.push({
          icon:   'fa-solid fa-play',
          label:  'Play',
          action: () => _launchPersonalGame(meta),
        });
      }
      items.push(
        {
          icon:   'fa-solid fa-pencil',
          label:  'Edit details',
          action: () => _openEdit(meta),
        },
        'sep',
        {
          icon:   'fa-solid fa-trash',
          label:  'Delete',
          danger: true,
          action: () => _confirmDelete(meta),
        }
      );
      _showCtxMenu(e, items);
    });

    return card;
  }

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

  function _setBadge(synced) {
    if (!_cloudBadge) return;
    if (synced === 'saving') {
      _cloudBadge.textContent = '↑ Saving…';
      _cloudBadge.className   = 'pg-cloud-badge pg-cloud-badge--saving';
    } else if (synced === true) {
      _cloudBadge.textContent = '✓ Synced';
      _cloudBadge.className   = 'pg-cloud-badge pg-cloud-badge--ok';
    } else if (synced === 'error') {
      _cloudBadge.textContent = '⚠ Sync failed';
      _cloudBadge.className   = 'pg-cloud-badge pg-cloud-badge--error';
    } else {
      _cloudBadge.textContent = '';
      _cloudBadge.className   = 'pg-cloud-badge';
    }
  }

  async function _saveCloud() {
    if (typeof PlutoniumStore === 'undefined' || !PlutoniumStore.currentUser) return;
    _setBadge('saving');
    try {
      const games = await dbGetAll(META_STORE).catch(() => []);
      const serializable = games.map(({ id, name, type, art, addedAt }) => ({ id, name, type, art: art || null, addedAt }));
      await PlutoniumStore.setDoc(CLOUD_DOC, { games: serializable });
      _setBadge(true);
    } catch (e) {
      console.warn('[personal-games] cloud save failed:', e.message);
      _setBadge('error');
    }
  }

  async function _loadCloud() {
    if (typeof PlutoniumStore === 'undefined' || !PlutoniumStore.currentUser) return;
    try {
      const doc = await PlutoniumStore.getDoc(CLOUD_DOC).catch(() => null);
      if (!doc || !Array.isArray(doc.games)) return;

      // Merge: add cloud entries whose id is not already in local IDB
      const localGames = await dbGetAll(META_STORE).catch(() => []);
      const localIds   = new Set(localGames.map(g => g.id));
      let added = 0;
      for (const g of doc.games) {
        if (!localIds.has(g.id)) {
          await dbPut(META_STORE, { id: g.id, name: g.name, type: g.type, art: g.art || null, addedAt: g.addedAt });
          added++;
        }
      }
      if (added > 0) {
        _renderMyGames();
        _showPgToast(`${added} game${added !== 1 ? 's' : ''} synced from cloud.`, 3000);
      }
      _setBadge(true);
    } catch (e) {
      console.warn('[personal-games] cloud load failed:', e.message);
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
      for (const meta of games) {
        const hasFiles = await dbHasGameFiles(meta.id).catch(() => false);
        grid.appendChild(_buildPersonalCard(meta, hasFiles));
      }
    }
  }

  const _pgToast      = document.getElementById('pgcdn-toast');
  const _pgToastMsg   = document.getElementById('pgcdn-toast-msg');
  const _pgToastActs  = document.getElementById('pgcdn-toast-actions');
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

  document.getElementById('pg-add-file-btn').addEventListener('click', () => openModal('file'));
  document.getElementById('pg-add-folder-btn').addEventListener('click', () => openModal('folder'));

  _renderMyGames();

})();
