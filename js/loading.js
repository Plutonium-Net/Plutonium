(function () {
  'use strict';

  let pageLoaded = false;
  let kPressed = false;
  let splashHidden = false;
  let cacheComplete = false;
  let progressShown = false;

  /* ── Background images to pre-cache ─────────────────────────────────── */
  const CACHE_KEY = 'plutonium-bg-v2';
  const GAMES_CACHE_KEY = 'plutonium-games-v1';
  const CLOUD_CACHE_KEY = 'plutonium-cloud-v1';
  const LOGOS_CACHE_KEY = 'plutonium-logos-v1';
  const PGCDN_BASE = 'https://g.cdn.plutoniumnet.work';
  const BG_IMAGES = [
    'img/backgrounds/coast.jpg',
    'img/backgrounds/color-burst.jpg',
    'img/backgrounds/desert.jpg',
    'img/backgrounds/galaxy.jpg',
    'img/backgrounds/lake-dusk.jpg',
    'img/backgrounds/lake-twilight.jpg',
    'img/backgrounds/light-stream.jpg',
    'img/backgrounds/lightning.jpg',
    'img/backgrounds/lines.png',
    'img/backgrounds/mojave.jpg',
    'img/backgrounds/refraction-green.png',
    'img/backgrounds/refraction-purple.png',
    'img/backgrounds/swirls.png',
  ];

  /* ── Brand logos to pre-cache (all accent colours × variants) ──────── */
  const LOGO_COLORS = ['plutonium-pink', 'violet', 'blue', 'emerald', 'amber', 'red', 'cyan', 'fuchsia', 'white'];
  const LOGO_VARIANTS = ['brand-logo', 'logo', 'icon'];
  const LOGO_IMAGES = ['img/logos/stelena.svg'];
  LOGO_VARIANTS.forEach(function (variant) {
    LOGO_COLORS.forEach(function (color) {
      LOGO_IMAGES.push('img/logos/' + variant + '-' + color + '.png');
    });
  });

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
    'width:min(420px,86vw);margin-top:4px;opacity:0;transition:opacity .3s ease;';

  // One segment per caching step (backgrounds, logos, games, cloud games).
  // The active step renders big; finished steps shrink into the small slots
  // on the left, pending ones wait small on the right. The big bar "walks"
  // right as each step completes.
  // Active bar = triple the completed/queued ones: 1.5× the old 29% width
  // (43.5) vs the smalls at half of the old 29% width (14.5).
  const BAR_ACTIVE_W = 43.5;                 // active (big) segment width, %
  const BAR_SMALL_W  = 14.5;                 // completed/queued: ⅓ of the active bar
  const BAR_ACTIVE_H = 10;
  const BAR_SMALL_H  = 4.8;
  const STEP_MIN_MS  = 5000;                 // hard minimum per segment (4 × 5 s = 20 s)

  const barRow = document.createElement('div');
  barRow.style.cssText =
    'display:flex;align-items:center;justify-content:space-between;' +
    'width:100%;height:' + BAR_ACTIVE_H + 'px;';

  const barSegments = [];
  for (var bi = 0; bi < 4; bi++) {
    const seg = document.createElement('div');
    seg.style.cssText =
      'height:' + BAR_SMALL_H + 'px;border-radius:3px;overflow:hidden;' +
      'background:rgba(255,255,255,0.08);' +
      'transition:width .45s ease,height .45s ease;';
    const fill = document.createElement('div');
    fill.style.cssText =
      'width:0%;height:100%;border-radius:3px;background:' + accent + ';' +
      'transition:width .25s ease;';
    seg.appendChild(fill);
    barRow.appendChild(seg);
    barSegments.push({ el: seg, fill: fill });
  }

  // Grow the active step, shrink every other step into its slot.
  function setStepActive(index) {
    barSegments.forEach(function (seg, i) {
      const active = i === index;
      seg.el.style.width  = (active ? BAR_ACTIVE_W : BAR_SMALL_W) + '%';
      seg.el.style.height = (active ? BAR_ACTIVE_H : BAR_SMALL_H) + 'px';
    });
  }

  // Initial state: first step big, the other three small on its right.
  setStepActive(0);

  progressWrap.appendChild(barRow);

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
  // Map a cache label back to its step slot (0 = backgrounds, 1 = logos,
  // 2 = games, 3 = cloud games).
  function stepIndexFromLabel(label) {
    const l = String(label || '').toLowerCase();
    if (l.indexOf('logo') !== -1) return 1;
    if (l.indexOf('cloud') !== -1) return 3;
    if (l.indexOf('game') !== -1) return 2;
    return 0;
  }

  // Step pacing state: the fill never jumps straight to the real progress —
  // it is capped by a STEP_MIN_MS linear envelope, so a segment that finishes
  // early keeps filling (slower but accurate) instead of freezing at its
  // final percentage for the remaining time.
  let stepStartTime = 0;
  let currentStepIdx = -1;
  let realPct = 0;
  let fillTicker = null;

  function startFillTicker() {
    if (fillTicker) return;
    fillTicker = setInterval(function () {
      if (currentStepIdx < 0) return;
      const elapsed = Date.now() - stepStartTime;
      const envelope = Math.min(100, (elapsed / STEP_MIN_MS) * 100);
      barSegments[currentStepIdx].fill.style.width = Math.min(realPct, envelope) + '%';
    }, 100);
  }

  function stopFillTicker() {
    if (fillTicker) { clearInterval(fillTicker); fillTicker = null; }
  }

  function updateProgress(cached, total, bytesDone, bytesTotal, label) {
    const pct = total > 0 ? Math.round((cached / total) * 100) : 0;
    const idx = stepIndexFromLabel(label);
    if (idx !== currentStepIdx) {
      currentStepIdx = idx;
      stepStartTime = Date.now();
    }
    realPct = pct;
    setStepActive(idx);
    statusText.textContent =
      (label || 'Caching assets:') + ' ' + cached + '/' + total + ' items  ' +
      formatMB(bytesDone) + ' / ' + formatMB(bytesTotal);
  }

  function showProgress() {
    progressShown = true;
    progressWrap.style.opacity = '1';
    startFillTicker();
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
    stopFillTicker();
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
      if (!missing.length) { markStepComplete('Caching backgrounds:'); return; }

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

  /* ── brand logo caching (runs right after backgrounds) ──────────── */
  async function cacheLogoImages() {
    if (!('caches' in window)) return;
    try {
      var logoCache = await caches.open(LOGOS_CACHE_KEY);
      var logoKeys = await logoCache.keys();
      var logoCachedUrls = new Set(logoKeys.map(function (r) { return r.url; }));
      var missing = LOGO_IMAGES.filter(function (url) {
        return !logoCachedUrls.has(new URL(url, location.href).href);
      });
      if (!missing.length) { markStepComplete('Caching logos:'); return; }

      showProgress();
      updateProgress(0, missing.length, 0, 0, 'Measuring logos:');

      var lengths = await contentLengths(missing);
      var bytesDone = 0;
      var bytesTotal = sumBytes(lengths);
      updateProgress(0, missing.length, 0, bytesTotal, 'Caching logos:');

      for (var li = 0; li < missing.length; li++) {
        try {
          var lresp = await fetch(missing[li], { cache: 'no-store' });
          var len = lengths[li] || parseInt(lresp.headers.get('content-length') || '0', 10) || 0;
          if (lresp.ok) {
            var cachedResp = lresp.clone();
            await logoCache.put(missing[li], cachedResp);
            bytesDone += await responseBytes(lresp, len);
          }
        } catch (_) {}
        updateProgress(li + 1, missing.length, bytesDone, bytesTotal, 'Caching logos:');
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
      if (!missing.length) { markStepComplete('Caching games:'); return; }

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
      if (!missing.length) { markStepComplete('Caching cloud games:'); return; }

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

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // Skipped steps (already fully cached) still occupy their segment: once the
  // bar is visible, mark the segment complete so the walk stays in order. The
  // ticker then paces its fill over the step's minimum time.
  function markStepComplete(label) {
    if (!progressShown) return;
    const idx = stepIndexFromLabel(label);
    currentStepIdx = idx;
    stepStartTime = Date.now();
    realPct = 100;
    setStepActive(idx);
    statusText.textContent = label.replace('Caching ', 'Cached ') + ' up to date';
  }

  // Hard minimum display time per step: a segment must stay on screen for at
  // least `ms` before the next one takes over. While it waits, the fill keeps
  // moving (driven by the ticker's envelope), so the bar never idles at its
  // final percentage. Only enforced once the bar is actually visible, so
  // fully-warm loads still pass instantly.
  async function withMinStepTime(task, ms) {
    const start = Date.now();
    try {
      await task;
    } finally {
      const remaining = ms - (Date.now() - start);
      if (remaining > 0 && progressShown) await sleep(remaining);
    }
  }

  async function cacheVisibleAssets() {
    try {
      await withMinStepTime(cacheBackgroundImages(), STEP_MIN_MS);
      await withMinStepTime(cacheLogoImages(), STEP_MIN_MS);
      await withMinStepTime(cacheGameImages(), STEP_MIN_MS);
      await withMinStepTime(cacheCloudImages(), STEP_MIN_MS);
    } finally {
      cacheComplete = true;
      checkAndHide();
    }
  }

  cacheVisibleAssets();

  /* safety net: force-hide after 90 s (the 4×5 s minimum floor means cold
     loads take at least 20 s, so 30 s would cut real caching short) */
  setTimeout(function () {
    if (!splashHidden) {
      cacheComplete = true;
      splashHidden = true;
      hideLoader();
    }
  }, 90000);
})();
