(function () {
  'use strict';

  let pageLoaded = false;
  let kPressed = false;
  let splashHidden = false;
  let cacheComplete = false;

  /* ── Background images to pre-cache ─────────────────────────────────── */
  const CACHE_KEY = 'plutonium-bg-v2';
  const GAMES_CACHE_KEY = 'plutonium-games-v1';
  const CLOUD_CACHE_KEY = 'plutonium-cloud-v1';
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
  function updateProgress(cached, total, bytesDone, bytesTotal, label) {
    const pct = total > 0 ? Math.round((cached / total) * 100) : 0;
    barFill.style.width = pct + '%';
    statusText.textContent =
      (label || 'Caching assets:') + ' ' + cached + '/' + total + ' items  ' +
      formatMB(bytesDone) + ' / ' + formatMB(bytesTotal);
  }

  function showProgress() {
    progressWrap.style.opacity = '1';
  }

  function formatMB(bytes) {
    bytes = Number(bytes) || 0;
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  async function responseBytes(resp, fallback) {
    if (!resp) return fallback || 0;
    try {
      return (await resp.clone().blob()).size;
    } catch (_) {
      return fallback || 0;
    }
  }

  async function contentLength(url) {
    try {
      var resp = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      if (!resp.ok) return 0;
      return parseInt(resp.headers.get('content-length') || '0', 10) || 0;
    } catch (_) {
      return 0;
    }
  }

  async function contentLengths(urls) {
    var lengths = new Array(urls.length).fill(0);
    var next = 0;
    var workerCount = Math.min(8, urls.length);

    async function worker() {
      while (next < urls.length) {
        var index = next++;
        lengths[index] = await contentLength(urls[index]);
      }
    }

    var workers = [];
    for (var i = 0; i < workerCount; i++) workers.push(worker());
    await Promise.all(workers);
    return lengths;
  }

  function sumBytes(lengths) {
    return lengths.reduce(function (sum, bytes) { return sum + (bytes || 0); }, 0);
  }

  function normalizeCloudImagePath(path) {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    return path.replace(/^\.\.\//, '').replace(/^\.\//, '');
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
    if (splashHidden) return;
    if (pageLoaded && cacheComplete && !kPressed) {
      splashHidden = true;
      hideLoader();
    }
  }

  /* ── window load ─────────────────────────────────────────────────── */
  window.addEventListener('load', function () {
    pageLoaded = true;
    checkAndHide();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'k' || e.key === 'K') {
      kPressed = true;
      // Show progress bar if K is held before splash hides
      if (!splashHidden) showProgress();
    }
  });
  document.addEventListener('keyup', function (e) {
    if (e.key === 'k' || e.key === 'K') { kPressed = false; checkAndHide(); }
  });

  /* ── background image caching (runs immediately, silently) ─────── */
  async function cacheBackgroundImages() {
    if (!('caches' in window)) return;
    try {
      var bgCache = await caches.open(CACHE_KEY);
      var bgKeys = await bgCache.keys();
      var bgCachedUrls = new Set(bgKeys.map(function (r) { return r.url; }));
      var missing = BG_IMAGES.filter(function (url) {
        return !bgCachedUrls.has(new URL(url, location.href).href);
      });
      if (!missing.length) return;

      showProgress();
      updateProgress(0, missing.length, 0, 0, 'Measuring backgrounds:');

      var lengths = await contentLengths(missing);
      var bytesDone = 0;
      var bytesTotal = sumBytes(lengths);
      updateProgress(0, missing.length, 0, bytesTotal, 'Caching backgrounds:');

      for (var i = 0; i < missing.length; i++) {
        try {
          var resp = await fetch(missing[i], { cache: 'no-store' });
          var len = lengths[i] || parseInt(resp.headers.get('content-length') || '0', 10) || 0;
          if (resp.ok) {
            var cachedResp = resp.clone();
            await bgCache.put(missing[i], cachedResp);
            bytesDone += await responseBytes(resp, len);
          }
        } catch (_) {}
        updateProgress(i + 1, missing.length, bytesDone, bytesTotal, 'Caching backgrounds:');
      }
    } catch (_) {}
  }

  /* ── game image caching (deferred 3s to avoid fighting bandwidth) ─ */
  async function cacheGameImages() {
    if (!('caches' in window)) return;
    try {
      var cres = await fetch(PGCDN_BASE + '/config.json', { cache: 'no-store' });
      if (!cres.ok) return;
      var cfg = await cres.json();
      var allGames = (cfg.games || []).filter(function (g) { return g.image; });
      var gameCache = await caches.open(GAMES_CACHE_KEY);
      var gameKeys = await gameCache.keys();
      var alreadyCached = new Set(gameKeys.map(function (r) { return r.url; }));
      var missing = allGames.map(function (g) {
        return PGCDN_BASE + '/' + g.image;
      }).filter(function (url) {
        return !alreadyCached.has(url);
      });
      if (!missing.length) return;

      showProgress();
      updateProgress(0, missing.length, 0, 0, 'Measuring games:');

      var lengths = await contentLengths(missing);
      var bytesDone = 0;
      var bytesTotal = sumBytes(lengths);
      updateProgress(0, missing.length, 0, bytesTotal, 'Caching games:');

      for (var gi = 0; gi < missing.length; gi++) {
        try {
          var gresp = await fetch(missing[gi], { cache: 'no-store' });
          var len = lengths[gi] || parseInt(gresp.headers.get('content-length') || '0', 10) || 0;
          if (gresp.ok) {
            var cachedResp = gresp.clone();
            await gameCache.put(missing[gi], cachedResp);
            bytesDone += await responseBytes(gresp, len);
          }
        } catch (_) {}
        updateProgress(gi + 1, missing.length, bytesDone, bytesTotal, 'Caching games:');
      }
    } catch (_) {}
  }

  /* ── cloud gaming image caching ─────────────────────────────────── */
  async function cacheCloudImages() {
    if (!('caches' in window)) return;
    try {
      var cres = await fetch('data/cloud.json', { cache: 'no-store' });
      if (!cres.ok) return;
      var cfg = await cres.json();
      var cloudUrls = [];
      (cfg || []).forEach(function (game) {
        var image = normalizeCloudImagePath(game.image);
        var cover = normalizeCloudImagePath(game.cover);
        if (image) cloudUrls.push(image);
        if (cover && cover !== image) cloudUrls.push(cover);
      });

      var cloudCache = await caches.open(CLOUD_CACHE_KEY);
      var cloudKeys = await cloudCache.keys();
      var alreadyCached = new Set(cloudKeys.map(function (r) { return r.url; }));
      var seen = new Set();
      var missing = cloudUrls.filter(function (url) {
        var fullUrl = new URL(url, location.href).href;
        if (seen.has(fullUrl) || alreadyCached.has(fullUrl)) return false;
        seen.add(fullUrl);
        return true;
      });
      if (!missing.length) return;

      showProgress();
      updateProgress(0, missing.length, 0, 0, 'Measuring cloud games:');

      var lengths = await contentLengths(missing);
      var bytesDone = 0;
      var bytesTotal = sumBytes(lengths);
      updateProgress(0, missing.length, 0, bytesTotal, 'Caching cloud games:');

      for (var ci = 0; ci < missing.length; ci++) {
        try {
          var cResp = await fetch(missing[ci], { cache: 'no-store' });
          var len = lengths[ci] || parseInt(cResp.headers.get('content-length') || '0', 10) || 0;
          if (cResp.ok) {
            var cachedResp = cResp.clone();
            await cloudCache.put(missing[ci], cachedResp);
            bytesDone += await responseBytes(cResp, len);
          }
        } catch (_) {}
        updateProgress(ci + 1, missing.length, bytesDone, bytesTotal, 'Caching cloud games:');
      }
    } catch (_) {}
  }

  async function cacheVisibleAssets() {
    try {
      await cacheBackgroundImages();
      await cacheGameImages();
      await cacheCloudImages();
    } finally {
      cacheComplete = true;
      checkAndHide();
    }
  }

  cacheVisibleAssets();

  /* safety net: force-hide after 30 s */
  setTimeout(function () {
    if (!splashHidden) {
      cacheComplete = true;
      splashHidden = true;
      hideLoader();
    }
  }, 30000);
})();
