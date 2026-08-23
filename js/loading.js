(function () {
  'use strict';

  let pageLoaded = false;
  let kPressed = false;
  let cacheReady = false;

  /* ── Background images to pre-cache ─────────────────────────────────── */
  const CACHE_KEY = 'plutonium-bg-v2';
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

  /* ── "Plutonium" title ───────────────────────────────────────────── */
  const title = document.createElement('div');
  title.style.cssText =
    'display:flex;color:' + accent + ";font-family:'Curly',cursive;" +
    'font-size:clamp(42px,8vw,80px);letter-spacing:2px;margin-bottom:32px;z-index:1;';

  'Plutonium'.split('').forEach(function (ch, i) {
    const span = document.createElement('span');
    span.textContent = ch;
    span.style.cssText =
      'display:inline-block;animation:boot-letter 3s ease-in-out ' + (i * 0.18) + 's infinite;';
    title.appendChild(span);
  });

  /* ── spinner ─────────────────────────────────────────────────────── */
  const spinner = document.createElement('div');
  spinner.className = 'boot-spinner';
  spinner.style.cssText =
    'width:72px;height:72px;padding:8px;border-radius:18px;box-sizing:border-box;' +
    'position:relative;margin-bottom:28px;' +
    'mask:conic-gradient(#000 0 0) content-box exclude,conic-gradient(#000 0 0);' +
    'filter:blur(12px);animation:boot-morph 1.2s linear infinite alternate;';

  const spinnerInner = document.createElement('div');
  spinnerInner.style.cssText =
    "content:'';position:absolute;inset:0;" +
    'background:repeating-conic-gradient(#0000 0 5%,' + accent + ',#0000 20% 50%);' +
    'animation:boot-spin 1s linear infinite;';
  spinner.appendChild(spinnerInner);

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
  overlay.appendChild(title);
  overlay.appendChild(spinner);
  overlay.appendChild(progressWrap);
  document.body.insertBefore(overlay, document.body.firstChild);
  document.body.style.overflow = 'hidden';

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

  /* ── asset caching ───────────────────────────────────────────────── */
  async function cacheBackgrounds() {
    if (!('caches' in window)) { cacheReady = true; return; }

    try {
      const existing = await caches.open(CACHE_KEY);
      const keys = await existing.keys();
      // Already cached — skip progress
      if (keys.length >= BG_IMAGES.length) { cacheReady = true; return; }
    } catch (_) {
      cacheReady = true;
      return;
    }

    showProgress();
    const total = BG_IMAGES.length;
    let cached = 0;
    let bytesDone = 0;
    let bytesTotal = 0;

    // Fetch all first to get Content-Length for total MB
    const responses = [];
    for (var i = 0; i < total; i++) {
      try {
        const resp = await fetch(BG_IMAGES[i], { cache: 'no-store' });
        const len = parseInt(resp.headers.get('content-length') || '0', 10);
        bytesTotal += len;
        responses.push({ url: BG_IMAGES[i], resp: resp, ok: resp.ok });
      } catch (_) {
        responses.push({ url: BG_IMAGES[i], resp: null, ok: false });
      }
    }

    // Now store in cache with progress
    const cache = await caches.open(CACHE_KEY);
    for (var j = 0; j < responses.length; j++) {
      const entry = responses[j];
      if (entry.ok && entry.resp) {
        // Clone because we need to consume the body for the cache
        const clone = entry.resp.clone();
        await cache.put(entry.url, clone);
        // Read body length from the clone
        try {
          const blob = await entry.resp.blob();
          bytesDone += blob.size;
        } catch (_) {
          // approximate from Content-Length
          var len2 = parseInt(entry.resp.headers.get('content-length') || '0', 10);
          bytesDone += len2;
        }
      }
      cached++;
      updateProgress(cached, total, bytesDone, bytesTotal);
    }

    cacheReady = true;
    checkAndHide();
  }

  cacheBackgrounds();

  /* safety net: force-hide after 30 s */
  setTimeout(function () {
    cacheReady = true;
    if (!kPressed) hideLoader();
  }, 30000);
})();
