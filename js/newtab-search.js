(function () {
  'use strict';

  var input = document.getElementById('newtab-search');
  var box = document.getElementById('search-suggest');
  if (!input || !box) return;

  var APPS = [
    { key: 'games', name: 'Games',        icon: 'fa-gamepad',      desc: 'Play hundreds of browser games instantly' },
    { key: 'ai',    name: 'AI',           icon: 'fa-robot',        desc: 'Chat with Stelena AI' },
    { key: 'cloud', name: 'Cloud Gaming', icon: 'fa-cloud',        desc: 'Stream high-end games from the cloud' },
    { key: 'media', name: 'Media',        icon: 'fa-film',         desc: 'Movies, TV and anime' },
    { key: 'vms',   name: 'VMs',          icon: 'fa-server',       desc: 'Remote virtual machines' },
  ];

  var COMMANDS = [
    { cmd: '/g',     icon: 'fa-gamepad', usage: '/g <query>: search games',                          desc: 'search games' },
    { cmd: '/cg',    icon: 'fa-cloud',   usage: '/cg <query>: search cloud games',                    desc: 'search cloud games' },
    { cmd: '/ai',    icon: 'fa-robot',   usage: '/ai <query>: start an AI chat',                      desc: 'start an AI chat' },
    { cmd: '/watch', icon: 'fa-film',    usage: '/watch movies|anime|tv <query>: find something to watch', desc: 'find something to watch' },
    { cmd: '/vm',    icon: 'fa-server',  usage: '/vm: launch a virtual machine',                      desc: 'launch a virtual machine' },
  ];

  var gamesCache = null;
  var gamesFetch = null;
  function loadGames() {
    if (gamesCache) return Promise.resolve(gamesCache);
    if (gamesFetch) return gamesFetch;
    if (typeof _fetchPgcdnGames === 'function') {
      gamesFetch = _fetchPgcdnGames()
        .then(g => { gamesCache = g || []; return gamesCache; })
        .catch(() => { gamesCache = []; return gamesCache; });
    } else {
      gamesCache = [];
      gamesFetch = Promise.resolve(gamesCache);
    }
    return gamesFetch;
  }

  var bookmarksCache = null;
  var bookmarksFetch = null;
  function loadBookmarks() {
    if (bookmarksCache) return Promise.resolve(bookmarksCache);
    if (bookmarksFetch) return bookmarksFetch;
    bookmarksFetch = Promise.resolve()
      .then(() => (window.Bookmarks && typeof window.Bookmarks.getAll === 'function') ? (window.Bookmarks.getAll() || []) : [])
      .then(b => { bookmarksCache = b; return bookmarksCache; })
      .catch(() => { bookmarksCache = []; return bookmarksCache; });
    return bookmarksFetch;
  }

  var suggestCache = {};
  function loadSuggestions(q) {
    var key = q.toLowerCase();
    if (suggestCache[key]) return suggestCache[key];
    var target = 'https://suggestqueries.google.com/complete/search?client=firefox&q=' + encodeURIComponent(q);
    var url = target;
    if (typeof __uv$config !== 'undefined' && __uv$config.prefix && typeof __uv$config.encodeUrl === 'function') {
      url = __uv$config.prefix + __uv$config.encodeUrl(target);
    }
    suggestCache[key] = fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) { return (data && Array.isArray(data[1])) ? data[1] : []; })
      .catch(function () { return []; });
    return suggestCache[key];
  }

  var cloudCache = null;
  var cloudFetch = null;
  function loadCloud() {
    if (cloudCache) return Promise.resolve(cloudCache);
    if (cloudFetch) return cloudFetch;
    cloudFetch = fetch('data/cloud.json')
      .then(function (r) { return r.json(); })
      .then(function (g) { cloudCache = g || []; return cloudCache; })
      .catch(function () { cloudCache = []; return cloudCache; });
    return cloudFetch;
  }

  var rows = [];
  var activeIdx = -1;
  var debounce = null;

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  var openTimer = null;
  var enterTimer = null;

  function show() {
    clearTimeout(openTimer);
    var page = document.getElementById('new-tab-page');
    if (page) page.classList.add('search-suggest-open');
    var wasHidden = box.hidden;
    box.hidden = false;
    if (wasHidden) {
      box.classList.add('ss-entering');
      clearTimeout(enterTimer);
      enterTimer = setTimeout(function () { box.classList.remove('ss-entering'); }, 600);
      void box.offsetHeight;
    }
    box.classList.add('ss-open');
  }
  function hide() {
    if (box.hidden) return;
    var page = document.getElementById('new-tab-page');
    if (page) page.classList.remove('search-suggest-open');
    box.classList.remove('ss-open');
    clearTimeout(openTimer);
    openTimer = setTimeout(function () { box.hidden = true; }, 180);
  }

  function go(url) {
    if (typeof navigate === 'function' && url) navigate(url);
    input.value = '';
  }

  function urlHost(u) {
    try { return new URL(u).hostname.replace(/^www\./, ''); } catch (_) { return u; }
  }

  function addHeader(text) {
    var h = document.createElement('div');
    h.className = 'ss-header';
    h.textContent = text;
    box.appendChild(h);
  }

  function addHint(text, icon) {
    var h = document.createElement('div');
    h.className = 'ss-hint';
    h.innerHTML = '<i class="fa-solid ' + (icon || 'fa-circle-info') + '"></i><span>' + esc(text) + '</span>';
    box.appendChild(h);
  }

  function addRow(name, icon, run, desc) {
    var row = document.createElement('button');
    row.type = 'button';
    row.className = 'ss-row';
    var iconHtml;
    if (typeof icon === 'string' && /^https?:/i.test(icon)) {
      iconHtml = '<img class="ss-row__fav" src="' + esc(icon) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">';
    } else {
      iconHtml = '<i class="fa-solid ' + esc(icon || 'fa-arrow-right') + '"></i>';
    }
    row.innerHTML =
      '<span class="ss-row__icon">' + iconHtml + '</span>' +
      '<span class="ss-row__copy">' +
        '<span class="ss-row__name">' + esc(name) + '</span>' +
        (desc ? '<span class="ss-row__desc">' + esc(desc) + '</span>' : '') +
      '</span>' +
      '<span class="ss-row__enter"><i class="fa-solid fa-arrow-right"></i></span>';
    row.addEventListener('mousedown', e => { e.preventDefault(); });
    row.addEventListener('click', () => {
      if (!run) return;
      hide();
      run();
    });
    row.style.animationDelay = (rows.length * 22) + 'ms';
    box.appendChild(row);
    var entry = { el: row, run: run };
    rows.push(entry);
    return entry;
  }

  function resetList() {
    box.innerHTML = '';
    rows = [];
    activeIdx = -1;
  }

  function setActive(idx) {
    rows.forEach((r, i) => r.el.classList.toggle('active', i === idx));
    activeIdx = idx;
    if (idx >= 0 && rows[idx]) {
      var el = rows[idx].el;
      if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    }
  }

  function move(dir) {
    if (!rows.length) return;
    var next = activeIdx < 0 ? (dir > 0 ? 0 : rows.length - 1) : (activeIdx + dir + rows.length) % rows.length;
    setActive(next);
  }

  function activeRow() {
    if (activeIdx >= 0 && rows[activeIdx]) return rows[activeIdx];
    if (rows.length) return rows[rows.length - 1];
    return null;
  }

  function renderGeneral(q) {
    var lower = q.toLowerCase();
    var appMatches = APPS.filter(a => a.name.toLowerCase().includes(lower)).slice(0, 3);

    resetList();
    if (appMatches.length) addHeader('Apps');
    appMatches.forEach(a => addRow(a.name, a.icon, () => go('pluto://' + a.key), a.desc));
    addRow('Search the web for "' + q + '"', 'fa-magnifying-glass', () => go(q));
    show();
    setActive(rows.length - 1);

    Promise.all([loadGames(), loadBookmarks(), loadSuggestions(q)]).then(([games, bookmarks, suggs]) => {
      if (input.value.trim() !== q) return;
      var gameMatches = games.filter(g => String(g.name || '').toLowerCase().includes(lower)).slice(0, 5);
      var bmMatches = bookmarks.filter(b =>
        String(b.title || '').toLowerCase().includes(lower) ||
        String(b.url || '').toLowerCase().includes(lower)
      ).slice(0, 5);
      var suggMatches = (suggs || []).filter(s => s && String(s).toLowerCase() !== lower).slice(0, 5);
      if (!gameMatches.length && !bmMatches.length && !suggMatches.length) return;

      var prevActiveName = activeIdx >= 0 && rows[activeIdx] ? rows[activeIdx].el.querySelector('.ss-row__name').textContent : '';
      resetList();
      if (appMatches.length) addHeader('Apps');
      appMatches.forEach(a => addRow(a.name, a.icon, () => go('pluto://' + a.key), a.desc));
      if (suggMatches.length) {
        addHeader('Suggestions');
        suggMatches.forEach(s => addRow(s, 'fa-arrow-trend-up', () => go(s), 'Web search'));
      }
      if (gameMatches.length) {
        addHeader('Games');
        gameMatches.forEach(g => addRow(g.name, 'fa-gamepad', () => go('pluto://games#' + encodeURIComponent(g.id)), 'Play now'));
      }
      if (bmMatches.length) {
        addHeader('Bookmarks');
        bmMatches.forEach(b => addRow(b.title || b.url, window.Bookmarks ? Bookmarks.getFaviconUrl(b.url) : 'fa-bookmark', () => go(b.url), urlHost(b.url)));
      }
      addRow('Search the web for "' + q + '"', 'fa-magnifying-glass', () => go(q));
      show();
      var idx = rows.length - 1;
      if (prevActiveName) {
        var found = rows.findIndex(r => r.el.querySelector('.ss-row__name').textContent === prevActiveName);
        if (found >= 0) idx = found;
      }
      setActive(idx);
    });
  }

  function renderSlash(q) {
    var parts = q.split(/\s+/);
    var cmd = (parts[0] || '').toLowerCase();
    var rest = parts.slice(1).join(' ');

    resetList();

    if (cmd === '/g') {
      addHeader('Games');
      if (!rest) {
        addRow('/g <query>', 'fa-gamepad', function () { completeCommand('/g'); }, 'e.g. /g mario');
        show();
        return;
      }
      addHint('Searching games…');
      show();
      loadGames().then(games => {
        if (input.value.trim() !== q) return;
        resetList();
        addHeader('Games');
        var matches = games.filter(g => String(g.name || '').toLowerCase().includes(rest.toLowerCase())).slice(0, 8);
        if (!matches.length) {
          addHint('No games match "' + rest + '": press Enter to open Games');
        } else {
          matches.forEach(g => addRow(g.name, 'fa-gamepad', () => go('pluto://games#' + encodeURIComponent(g.id)), 'Play now'));
        }
        show();
        if (rows.length) setActive(0);
      });
      return;
    }

    if (cmd === '/cg') {
      addHeader('Cloud Games');
      if (!rest) {
        addRow('/cg <query>', 'fa-cloud', function () { completeCommand('/cg'); }, 'e.g. /cg gta');
        show();
        return;
      }
      addHint('Searching cloud games…');
      show();
      loadCloud().then(games => {
        if (input.value.trim() !== q) return;
        resetList();
        addHeader('Cloud Games');
        var matches = games.filter(g => String(g.name || '').toLowerCase().includes(rest.toLowerCase())).slice(0, 8);
        if (!matches.length) {
          addHint('No cloud games match "' + rest + '": press Enter to open Cloud Gaming');
        } else {
          matches.forEach(g => addRow(g.name, 'fa-cloud', () => go('pluto://cloud#cloud:' + encodeURIComponent(g.game_key)), 'Launch in cloud'));
        }
        show();
        if (rows.length) setActive(0);
      });
      return;
    }

    if (cmd === '/ai') {
      addHeader('AI');
      if (!rest) {
        addRow('/ai <query>', 'fa-robot', function () { completeCommand('/ai'); }, 'e.g. /ai explain quantum computing');
        show();
        return;
      }
      addRow('Start AI chat: "' + rest + '"', 'fa-robot', () => go('pluto://ai?q=' + encodeURIComponent(rest)), 'Chat with Stelena AI');
      show();
      setActive(0);
      return;
    }

    if (cmd === '/watch') {
      var wparts = rest.split(/\s+/);
      var wtype = (wparts[0] || '').toLowerCase();
      var known = ['movies', 'anime', 'tv'];
      addHeader('Watch');
      if (!rest) {
        addRow('/watch movies', 'fa-film', function () { completeCommand('/watch movies'); }, 'Find movies');
        addRow('/watch anime', 'fa-tv', function () { completeCommand('/watch anime'); }, 'Find anime');
        addRow('/watch tv', 'fa-tv', function () { completeCommand('/watch tv'); }, 'Find TV shows');
        show();
        setActive(0);
        return;
      }
      if (known.indexOf(wtype) === -1) {
        addRow('Watch movies: "' + rest + '"', 'fa-film', () => go('pluto://media?category=m&search=' + encodeURIComponent(rest)), 'Movies');
        addHint('Tip: /watch anime <query> for anime · /watch tv <query> for TV shows');
        show();
        setActive(0);
        return;
      }
      var wq = wparts.slice(1).join(' ');
      if (!wq) {
        addHint('/watch ' + wtype + ' <query>: add what to watch');
        show();
        return;
      }
      var cat = wtype === 'movies' ? 'm' : wtype === 'anime' ? 'a' : 't';
      var catLabel = cat === 'm' ? 'movies' : cat === 't' ? 'TV' : 'anime';
      var catDesc = cat === 'm' ? 'Movies' : cat === 't' ? 'TV' : 'Anime';
      addRow('Watch ' + catLabel + ': "' + wq + '"', cat === 'm' ? 'fa-film' : 'fa-tv', () => go('pluto://media?category=' + cat + '&search=' + encodeURIComponent(wq)), catDesc);
      show();
      setActive(0);
      return;
    }

    if (cmd === '/vm') {
      addHeader('VMs');
      addRow('Launch Virtual Machine', 'fa-server', () => go('pluto://vms?autostart=1'), 'Remote Chromium session');
      show();
      setActive(0);
      return;
    }

    var matches = COMMANDS.filter(function (c) { return c.cmd.indexOf(cmd) === 0; });
    if (matches.length) {
      addHeader('Commands');
      matches.forEach(function (c) {
        if (c.cmd === cmd) addHint(c.usage);
        else addRow(c.cmd + ' <query>', c.icon, function () { completeCommand(c.cmd); }, c.desc);
      });
      show();
      if (rows.length) setActive(0);
      return;
    }

    addHeader('Commands');
    COMMANDS.forEach(function (c) {
      addRow(c.cmd + (c.cmd === '/vm' ? '' : ' <query>'), c.icon, function () { completeCommand(c.cmd); }, c.desc);
    });
    show();
  }

  function renderCommands() {
    resetList();
    addHeader('Commands');
    COMMANDS.forEach(function (c) {
      addRow(c.cmd + (c.cmd === '/vm' ? '' : ' <query>'), c.icon, function () { completeCommand(c.cmd); }, c.desc);
    });
    show();
  }

  function completeCommand(cmd) {
    input.value = cmd + ' ';
    render();
  }

  function render() {
    var q = input.value.trim();
    if (!q) {
      if (document.activeElement === input) renderCommands();
      else hide();
      return;
    }
    if (q.charAt(0) === '/') renderSlash(q);
    else renderGeneral(q);
  }

  var userTyped = false;

  function browserAutofilled() {
    try { return input.matches(':-webkit-autofill'); } catch (_) { return false; }
  }

  function dropBrowserAutofill() {
    if (userTyped || !browserAutofilled()) return;
    input.value = '';
    clearTimeout(debounce);
    hide();
  }

  input.addEventListener('keydown', () => { userTyped = true; }, true);
  input.addEventListener('paste', () => { userTyped = true; }, true);
  input.addEventListener('change', dropBrowserAutofill);
  input.addEventListener('animationstart', e => {
    if (e.animationName === 'plu-autofill-in') dropBrowserAutofill();
  });

  input.addEventListener('focus', () => {
    dropBrowserAutofill();
    if (box.hidden) render();
  });

  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(render, 90);
  });

  input.addEventListener('keydown', e => {
    var key = e.key;
    if (key === 'ArrowDown') { e.preventDefault(); move(1); return; }
    if (key === 'ArrowUp') { e.preventDefault(); move(-1); return; }
    if (key === 'Escape') {
      if (!box.hidden) { e.preventDefault(); hide(); }
      return;
    }
    if (key === 'Enter') {
      var q = input.value.trim();
      if (!q) return;
      if (q.charAt(0) !== '/' && box.hidden) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      var cmd = q.split(/\s+/)[0].toLowerCase();
      if (cmd === '/g') {
        var gq = q.slice(2).trim();
        var a = activeRow();
        if (a) { hide(); a.run(); return; }
        if (gq) go('pluto://games?q=' + encodeURIComponent(gq));
        else go('pluto://games');
        hide();
        return;
      }
      if (cmd === '/cg') {
        var cgq = q.slice(3).trim();
        var a2 = activeRow();
        if (a2) { hide(); a2.run(); return; }
        if (cgq) go('pluto://cloud?q=' + encodeURIComponent(cgq));
        else go('pluto://cloud');
        hide();
        return;
      }
      if (cmd === '/ai') {
        var aiq = q.slice(3).trim();
        var a3 = activeRow();
        if (a3) { hide(); a3.run(); return; }
        if (aiq) go('pluto://ai?q=' + encodeURIComponent(aiq));
        else go('pluto://ai');
        hide();
        return;
      }
      if (cmd === '/watch') {
        var a4 = activeRow();
        if (a4) { hide(); a4.run(); return; }
        var wq = q.slice(7).trim();
        var wparts = wq.split(/\s+/);
        var wtype = (wparts[0] || '').toLowerCase();
        var known = ['movies', 'anime', 'tv'];
        var cat = 'm';
        var wq2 = wq;
        if (known.indexOf(wtype) !== -1) {
          cat = wtype === 'movies' ? 'm' : wtype === 'anime' ? 'a' : 't';
          wq2 = wparts.slice(1).join(' ');
        }
        go(wq2 ? 'pluto://media?category=' + cat + '&search=' + encodeURIComponent(wq2) : 'pluto://media');
        hide();
        return;
      }
      if (cmd === '/vm') {
        var a5 = activeRow();
        if (a5) { hide(); a5.run(); return; }
        go('pluto://vms?autostart=1');
        hide();
        return;
      }
      var active = activeRow();
      if (active) { hide(); active.run(); return; }
      if (q) go(q);
      hide();
    }
  });

  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (!box.matches(':hover')) hide();
    }, 140);
  });
  document.addEventListener('keydown', e => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    var nt = document.getElementById('new-tab-page');
    if (nt && nt.style.display === 'none') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    input.focus();
  });
})();