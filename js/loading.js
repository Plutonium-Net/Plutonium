(function () {
  'use strict';

  let pageLoaded = false;
  let kPressed = false;
  let cacheReady = false;

  /* ── Background images to pre-cache ─────────────────────────────────── */
  const CACHE_KEY = 'plutonium-bg-v2';
  const GAMES_CACHE_KEY = 'plutonium-games-v1';
  const PGCDN_BASE = 'https://g.cdn.plutoniumnet.work';
  const BG_IMAGES = [
    'img/backgrounds/coast.jpg',
    'img/backgrounds/color-burst.jpg',
    'img/backgrounds/desert.jpg',
    'img/backgrounds/galaxy.jpg',
    'img/backgrounds/lake-dusk.jpg',
    'img/backgrounds/lake-twilight.jpg',
    'img/backgrounds/light-stream.jpg',
    'img/backgrounds/Lightning.jpg',
    'img/backgrounds/lines.png',
    'img/backgrounds/mojave.jpg',
    'img/backgrounds/refraction-green.png',
    'img/backgrounds/refraction-purple.png',
    'img/backgrounds/swirls.png',
  ];

  /* ── accent colour ────────────────────────────────────────────────── */
  let accent = '#e8175d';
  try {
    const state = window.BrowserThemeState
      ? BrowserThemeState.loadThemeState()
      : null;
    if (state && state.accentColor) accent = state.accentColor;
  } catch (_) {}

  function hexToRgbTriple(hex) {
    const h = (hex || '#e8175d').replace('#', '');
    return parseInt(h.substring(0, 2), 16) + ',' +
           parseInt(h.substring(2, 4), 16) + ',' +
           parseInt(h.substring(4, 6), 16);
  }
  const accentRgb = hexToRgbTriple(accent);

  /* ── build the overlay ────────────────────────────────────────────── */
  const overlay = document.createElement('div');
  overlay.id = 'page-loader';
  overlay.style.cssText =
    'position:fixed;inset:0;background:#000;display:flex;flex-direction:column;' +
    'justify-content:center;align-items:center;z-index:9999;transition:opacity .6s ease;';

  /* ── content wrapper (spinner rings the logo) ───────────────────── */
  const contentWrap = document.createElement('div');
  contentWrap.style.cssText =
    'position:relative;display:inline-flex;align-items:center;justify-content:center;' +
    'margin-bottom:28px;';

  /* ── spinner (ring around logo) ──────────────────────────────────── */
  const spinner = document.createElement('div');
  spinner.className = 'boot-spinner';
  spinner.style.cssText =
    'padding:12px;border-radius:50%;box-sizing:border-box;' +
    'position:absolute;inset:0;' +
    'mask:conic-gradient(#000 0 0) content-box exclude,conic-gradient(#000 0 0);' +
    'filter:blur(12px);animation:boot-morph 1.2s linear infinite alternate;' +
    'transition:width .1s,height .1s;';

  const spinnerInner = document.createElement('div');
  spinnerInner.style.cssText =
    "content:'';position:absolute;inset:0;" +
    'background:repeating-conic-gradient(#0000 0 5%,' + accent + ',#0000 20% 50%);' +
    'animation:boot-spin 1s linear infinite;';
  spinner.appendChild(spinnerInner);

  /* ── "Plutonium" title ───────────────────────────────────────────── */
  const title = document.createElement('div');
  title.style.cssText =
    'display:flex;color:' + accent + ";font-family:'Curly',cursive;" +
    'font-size:clamp(42px,8vw,80px);letter-spacing:2px;z-index:1;position:relative;';

  'Plutonium'.split('').forEach(function (ch, i) {
    const span = document.createElement('span');
    span.textContent = ch;
    span.style.cssText =
      'display:inline-block;animation:boot-letter 3s ease-in-out ' + (i * 0.18) + 's infinite;';
    title.appendChild(span);
  });

  contentWrap.appendChild(spinner);
  contentWrap.appendChild(title);

  /* ── progress bar ────────────────────────────────────────────────── */
  const progressWrap = document.createElement('div');
  progressWrap.style.cssText =
    'width:min(320px,80vw);margin-top:4px;opacity:0;transition:opacity .3s ease;';

  const barTrack = document.createElement('div');
  barTrack.style.cssText =
    'width:100%;height:4px;border-radius:2px;overflow:hidden;' +
    'background:rgba(255,255,255,0.08);';

  const barFill = document.createElement('div');
  barFill.style.cssText =
    'width:0%;height:100%;border-radius:2px;background:' + accent + ';' +
    'transition:width .25s ease;';
  barTrack.appendChild(barFill);
  progressWrap.appendChild(barTrack);

  const statusText = document.createElement('div');
  statusText.style.cssText =
    'text-align:center;font-family:system-ui,sans-serif;font-size:11px;' +
    'color:rgba(255,255,255,0.45);margin-top:10px;letter-spacing:.3px;min-height:16px;';
  progressWrap.appendChild(statusText);

  /* ── injected keyframes ──────────────────────────────────────────── */
  const style = document.createElement('style');
  style.textContent =
    '@keyframes boot-morph{to{border-radius:50%}}' +
    '@keyframes boot-spin{to{rotate:.5turn}}' +
    '@keyframes boot-letter{' +
      '0%,100%{transform:translateY(0)scaleY(1);filter:drop-shadow(0 0 8px rgba(' + accentRgb + ',.4))}' +
      '25%{transform:translateY(-8px)scaleY(1.06);filter:drop-shadow(0 0 18px rgba(' + accentRgb + ',.8))}' +
      '50%{transform:translateY(0)scaleY(0.96);filter:drop-shadow(0 0 4px rgba(' + accentRgb + ',.25))}' +
      '75%{transform:translateY(8px)scaleY(1.05);filter:drop-shadow(0 0 16px rgba(' + accentRgb + ',.7))}' +
    '}';
  document.head.appendChild(style);

  /* ── assemble ────────────────────────────────────────────────────── */
  overlay.appendChild(contentWrap);
  overlay.appendChild(progressWrap);
  document.body.insertBefore(overlay, document.body.firstChild);
  document.body.style.overflow = 'hidden';

  /* ── size spinner to half the viewport ───────────────────────────── */
  var spSize = Math.round(Math.min(window.innerHeight * 0.5, window.innerWidth * 0.9));
  spinner.style.width  = spSize + 'px';
  spinner.style.height = spSize + 'px';
  contentWrap.style.width  = spSize + 'px';
  contentWrap.style.height = spSize + 'px';

  /* ── progress helpers ────────────────────────────────────────────── */
  function updateProgress(cached, total, bytesDone, bytesTotal) {
    const pct = total > 0 ? Math.round((cached / total) * 100) : 0;
    barFill.style.width = pct + '%';
    statusText.textContent =
      'Caching assets: ' + cached + '/' + total + ' items  ' +
      formatMB(bytesDone) + ' / ' + formatMB(bytesTotal);
  }

  function showProgress() {
    progressWrap.style.opacity = '1';
  }

  function formatMB(bytes) {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  /* ── hide logic ──────────────────────────────────────────────────── */
  function hideLoader() {
    overlay.style.opacity = '0';
    setTimeout(function () {
      overlay.remove();
      document.body.style.overflow = '';
    }, 600);
  }

  function checkAndHide() {
    if (pageLoaded && cacheReady && !kPressed) hideLoader();
  }

  /* ── window load ─────────────────────────────────────────────────── */
  window.addEventListener('load', function () {
    pageLoaded = true;
    checkAndHide();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'k' || e.key === 'K') kPressed = true;
  });
  document.addEventListener('keyup', function (e) {
    if (e.key === 'k' || e.key === 'K') { kPressed = false; checkAndHide(); }
  });

  /* ── unified asset caching (backgrounds + game images) ──────────── */
  async function cacheAllAssets() {
    if (!('caches' in window)) { cacheReady = true; return; }

    // 1. Collect background image URLs that need caching
    var bgResponses = [];
    try {
      var bgCache = await caches.open(CACHE_KEY);
      var bgKeys = await bgCache.keys();
      var bgCachedUrls = new Set(bgKeys.map(function (r) { return r.url; }));
      for (var i = 0; i < BG_IMAGES.length; i++) {
        var fullUrl = new URL(BG_IMAGES[i], location.href).href;
        if (bgCachedUrls.has(fullUrl)) continue;
        try {
          var resp = await fetch(BG_IMAGES[i], { cache: 'no-store' });
          var len = parseInt(resp.headers.get('content-length') || '0', 10);
          bgResponses.push({ url: BG_IMAGES[i], resp: resp, ok: resp.ok, bytes: len });
        } catch (_) {
          bgResponses.push({ url: BG_IMAGES[i], resp: null, ok: false, bytes: 0 });
        }
      }
    } catch (_) {}

    // 2. Collect game image URLs that need caching
    var gameUrls = [];
    var gameResponses = [];
    try {
      var cres = await fetch(PGCDN_BASE + '/config.json', { cache: 'no-store' });
      if (cres.ok) {
        var cfg = await cres.json();
        var allGames = (cfg.games || []).filter(function (g) { return g.image; });
        var gameCache = await caches.open(GAMES_CACHE_KEY);
        var gameKeys = await gameCache.keys();
        var alreadyCached = new Set(gameKeys.map(function (r) { return r.url; }));
        for (var gi = 0; gi < allGames.length; gi++) {
          var imgUrl = PGCDN_BASE + '/' + allGames[gi].image;
          if (alreadyCached.has(imgUrl)) continue;
          gameUrls.push(imgUrl);
        }
        for (var gj = 0; gj < gameUrls.length; gj++) {
          try {
            var gresp = await fetch(gameUrls[gj], { cache: 'no-store' });
            var glen = parseInt(gresp.headers.get('content-length') || '0', 10);
            gameResponses.push({ url: gameUrls[gj], resp: gresp, ok: gresp.ok, bytes: glen });
          } catch (_) {
            gameResponses.push({ url: gameUrls[gj], resp: null, ok: false, bytes: 0 });
          }
        }
      }
    } catch (_) {}

    var totalBg = bgResponses.length;
    var totalGames = gameResponses.length;
    var grandTotal = totalBg + totalGames;
    if (grandTotal === 0) { cacheReady = true; return; }

    showProgress();
    var done = 0;
    var bytesDone = 0;
    var bytesTotal = 0;

    // Sum up bytes
    bgResponses.forEach(function (r) { bytesTotal += r.bytes; });
    gameResponses.forEach(function (r) { bytesTotal += r.bytes; });

    function _tick(label) {
      done++;
      var pct = Math.round((done / grandTotal) * 100);
      barFill.style.width = pct + '%';
      statusText.textContent = label + ' ' + done + '/' + grandTotal + '  ' +
        formatMB(bytesDone) + ' / ' + formatMB(bytesTotal);
    }

    // 3. Store backgrounds
    var bgCache2 = await caches.open(CACHE_KEY);
    for (var bi = 0; bi < bgResponses.length; bi++) {
      var be = bgResponses[bi];
      if (be.ok && be.resp) {
        var bclone = be.resp.clone();
        await bgCache2.put(be.url, bclone);
        try { var bb = await be.resp.blob(); bytesDone += bb.size; } catch (_) { bytesDone += be.bytes; }
      }
      _tick('Caching backgrounds:');
    }

    // 4. Store game images
    var gCache2 = await caches.open(GAMES_CACHE_KEY);
    for (var gi2 = 0; gi2 < gameResponses.length; gi2++) {
      var ge = gameResponses[gi2];
      if (ge.ok && ge.resp) {
        var gclone = ge.resp.clone();
        await gCache2.put(ge.url, gclone);
        try { var gb = await ge.resp.blob(); bytesDone += gb.size; } catch (_) { bytesDone += ge.bytes; }
      }
      _tick('Caching games:');
    }

    cacheReady = true;
    checkAndHide();
  }

  cacheAllAssets();

  /* safety net: force-hide after 30 s */
  setTimeout(function () {
    cacheReady = true;
    if (!kPressed) hideLoader();
  }, 30000);
})();
