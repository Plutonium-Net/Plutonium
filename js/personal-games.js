(function () {
  'use strict';

  const DB_NAME    = 'plutonium_personal_games';
  const DB_VERSION = 1;
  const FILE_STORE = 'pg_files';
  const META_STORE = 'pg_meta';

  const CLOUD_META = 'personal_games/meta';
  const CLOUD_FILE = id => `pg_files/${id}`;

  const MAX_BYTES  = 1 * 1024 * 1024;

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

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/pg-sw.js', { scope: '/' }).catch(err => {
      console.warn('[personal-games] SW registration failed:', err);
    });
  }

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

    const btn = document.getElementById('pg-file-save');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      const id   = uid();
      const html = await readFileAsText(_pendingFileUpload);

      const enc = new TextEncoder().encode(html);
      await dbPut(FILE_STORE, { type: 'text/html', data: enc.buffer }, `${id}/index.html`);

      const meta = { id, name, addedAt: Date.now() };
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

  let _editingId = null;

  async function _openEdit(meta) {
    _editingId = meta.id;
    document.getElementById('pg-edit-name').value = meta.name || '';
    openModal('edit');
  }

  document.getElementById('pg-edit-save').addEventListener('click', async () => {
    if (!_editingId) return;
    const name = document.getElementById('pg-edit-name').value.trim();

    const btn = document.getElementById('pg-edit-save');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      const meta = await dbGet(META_STORE, _editingId);
      if (!meta) throw new Error('not found');
      if (name) meta.name = name;

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
      if (typeof PlutoniumStore !== 'undefined' && PlutoniumStore.currentUser) {
        PlutoniumStore.deleteDoc(CLOUD_FILE(meta.id)).catch(() => {});
      }
      _showPgToast(`"${meta.name}" deleted.`, 2000);
    } catch (e) {
      _showPgToast('Failed to delete game.', 3000);
    }
  }

  async function _launchPersonalGame(meta) {
    const fileKey = `${meta.id}/index.html`;

    const existing = await dbGet(FILE_STORE, fileKey).catch(() => null);
    if (!existing) {
      if (typeof PlutoniumStore === 'undefined' || !PlutoniumStore.currentUser) {
        _showPgToast('Sign in to download this game.', 3000);
        return;
      }
      _showPgToast('Downloading game…', 2000);
      try {
        const fileDoc = await PlutoniumStore.getDoc(CLOUD_FILE(meta.id));
        if (!fileDoc?.html) {
          _showPgToast('Game file not found in cloud.', 3000);
          return;
        }
        const enc = new TextEncoder().encode(fileDoc.html);
        await dbPut(FILE_STORE, { type: 'text/html', data: enc.buffer }, fileKey);
      } catch (e) {
        _showPgToast('Failed to download game.', 3000);
        return;
      }
    }

    const url = `/pg-game/${meta.id}/index.html`;
    if (window.PGViewer) {
      window.PGViewer.open(url, meta.name, { id: meta.id, name: meta.name, personal: true });
    } else {
      window.open(url, '_blank');
    }
  }

  function _buildPersonalCard(meta) {
    const card = document.createElement('div');
    card.className = 'pgcdn-card pg-personal-card';
    card.title = meta.name;

    card.innerHTML = `
      <div class="pgcdn-card__img pg-no-art"><i class="fa-solid fa-file-code"></i></div>
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

  async function _saveCloud(newId, newHtml) {
    if (typeof PlutoniumStore === 'undefined' || !PlutoniumStore.currentUser) return;
    _setBadge('saving');
    try {
      const games = await dbGetAll(META_STORE).catch(() => []);
      const serializable = games.map(({ id, name, addedAt }) => ({ id, name, addedAt }));
      await PlutoniumStore.setDoc(CLOUD_META, { games: serializable });

      if (newId && newHtml != null) {
        await PlutoniumStore.setDoc(CLOUD_FILE(newId), { html: newHtml });
      }

      _setBadge(true);
    } catch (e) {
      console.warn('[personal-games] cloud save failed:', e.message);
      _setBadge('error');
    }
  }

  async function _loadCloud() {
    if (typeof PlutoniumStore === 'undefined' || !PlutoniumStore.currentUser) return;
    _setBadge('syncing');
    try {
      const doc = await PlutoniumStore.getDoc(CLOUD_META).catch(() => null);
      if (!doc || !Array.isArray(doc.games)) { _setBadge(true); return; }

      const localGames = await dbGetAll(META_STORE).catch(() => []);
      const localIds   = new Set(localGames.map(g => g.id));
      const missing    = doc.games.filter(g => !localIds.has(g.id));

      for (const g of missing) {
        await dbPut(META_STORE, { id: g.id, name: g.name, addedAt: g.addedAt });
      }

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

  document.getElementById('pg-add-file-btn').addEventListener('click', () => openModal('file'));

  _renderMyGames();

  function parseGitHubUrl(input) {
    try {
      const u = new URL(input.trim());
      if (!/github\.com$/.test(u.hostname)) return null;
      const parts = u.pathname.replace(/^\/+|\/+$/g, '').split('/');
      if (parts.length < 2) return null;
      const owner = parts[0], repo = parts[1];
      let branch = null, path = '';
      if (parts[2] === 'tree' || parts[2] === 'blob') {
        branch = parts[3];
        path = parts.slice(4).join('/');
      }
      return { owner, repo, branch, path };
    } catch (e) {
      return null;
    }
  }

  async function getDefaultBranch(owner, repo) {
    try {
      const r = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
      if (!r.ok) throw new Error('repo not found');
      const json = await r.json();
      return json.default_branch || 'main';
    } catch (e) {
      return 'main';
    }
  }

  function rawUrlFor(owner, repo, branch, relPath) {
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${relPath}`;
  }

  function guessContentTypeFromPath(path) {
    const ext = (path.split('.').pop() || '').toLowerCase();
    switch (ext) {
      case 'html': return 'text/html';
      case 'htm': return 'text/html';
      case 'js': return 'application/javascript';
      case 'mjs': return 'application/javascript';
      case 'css': return 'text/css';
      case 'json': return 'application/json';
      case 'png': return 'image/png';
      case 'jpg': case 'jpeg': return 'image/jpeg';
      case 'gif': return 'image/gif';
      case 'svg': return 'image/svg+xml';
      case 'webp': return 'image/webp';
      case 'wav': return 'audio/wav';
      case 'mp3': return 'audio/mpeg';
      case 'ogg': return 'audio/ogg';
      default: return 'application/octet-stream';
    }
  }

  async function fetchTextOrArrayBuffer(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('fetch failed: ' + r.status);
    const ct = r.headers.get('content-type') || '';
    if (/^(text\/)*/i.test(ct) || /\.(html?|css|js|json|svg)$/i.test(url)) {
      return { data: await r.text(), isText: true, contentType: ct || 'text/plain' };
    } else {
      const buf = await r.arrayBuffer();
      return { data: buf, isText: false, contentType: ct || guessContentTypeFromPath(url) };
    }
  }

  function normalizeRelativePath(basePath, relative) {
    if (/^(https?:)?\/\//i.test(relative)) return null;
    relative = relative.split('#')[0].split('?')[0];
    if (relative.startsWith('/')) relative = relative.slice(1);
    if (!basePath) return relative;
    const combined = basePath + '/' + relative;
    const parts = combined.split('/');
    const stack = [];
    for (const p of parts) {
      if (p === '' || p === '.') continue;
      if (p === '..') stack.pop();
      else stack.push(p);
    }
    return stack.join('/');
  }

  async function importFromGitHubUrl(inputUrl) {
    const parsed = parseGitHubUrl(inputUrl);
    if (!parsed) {
      _showPgToast('Invalid GitHub URL', 3000);
      return;
    }

    const owner = parsed.owner, repo = parsed.repo;
    let branch = parsed.branch;
    let rootPath = parsed.path || '';

    const btn = document.getElementById('pg-github-import');
    btn.disabled = true;
    btn.textContent = 'Importing…';

    try {
      if (!branch) {
        branch = await getDefaultBranch(owner, repo);
      }

      async function findIndexPaths() {
        try {
          const treesUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
          const resp = await fetch(treesUrl);
          if (!resp.ok) throw new Error('tree fetch failed');
          const json = await resp.json();
          if (!Array.isArray(json.tree)) throw new Error('no tree');
          const idxEntries = json.tree.filter(e => /(^|\/)index\.html?$/i.test(e.path) && e.type === 'blob');
          const dirs = idxEntries.map(e => {
            const parts = e.path.split('/');
            parts.pop();
            return parts.join('/');
          });
          return [...new Set(dirs.sort((a, b) => (a === '' ? -1 : a.length - b.length)))];
        } catch (e) {
          return [''];
        }
      }

      let candidateDirs = [];
      if (rootPath) candidateDirs = [rootPath];
      else candidateDirs = await findIndexPaths();

      let found = false;
      let chosenDir = '';
      let indexHtml = null;
      for (const d of candidateDirs) {
        const candidate = d ? `${d}/index.html` : 'index.html';
        const raw = rawUrlFor(owner, repo, branch, candidate);
        try {
          const fetched = await fetchTextOrArrayBuffer(raw);
          if (fetched && fetched.isText) {
            indexHtml = fetched.data;
            chosenDir = d;
            found = true;
            break;
          }
        } catch (_) {}
      }

      if (!found) {
        _showPgToast('No index.html found in repository path', 3500);
        return;
      }

      const id = uid();

      const assetPaths = new Set();
      try {
        const baseDir = chosenDir;
        const regex = /(?:src|href)\s*=\s*["']([^"']+)["']/ig;
        let m;
        while ((m = regex.exec(indexHtml)) !== null) {
          const rawRef = m[1].trim();
          const normalized = normalizeRelativePath(baseDir, rawRef);
          if (normalized) assetPaths.add(normalized);
        }
        const dataRegex = /data-(?:src|main|file)\s*=\s*["']([^"']+)["']/ig;
        while ((m = dataRegex.exec(indexHtml)) !== null) {
          const normalized = normalizeRelativePath(baseDir, m[1].trim());
          if (normalized) assetPaths.add(normalized);
        }
      } catch (e) {}

      await dbPut(FILE_STORE, { type: 'text/html', data: new TextEncoder().encode(indexHtml).buffer }, `${id}/index.html`);

      let fetchedCount = 0;
      for (const ap of assetPaths) {
        const rawUrl = rawUrlFor(owner, repo, branch, (chosenDir ? chosenDir + '/' : '') + ap);
        try {
          const fetched = await fetchTextOrArrayBuffer(rawUrl);
          if (fetched) {
            let dataBuf;
            let ctype = fetched.contentType || guessContentTypeFromPath(ap);
            if (fetched.isText) {
              dataBuf = new TextEncoder().encode(fetched.data).buffer;
            } else {
              dataBuf = fetched.data;
            }
            await dbPut(FILE_STORE, { type: ctype, data: dataBuf }, `${id}/${ap}`);
            fetchedCount++;
          }
        } catch (_) {}
      }

      const meta = { id, name: (owner + '/' + repo + (chosenDir ? '/' + chosenDir : '')), addedAt: Date.now(), github: { owner, repo, branch, root: chosenDir } };
      await dbPut(META_STORE, meta);

      await _saveCloud(id, indexHtml);

      _renderMyGames();
      _showPgToast(`Imported "${meta.name}" (${fetchedCount} assets).`, 3500);
    } catch (e) {
      console.error('[personal-games] GitHub import failed', e);
      _showPgToast('Import failed. See console for details.', 4000);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Import from GitHub';
    }
  }

  document.getElementById('pg-github-import').addEventListener('click', () => {
    const url = document.getElementById('pg-github-url').value.trim();
    if (!url) { _showPgToast('Enter a GitHub URL first.', 2000); return; }
    importFromGitHubUrl(url);
  });

})();
