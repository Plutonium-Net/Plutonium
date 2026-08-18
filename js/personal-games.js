(function () {
  'use strict';

  const DB_NAME    = 'plutonium_personal_games';
  const DB_VERSION = 1;
  const FILE_STORE = 'pg_files';
  const META_STORE = 'pg_meta';

  const CLOUD_META = 'personal_games/meta';
  const CLOUD_FILE = id => `pg_files/${id}`;

  const MAX_BYTES = 1 * 1024 * 1024;

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

      req.onsuccess = e => {
        _db = e.target.result;
        resolve(_db);
      };

      req.onerror = e => reject(e.target.error);
    });
  }

  function dbGet(store, key) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const req = db
        .transaction(store, 'readonly')
        .objectStore(store)
        .get(key);

      req.onsuccess = e => resolve(e.target.result);
      req.onerror = e => reject(e.target.error);
    }));
  }

  function dbPut(store, value, key) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');

      const req = key !== undefined
        ? tx.objectStore(store).put(value, key)
        : tx.objectStore(store).put(value);

      req.onsuccess = () => resolve();
      req.onerror = e => reject(e.target.error);
    }));
  }

  function dbDelete(store, key) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const req = db
        .transaction(store, 'readwrite')
        .objectStore(store)
        .delete(key);

      req.onsuccess = () => resolve();
      req.onerror = e => reject(e.target.error);
    }));
  }

  function dbGetAll(store) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const req = db
        .transaction(store, 'readonly')
        .objectStore(store)
        .getAll();

      req.onsuccess = e => resolve(e.target.result);
      req.onerror = e => reject(e.target.error);
    }));
  }

  function dbDeleteGameFiles(id) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const range = IDBKeyRange.bound(`${id}/`, `${id}/\uffff`);

      const tx = db.transaction(FILE_STORE, 'readwrite');

      const req = tx
        .objectStore(FILE_STORE)
        .delete(range);

      req.onsuccess = () => resolve();
      req.onerror = e => reject(e.target.error);
    }));
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/pg-sw.js', { scope: '/' }).catch(err => {
      console.warn('[personal-games] SW registration failed:', err);
    });
  }

  function uid() {
    return 'pg_' +
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 7);
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();

      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error);

      fr.readAsText(file);
    });
  }

  const _overlay = document.getElementById('pg-modal-overlay');

  const _modals = {
    file: document.getElementById('pg-modal-file'),
    edit: document.getElementById('pg-modal-edit')
  };

  function openModal(name) {
    _overlay.classList.add('active');
    _modals[name].classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeModal(name) {
    _overlay.classList.remove('active');

    Object.values(_modals).forEach(m => {
      m.classList.remove('active');
    });

    document.body.style.overflow = '';

    if (name) {
      _resetModal(name);
    }
  }

  function _resetModal(name) {
    if (name === 'file') {
      document.getElementById('pg-file-input').value = '';
      document.getElementById('pg-file-name').value = '';

      document.getElementById('pg-file-drop')
        .classList.remove('has-file');

      document.getElementById('pg-file-drop-label').textContent =
        'Click or drag an HTML file here';

      _pendingFileUpload = null;

      const picker = document.getElementById('pg-github-picker');

      if (picker) {
        picker.innerHTML = '';
        picker.style.display = 'none';
      }

      const importBtn = document.getElementById('pg-github-import');

      if (importBtn) {
        importBtn.disabled = false;
        importBtn.textContent = 'Import from GitHub';
      }
    }
  }

  _overlay.addEventListener('click', e => {
    if (e.target === _overlay) {
      closeModal();
    }
  });

  document.querySelectorAll('.pg-modal__close').forEach(btn => {
    btn.addEventListener('click', () => closeModal());
  });

  /* ============================================================
     LOCAL HTML FILE IMPORT
     ============================================================ */

  let _pendingFileUpload = null;

  const fileInput = document.getElementById('pg-file-input');
  const fileDrop = document.getElementById('pg-file-drop');
  const fileDropLbl = document.getElementById('pg-file-drop-label');

  function _handleFileSelection(file) {
    if (!file || !file.name.match(/\.html?$/i)) {
      _showPgToast('Please select an HTML file.', 2500);
      return;
    }

    if (file.size > MAX_BYTES) {
      _showPgToast(
        `File is too large (${(file.size / 1024 / 1024).toFixed(2)} MiB). Maximum is 1 MiB.`,
        4000
      );
      return;
    }

    _pendingFileUpload = file;

    fileDrop.classList.add('has-file');

    fileDropLbl.textContent =
      `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;

    if (!document.getElementById('pg-file-name').value) {
      document.getElementById('pg-file-name').value =
        file.name.replace(/\.html?$/i, '');
    }
  }

  fileInput.addEventListener('change', () => {
    _handleFileSelection(fileInput.files[0]);
  });

  fileDrop.addEventListener('click', () => fileInput.click());

  fileDrop.addEventListener('dragover', e => {
    e.preventDefault();
    fileDrop.classList.add('drag-over');
  });

  fileDrop.addEventListener('dragleave', () => {
    fileDrop.classList.remove('drag-over');
  });

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

    const rawName =
      document.getElementById('pg-file-name').value.trim();

    const name =
      rawName ||
      _pendingFileUpload.name.replace(/\.html?$/i, '');

    const btn = document.getElementById('pg-file-save');

    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      const id = uid();

      const html =
        await readFileAsText(_pendingFileUpload);

      const enc =
        new TextEncoder().encode(html);

      await dbPut(
        FILE_STORE,
        {
          type: 'text/html',
          data: enc.buffer
        },
        `${id}/index.html`
      );

      const meta = {
        id,
        name,
        addedAt: Date.now()
      };

      await dbPut(META_STORE, meta);

      closeModal('file');

      _renderMyGames();

      _saveCloud(id, html);

      _showPgToast(`"${name}" added!`, 2500);

    } catch (e) {
      console.error('[personal-games] save failed:', e);

      _showPgToast(
        'Failed to save game.',
        3000
      );

    } finally {
      btn.disabled = false;
      btn.textContent = 'Add Game';
    }
  });

  /* ============================================================
     EDIT GAME
     ============================================================ */

  let _editingId = null;

  async function _openEdit(meta) {
    _editingId = meta.id;

    document.getElementById('pg-edit-name').value =
      meta.name || '';

    openModal('edit');
  }

  document.getElementById('pg-edit-save').addEventListener('click', async () => {
    if (!_editingId) return;

    const name =
      document.getElementById('pg-edit-name').value.trim();

    const btn =
      document.getElementById('pg-edit-save');

    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      const meta =
        await dbGet(META_STORE, _editingId);

      if (!meta) {
        throw new Error('not found');
      }

      if (name) {
        meta.name = name;
      }

      await dbPut(META_STORE, meta);

      closeModal('edit');

      _renderMyGames();

      _saveCloud();

      _showPgToast(
        `"${meta.name}" updated.`,
        2000
      );

    } catch (e) {
      _showPgToast(
        'Failed to update game.',
        3000
      );

    } finally {
      btn.disabled = false;
      btn.textContent = 'Save';
      _editingId = null;
    }
  });

  /* ============================================================
     DELETE GAME
     ============================================================ */

  async function _deleteGame(meta) {
    try {
      await dbDeleteGameFiles(meta.id);

      await dbDelete(
        META_STORE,
        meta.id
      );

      _renderMyGames();

      _saveCloud();

      if (
        typeof PlutoniumStore !== 'undefined' &&
        PlutoniumStore.currentUser
      ) {
        PlutoniumStore
          .deleteDoc(CLOUD_FILE(meta.id))
          .catch(() => {});
      }

      _showPgToast(
        `"${meta.name}" deleted.`,
        2000
      );

    } catch (e) {
      _showPgToast(
        'Failed to delete game.',
        3000
      );
    }
  }

  /* ============================================================
     LAUNCH PERSONAL GAME
     ============================================================ */

  async function _launchPersonalGame(meta) {
    const fileKey =
      `${meta.id}/index.html`;

    const existing =
      await dbGet(FILE_STORE, fileKey).catch(() => null);

    if (!existing) {
      if (
        typeof PlutoniumStore === 'undefined' ||
        !PlutoniumStore.currentUser
      ) {
        _showPgToast(
          'Sign in to download this game.',
          3000
        );

        return;
      }

      _showPgToast(
        'Downloading game…',
        2000
      );

      try {
        const fileDoc =
          await PlutoniumStore.getDoc(
            CLOUD_FILE(meta.id)
          );

        if (!fileDoc?.html) {
          _showPgToast(
            'Game file not found in cloud.',
            3000
          );

          return;
        }

        const enc =
          new TextEncoder().encode(fileDoc.html);

        await dbPut(
          FILE_STORE,
          {
            type: 'text/html',
            data: enc.buffer
          },
          fileKey
        );

      } catch (e) {
        _showPgToast(
          'Failed to download game.',
          3000
        );

        return;
      }
    }

    const url =
      `/pg-game/${meta.id}/index.html`;

    if (window.PGViewer) {
      window.PGViewer.open(
        url,
        meta.name,
        {
          id: meta.id,
          name: meta.name,
          personal: true
        }
      );
    } else {
      window.open(
        url,
        '_blank'
      );
    }
  }

  /* ============================================================
     PERSONAL GAME CARD
     ============================================================ */

  function _buildPersonalCard(meta) {
    const card =
      document.createElement('div');

    card.className =
      'pgcdn-card pg-personal-card';

    card.title =
      meta.name;

    card.innerHTML = `
      <div class="pgcdn-card__img pg-no-art">
        <i class="fa-solid fa-file-code"></i>
      </div>

      <div class="pgcdn-card__name">
        ${escapeHtml(meta.name)}
      </div>

      <button
        class="pg-card-more"
        title="Options"
        aria-label="Options"
      >
        <i class="fa-solid fa-ellipsis-vertical"></i>
      </button>
    `;

    card.addEventListener(
      'click',
      () => _launchPersonalGame(meta)
    );

    card.querySelector('.pg-card-more')
      .addEventListener('click', e => {
        e.stopPropagation();

        _showCtxMenu(e, [
          {
            icon: 'fa-solid fa-play',
            label: 'Play',
            action: () =>
              _launchPersonalGame(meta)
          },

          {
            icon: 'fa-solid fa-pencil',
            label: 'Edit details',
            action: () =>
              _openEdit(meta)
          },

          'sep',

          {
            icon: 'fa-solid fa-trash',
            label: 'Delete',
            danger: true,
            action: () =>
              _confirmDelete(meta)
          }
        ]);
      });

    return card;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /* ============================================================
     CONTEXT MENU
     ============================================================ */

  function _showCtxMenu(e, items) {
    const ctxMenu =
      document.getElementById('pgcdn-ctx-menu');

    if (!ctxMenu) return;

    e.preventDefault();

    ctxMenu.innerHTML = '';

    items.forEach(item => {
      if (item === 'sep') {
        const sep =
          document.createElement('div');

        sep.className =
          'ctx-sep';

        ctxMenu.appendChild(sep);

        return;
      }

      const el =
        document.createElement('div');

      el.className =
        'ctx-item' +
        (item.danger
          ? ' ctx-item--danger'
          : '');

      el.innerHTML =
        `<i class="${item.icon}"></i>${item.label}`;

      el.addEventListener('click', () => {
        ctxMenu.classList.add('hidden');
        item.action();
      });

      ctxMenu.appendChild(el);
    });

    ctxMenu.classList.remove('hidden');

    const mw = ctxMenu.offsetWidth;
    const mh = ctxMenu.offsetHeight;

    let x = e.clientX;
    let y = e.clientY;

    if (x + mw > window.innerWidth - 8) {
      x = window.innerWidth - mw - 8;
    }

    if (y + mh > window.innerHeight - 8) {
      y = window.innerHeight - mh - 8;
    }

    ctxMenu.style.left =
      x + 'px';

    ctxMenu.style.top =
      y + 'px';

    const dismiss = () =>
      ctxMenu.classList.add('hidden');

    setTimeout(() => {
      document.addEventListener(
        'click',
        dismiss,
        { once: true }
      );

      document.addEventListener(
        'scroll',
        dismiss,
        {
          once: true,
          capture: true
        }
      );
    }, 0);
  }

  function _confirmDelete(meta) {
    _showPgToast(
      `Delete "${meta.name}"?`,
      [
        {
          label: 'Cancel',
          action: () => {}
        },

        {
          label: 'Delete',
          danger: true,
          action: () =>
            _deleteGame(meta)
        }
      ]
    );
  }

  /* ============================================================
     CLOUD SYNC
     ============================================================ */

  const _cloudBadge =
    document.getElementById('pg-cloud-badge');

  function _setBadge(state) {
    if (!_cloudBadge) return;

    if (state === 'saving') {
      _cloudBadge.textContent =
        '↑ Saving…';

      _cloudBadge.className =
        'pg-cloud-badge pg-cloud-badge--saving';

    } else if (state === 'syncing') {
      _cloudBadge.textContent =
        '↓ Syncing…';

      _cloudBadge.className =
        'pg-cloud-badge pg-cloud-badge--saving';

    } else if (state === true) {
      _cloudBadge.textContent =
        '✓ Synced';

      _cloudBadge.className =
        'pg-cloud-badge pg-cloud-badge--ok';

    } else if (state === 'error') {
      _cloudBadge.textContent =
        '⚠ Sync failed';

      _cloudBadge.className =
        'pg-cloud-badge pg-cloud-badge--error';

    } else {
      _cloudBadge.textContent = '';

      _cloudBadge.className =
        'pg-cloud-badge';
    }
  }

  async function _saveCloud(newId, newHtml) {
    if (
      typeof PlutoniumStore === 'undefined' ||
      !PlutoniumStore.currentUser
    ) {
      return;
    }

    _setBadge('saving');

    try {
      const games =
        await dbGetAll(META_STORE)
          .catch(() => []);

      const serializable =
        games.map(
          ({ id, name, addedAt, github }) => ({
            id,
            name,
            addedAt,
            github
          })
        );

      await PlutoniumStore.setDoc(
        CLOUD_META,
        {
          games: serializable
        }
      );

      if (
        newId &&
        newHtml != null
      ) {
        await PlutoniumStore.setDoc(
          CLOUD_FILE(newId),
          {
            html: newHtml
          }
        );
      }

      _setBadge(true);

    } catch (e) {
      console.warn(
        '[personal-games] cloud save failed:',
        e.message
      );

      _setBadge('error');
    }
  }

  async function _loadCloud() {
    if (
      typeof PlutoniumStore === 'undefined' ||
      !PlutoniumStore.currentUser
    ) {
      return;
    }

    _setBadge('syncing');

    try {
      const doc =
        await PlutoniumStore
          .getDoc(CLOUD_META)
          .catch(() => null);

      if (
        !doc ||
        !Array.isArray(doc.games)
      ) {
        _setBadge(true);
        return;
      }

      const localGames =
        await dbGetAll(META_STORE)
          .catch(() => []);

      const localIds =
        new Set(
          localGames.map(g => g.id)
        );

      const missing =
        doc.games.filter(
          g => !localIds.has(g.id)
        );

      for (const g of missing) {
        await dbPut(
          META_STORE,
          {
            id: g.id,
            name: g.name,
            addedAt: g.addedAt,
            github: g.github || undefined
          }
        );
      }

      let downloaded = 0;

      for (const g of doc.games) {
        const fileKey =
          `${g.id}/index.html`;

        const existing =
          await dbGet(
            FILE_STORE,
            fileKey
          ).catch(() => null);

        if (existing) continue;

        try {
          const fileDoc =
            await PlutoniumStore.getDoc(
              CLOUD_FILE(g.id)
            );

          if (!fileDoc?.html) continue;

          const enc =
            new TextEncoder().encode(
              fileDoc.html
            );

          await dbPut(
            FILE_STORE,
            {
              type: 'text/html',
              data: enc.buffer
            },
            fileKey
          );

          downloaded++;

        } catch (_) {}
      }

      if (
        missing.length > 0 ||
        downloaded > 0
      ) {
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
      console.warn(
        '[personal-games] cloud load failed:',
        e.message
      );

      _setBadge('error');
    }
  }

  if (
    typeof PlutoniumStore !== 'undefined'
  ) {
    PlutoniumStore.onAuthChange(user => {
      if (user) {
        _loadCloud();
      } else {
        _setBadge(null);
      }
    });
  }

  /* ============================================================
     RENDER PERSONAL GAMES
     ============================================================ */

  async function _renderMyGames() {
    const grid =
      document.getElementById(
        'pg-personal-grid'
      );

    const empty =
      document.getElementById(
        'pg-personal-empty'
      );

    const count =
      document.getElementById(
        'pg-personal-count'
      );

    if (!grid) return;

    let games;

    try {
      games =
        await dbGetAll(META_STORE);
    } catch (e) {
      games = [];
    }

    games.sort(
      (a, b) =>
        b.addedAt - a.addedAt
    );

    count.textContent =
      games.length
        ? `${games.length} game${games.length !== 1 ? 's' : ''}`
        : '';

    grid.innerHTML = '';

    if (!games.length) {
      empty.style.display = '';
    } else {
      empty.style.display = 'none';

      games.forEach(meta => {
        grid.appendChild(
          _buildPersonalCard(meta)
        );
      });
    }
  }

  /* ============================================================
     TOAST
     ============================================================ */

  const _pgToast =
    document.getElementById(
      'pgcdn-toast'
    );

  const _pgToastMsg =
    document.getElementById(
      'pgcdn-toast-msg'
    );

  const _pgToastActs =
    document.getElementById(
      'pgcdn-toast-actions'
    );

  let _pgToastTimer = null;

  function _showPgToast(
    msg,
    actionsOrDuration,
    autoDismiss = 0
  ) {
    clearTimeout(
      _pgToastTimer
    );

    _pgToastMsg.textContent =
      msg;

    _pgToastActs.innerHTML =
      '';

    const actions =
      Array.isArray(actionsOrDuration)
        ? actionsOrDuration
        : [];

    const dismiss =
      typeof actionsOrDuration === 'number'
        ? actionsOrDuration
        : autoDismiss;

    actions.forEach(a => {
      const btn =
        document.createElement(
          'button'
        );

      btn.className =
        'toast-btn' +
        (a.danger
          ? ' toast-btn--danger'
          : '');

      btn.textContent =
        a.label;

      btn.addEventListener(
        'click',
        () => {
          _pgToast.classList.remove(
            'toast-visible'
          );

          clearTimeout(
            _pgToastTimer
          );

          a.action();
        }
      );

      _pgToastActs.appendChild(
        btn
      );
    });

    _pgToast.classList.add(
      'toast-visible'
    );

    if (dismiss > 0) {
      _pgToastTimer =
        setTimeout(
          () =>
            _pgToast.classList.remove(
              'toast-visible'
            ),
          dismiss
        );
    }
  }

  document
    .getElementById('pg-add-file-btn')
    .addEventListener(
      'click',
      () => openModal('file')
    );

  _renderMyGames();

  /* ============================================================
     GITHUB IMPORT
     ============================================================ */

  function parseGitHubUrl(input) {
    try {
      const u =
        new URL(input.trim());

      if (
        !/github\.com$/i.test(
          u.hostname
        )
      ) {
        return null;
      }

      const parts =
        u.pathname
          .replace(/^\/+|\/+$/g, '')
          .split('/');

      if (parts.length < 2) {
        return null;
      }

      const owner =
        parts[0];

      const repo =
        parts[1];

      let branch = null;
      let path = '';

      if (
        parts[2] === 'tree' ||
        parts[2] === 'blob'
      ) {
        branch =
          parts[3];

        path =
          parts
            .slice(4)
            .join('/');
      }

      return {
        owner,
        repo,
        branch,
        path
      };

    } catch (e) {
      return null;
    }
  }

  async function getDefaultBranch(
    owner,
    repo
  ) {
    try {
      const r =
        await fetch(
          `https://api.github.com/repos/${owner}/${repo}`
        );

      if (!r.ok) {
        throw new Error(
          'repo not found'
        );
      }

      const json =
        await r.json();

      return (
        json.default_branch ||
        'main'
      );

    } catch (e) {
      return 'main';
    }
  }

  function rawUrlFor(
    owner,
    repo,
    branch,
    relPath
  ) {
    return (
      `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${relPath}`
    );
  }

  function guessContentTypeFromPath(path) {
    const ext =
      (
        path
          .split('.')
          .pop() || ''
      ).toLowerCase();

    switch (ext) {
      case 'html':
      case 'htm':
        return 'text/html';

      case 'js':
      case 'mjs':
        return 'application/javascript';

      case 'css':
        return 'text/css';

      case 'json':
        return 'application/json';

      case 'png':
        return 'image/png';

      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';

      case 'gif':
        return 'image/gif';

      case 'svg':
        return 'image/svg+xml';

      case 'webp':
        return 'image/webp';

      case 'wav':
        return 'audio/wav';

      case 'mp3':
        return 'audio/mpeg';

      case 'ogg':
        return 'audio/ogg';

      default:
        return 'application/octet-stream';
    }
  }

  async function fetchTextOrArrayBuffer(url) {
    const r =
      await fetch(url);

    if (!r.ok) {
      throw new Error(
        'fetch failed: ' +
        r.status
      );
    }

    const ct =
      r.headers.get(
        'content-type'
      ) || '';

    if (
      /^(text\/)/i.test(ct) ||
      /\.(html?|css|js|json|svg)$/i.test(url)
    ) {
      return {
        data: await r.text(),
        isText: true,
        contentType:
          ct || 'text/plain'
      };
    }

    return {
      data: await r.arrayBuffer(),
      isText: false,
      contentType:
        ct ||
        guessContentTypeFromPath(url)
    };
  }

  function normalizeRelativePath(
    basePath,
    relative
  ) {
    if (
      /^(https?:)?\/\//i.test(
        relative
      )
    ) {
      return null;
    }

    relative =
      relative
        .split('#')[0]
        .split('?')[0];

    if (
      relative.startsWith('/')
    ) {
      relative =
        relative.slice(1);
    }

    if (!basePath) {
      return relative;
    }

    const combined =
      basePath +
      '/' +
      relative;

    const parts =
      combined.split('/');

    const stack = [];

    for (const p of parts) {
      if (
        p === '' ||
        p === '.'
      ) {
        continue;
      }

      if (p === '..') {
        stack.pop();
      } else {
        stack.push(p);
      }
    }

    return stack.join('/');
  }

  /*
   * Finds every directory in the repository containing
   * an index.html.
   */
  async function findGitHubGames(
    owner,
    repo,
    branch,
    rootPath
  ) {
    const treesUrl =
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;

    const resp =
      await fetch(treesUrl);

    if (!resp.ok) {
      throw new Error(
        `GitHub tree request failed: ${resp.status}`
      );
    }

    const json =
      await resp.json();

    if (
      !Array.isArray(json.tree)
    ) {
      throw new Error(
        'GitHub repository tree unavailable.'
      );
    }

    const indexes =
      json.tree.filter(entry => {
        if (
          entry.type !== 'blob'
        ) {
          return false;
        }

        if (
          !/(^|\/)index\.html?$/i.test(
            entry.path
          )
        ) {
          return false;
        }

        if (
          rootPath &&
          !(
            entry.path ===
              `${rootPath}/index.html` ||
            entry.path.startsWith(
              `${rootPath}/`
            )
          )
        ) {
          return false;
        }

        return true;
      });

    const games =
      indexes.map(entry => {
        const indexPath =
          entry.path;

        const dir =
          indexPath
            .split('/')
            .slice(0, -1)
            .join('/');

        const name =
          dir
            ? dir.split('/').pop()
            : repo;

        return {
          name,
          path: dir,
          indexPath
        };
      });

    games.sort(
      (a, b) =>
        a.path.localeCompare(
          b.path
        )
    );

    return games;
  }

  function showGitHubPicker(
    games,
    githubInfo
  ) {
    const picker =
      document.getElementById(
        'pg-github-picker'
      );

    if (!picker) return;

    picker.innerHTML = '';

    if (!games.length) {
      picker.innerHTML = `
        <div class="pg-github-empty">
          <i class="fa-solid fa-folder-open"></i>
          <span>No folders containing index.html were found.</span>
        </div>
      `;

      picker.style.display =
        '';

      return;
    }

    const header =
      document.createElement('div');

    header.className =
      'pg-github-picker__header';

    header.innerHTML = `
      <div>
        <strong>${games.length} game${games.length !== 1 ? 's' : ''} found</strong>
        <span>${escapeHtml(githubInfo.owner)}/${escapeHtml(githubInfo.repo)}</span>
      </div>

      <div class="pg-github-picker__actions">
        <button type="button" id="pg-github-select-all">
          Select All
        </button>

        <button type="button" id="pg-github-select-none">
          Deselect All
        </button>
      </div>
    `;

    picker.appendChild(header);

    const list =
      document.createElement('div');

    list.className =
      'pg-github-picker__list';

    games.forEach((game, index) => {
      const label =
        document.createElement('label');

      label.className =
        'pg-github-game';

      label.innerHTML = `
        <input
          type="checkbox"
          class="pg-github-game__checkbox"
          data-index="${index}"
          checked
        >

        <span class="pg-github-game__check">
          <i class="fa-solid fa-check"></i>
        </span>

        <span class="pg-github-game__info">
          <strong>${escapeHtml(game.name)}</strong>
          <small>${escapeHtml(game.path || '/')}</small>
        </span>
      `;

      list.appendChild(label);
    });

    picker.appendChild(list);

    const footer =
      document.createElement('div');

    footer.className =
      'pg-github-picker__footer';

    footer.innerHTML = `
      <button
        type="button"
        class="pg-btn pg-btn--primary"
        id="pg-github-import-selected"
      >
        <i class="fa-solid fa-download"></i>
        Import Selected
      </button>
    `;

    picker.appendChild(footer);

    picker.style.display =
      '';

    document
      .getElementById(
        'pg-github-select-all'
      )
      .addEventListener(
        'click',
        () => {
          picker
            .querySelectorAll(
              '.pg-github-game__checkbox'
            )
            .forEach(cb => {
              cb.checked = true;
            });
        }
      );

    document
      .getElementById(
        'pg-github-select-none'
      )
      .addEventListener(
        'click',
        () => {
          picker
            .querySelectorAll(
              '.pg-github-game__checkbox'
            )
            .forEach(cb => {
              cb.checked = false;
            });
        }
      );

    document
      .getElementById(
        'pg-github-import-selected'
      )
      .addEventListener(
        'click',
        () => {
          const selected =
            [...picker.querySelectorAll(
              '.pg-github-game__checkbox:checked'
            )]
              .map(cb =>
                games[
                  Number(
                    cb.dataset.index
                  )
                ]
              );

          if (!selected.length) {
            _showPgToast(
              'Select at least one game.',
              2500
            );

            return;
          }

          importSelectedGitHubGames(
            selected,
            githubInfo
          );
        }
      );
  }

  async function importSelectedGitHubGames(
    games,
    githubInfo
  ) {
    const btn =
      document.getElementById(
        'pg-github-import-selected'
      );

    if (btn) {
      btn.disabled = true;
      btn.innerHTML =
        '<i class="fa-solid fa-spinner fa-spin"></i> Importing…';
    }

    let imported = 0;
    let failed = 0;

    try {
      for (
        let i = 0;
        i < games.length;
        i++
      ) {
        const game =
          games[i];

        if (btn) {
          btn.innerHTML =
            `<i class="fa-solid fa-spinner fa-spin"></i> Importing ${i + 1}/${games.length}…`;
        }

        try {
          await importSingleGitHubGame(
            game,
            githubInfo
          );

          imported++;

        } catch (e) {
          console.warn(
            '[personal-games] Failed to import',
            game.path,
            e
          );

          failed++;
        }
      }

      await _renderMyGames();

      if (imported > 0) {
        closeModal('file');

        _showPgToast(
          `${imported} game${imported !== 1 ? 's' : ''} imported${failed ? `, ${failed} failed` : ''}.`,
          4000
        );
      } else {
        _showPgToast(
          'No games were imported.',
          3000
        );
      }

    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML =
          '<i class="fa-solid fa-download"></i> Import Selected';
      }
    }
  }

  async function importSingleGitHubGame(
    game,
    githubInfo
  ) {
    const {
      owner,
      repo,
      branch
    } = githubInfo;

    const id =
      uid();

    const indexUrl =
      rawUrlFor(
        owner,
        repo,
        branch,
        game.indexPath
      );

    const fetchedIndex =
      await fetchTextOrArrayBuffer(
        indexUrl
      );

    if (
      !fetchedIndex ||
      !fetchedIndex.isText
    ) {
      throw new Error(
        'index.html could not be loaded'
      );
    }

    const indexHtml =
      fetchedIndex.data;

    /*
     * Find local assets referenced by index.html.
     */
    const assetPaths =
      new Set();

    const regex =
      /(?:src|href)\s*=\s*["']([^"']+)["']/ig;

    let m;

    while (
      (m = regex.exec(indexHtml)) !== null
    ) {
      const rawRef =
        m[1].trim();

      const normalized =
        normalizeRelativePath(
          game.path,
          rawRef
        );

      if (normalized) {
        assetPaths.add(
          normalized
        );
      }
    }

    const dataRegex =
      /data-(?:src|main|file)\s*=\s*["']([^"']+)["']/ig;

    while (
      (m = dataRegex.exec(indexHtml)) !== null
    ) {
      const normalized =
        normalizeRelativePath(
          game.path,
          m[1].trim()
        );

      if (normalized) {
        assetPaths.add(
          normalized
        );
      }
    }

    /*
     * Store index.html locally.
     */
    await dbPut(
      FILE_STORE,
      {
        type: 'text/html',
        data:
          new TextEncoder()
            .encode(indexHtml)
            .buffer
      },
      `${id}/index.html`
    );

    /*
     * Download referenced assets.
     */
    let fetchedCount = 0;

    for (
      const assetPath of assetPaths
    ) {
      const rawUrl =
        rawUrlFor(
          owner,
          repo,
          branch,
          assetPath
        );

      try {
        const fetched =
          await fetchTextOrArrayBuffer(
            rawUrl
          );

        if (!fetched) {
          continue;
        }

        let dataBuf;

        const ctype =
          fetched.contentType ||
          guessContentTypeFromPath(
            assetPath
          );

        if (fetched.isText) {
          dataBuf =
            new TextEncoder()
              .encode(
                fetched.data
              )
              .buffer;
        } else {
          dataBuf =
            fetched.data;
        }

        await dbPut(
          FILE_STORE,
          {
            type: ctype,
            data: dataBuf
          },
          `${id}/${assetPath}`
        );

        fetchedCount++;

      } catch (_) {
        /*
         * If an asset cannot be downloaded now,
         * the service worker can try GitHub later.
         */
      }
    }

    /*
     * Store GitHub information with the game.
     *
     * This is important because pg-sw.js can use this
     * information to download assets that weren't cached.
     */
    const meta = {
      id,
      name: game.name,
      addedAt: Date.now(),

      github: {
        owner,
        repo,
        branch,
        root: game.path
      }
    };

    await dbPut(
      META_STORE,
      meta
    );

    /*
     * Save index.html to cloud.
     */
    await _saveCloud(
      id,
      indexHtml
    );

    console.log(
      `[personal-games] Imported "${game.name}" (${fetchedCount} assets)`
    );
  }

  /*
   * Clicking the main GitHub button now scans the repository
   * instead of immediately importing the first index.html.
   */
  document
    .getElementById(
      'pg-github-import'
    )
    .addEventListener(
      'click',
      async () => {
        const input =
          document
            .getElementById(
              'pg-github-url'
            )
            .value.trim();

        if (!input) {
          _showPgToast(
            'Enter a GitHub URL first.',
            2000
          );

          return;
        }

        const parsed =
          parseGitHubUrl(input);

        if (!parsed) {
          _showPgToast(
            'Invalid GitHub URL.',
            3000
          );

          return;
        }

        const btn =
          document.getElementById(
            'pg-github-import'
          );

        const picker =
          document.getElementById(
            'pg-github-picker'
          );

        btn.disabled = true;
        btn.innerHTML =
          '<i class="fa-solid fa-spinner fa-spin"></i> Scanning repository…';

        if (picker) {
          picker.style.display =
            'none';

          picker.innerHTML =
            '';
        }

        try {
          let branch =
            parsed.branch;

          if (!branch) {
            branch =
              await getDefaultBranch(
                parsed.owner,
                parsed.repo
              );
          }

          const githubInfo = {
            owner: parsed.owner,
            repo: parsed.repo,
            branch,
            root: parsed.path || ''
          };

          const games =
            await findGitHubGames(
              parsed.owner,
              parsed.repo,
              branch,
              parsed.path || ''
            );

          showGitHubPicker(
            games,
            githubInfo
          );

          if (!games.length) {
            _showPgToast(
              'No games with index.html were found.',
              3000
            );
          }

        } catch (e) {
          console.error(
            '[personal-games] GitHub scan failed:',
            e
          );

          _showPgToast(
            'Failed to scan GitHub repository.',
            4000
          );

        } finally {
          btn.disabled = false;
          btn.innerHTML =
            '<i class="fa-solid fa-magnifying-glass"></i> Scan GitHub';
        }
      }
    );

})();
