(function () {
  'use strict';

  /* Boot + asset caching.
   *
   * The splash no longer waits for the cache: it covers only the page load and
   * lifts as soon as the document has fully loaded. Caching then runs as a
   * background task whose progress is surfaced by a banner, so the user can
   * start browsing immediately.
   *
   * The banner is a fixed element in the top-level document, so switching the
   * app's own pages or browser tabs keeps it alive with the same progress.
   *
   * Two mount modes, chosen by what is in the document:
   *   - app shell (index.html)  -> splash + fixed bottom-centre banner
   *   - onboarding  (onboarding.html with #onb-cache-banner) -> inline banner
   * Proxied UV/Scramjet error pages include this file too and match neither, so
   * they get the splash only and never try to cache into the wrong origin.
   */

  var appShell = !!document.getElementById('new-tab-page');
  var inlineMount = document.getElementById('onb-cache-banner');
  var inlineMode = !!inlineMount && !appShell;

  window.__pluBootDone = false;

  var pageLoaded = false;
  var splashHidden = false;
  var cacheComplete = false;
  var failedAssets = 0;
  var progressStarted = false;
  var bannerVisible = false;
  var bannerFinished = false;

  var CACHE_KEY = 'plutonium-bg-v2';
  var GAMES_CACHE_KEY = 'plutonium-games-v1';
  var LOGOS_CACHE_KEY = 'plutonium-logos-v2';
  // The daily default backgrounds are ~500 MB in total, so they live in a cache
  // of their own: clearing them can never evict the small shell/game caches.
  var BG_DEFAULT_CACHE_KEY = 'plutonium-bg-default-v1';
  var BG_DEFAULT_DATA_URL = 'data/bg-default.json';
  var PGCDN_BASE = 'https://g.cdn.plutoniumnet.work';
  var BG_IMAGES = [
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

  var LOGO_COLORS = ['plutonium-pink', 'violet', 'blue', 'emerald', 'amber', 'red', 'cyan', 'fuchsia', 'white'];
  var LOGO_VARIANTS = ['brand-logo', 'logo', 'icon'];
  var LOGO_IMAGES = ['img/logos/stelena.svg?v=2'];
  LOGO_VARIANTS.forEach(function (variant) {
    LOGO_COLORS.forEach(function (color) {
      LOGO_IMAGES.push('img/logos/' + variant + '-' + color + '.png');
    });
  });

  // Five cache groups, one progress segment each, in the order they run.
  var GROUP_COUNT = 5;
  var completedGroups = 0;
  var activeGroupIndex = -1;
  var activeGroupPct = 0;

  var accent = '#e8175d';
  try {
    var state = window.BrowserThemeState
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
  var accentRgb = hexToRgbTriple(accent);

  /* ------------------------------------------------------------------ *
   * Splash (not shown in inline/onboarding mode)
   * ------------------------------------------------------------------ */

  var overlay = null;

  function buildSplash() {
    overlay = document.createElement('div');
    overlay.id = 'page-loader';
    overlay.style.cssText =
      'position:fixed;inset:0;background:#000;display:flex;flex-direction:column;' +
      'justify-content:center;align-items:center;z-index:9999;transition:opacity .6s ease;';

    var contentWrap = document.createElement('div');
    contentWrap.style.cssText =
      'position:relative;display:inline-flex;align-items:center;justify-content:center';

    var spinner = document.createElement('div');
    spinner.className = 'boot-spinner';
    spinner.style.cssText =
      'padding:12px;border-radius:50%;box-sizing:border-box;' +
      'position:absolute;inset:0;' +
      'mask:conic-gradient(#000 0 0) content-box exclude,conic-gradient(#000 0 0);' +
      'filter:blur(12px);animation:boot-morph 1.2s linear infinite alternate;' +
      'transition:width .1s,height .1s;';

    var spinnerInner = document.createElement('div');
    spinnerInner.style.cssText =
      "content:'';position:absolute;inset:0;" +
      'background:repeating-conic-gradient(#0000 0 5%,' + accent + ',#0000 20% 50%);' +
      'animation:boot-spin 1s linear infinite;';
    spinner.appendChild(spinnerInner);

    var title = document.createElement('div');
    title.style.cssText =
      'display:flex;color:' + accent + ";font-family:'Curly',cursive;" +
      'font-size:clamp(42px,8vw,80px);letter-spacing:2px;z-index:1;position:relative;';

    'Plutonium'.split('').forEach(function (ch, i) {
      var span = document.createElement('span');
      span.textContent = ch;
      span.style.cssText =
        'display:inline-block;animation:boot-letter 3s ease-in-out ' + (i * 0.18) + 's infinite;';
      title.appendChild(span);
    });

    contentWrap.appendChild(spinner);
    contentWrap.appendChild(title);
    overlay.appendChild(contentWrap);

    var style = document.createElement('style');
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

    document.body.insertBefore(overlay, document.body.firstChild);
    document.body.style.overflow = 'hidden';

    var spSize = Math.round(Math.min(window.innerHeight * 0.5, window.innerWidth * 0.9));
    spinner.style.width = spSize + 'px';
    spinner.style.height = spSize + 'px';
    contentWrap.style.width = spSize + 'px';
    contentWrap.style.height = spSize + 'px';
  }

  function hideSplash() {
    window.__pluBootDone = true;
    window.dispatchEvent(new CustomEvent('plu-boot-done'));
    splashHidden = true;
    // A cache group may already have started (or be mid-run) while the splash
    // was still up; now that the page is visible, surface its progress.
    revealWhenAllowed();
    if (!overlay) return;
    var node = overlay;
    overlay = null;
    node.style.opacity = '0';
    setTimeout(function () {
      node.remove();
      document.body.style.overflow = '';
    }, 600);
  }

  function checkAndHide() {
    // Cache completion is deliberately not part of this: the page is shown as
    // soon as it has loaded, and the cache keeps going in the background.
    if (splashHidden || inlineMode) return;
    if (pageLoaded) hideSplash();
  }

  window.addEventListener('load', function () {
    pageLoaded = true;
    checkAndHide();
  });

  /* ------------------------------------------------------------------ *
   * Cache banner
   * ------------------------------------------------------------------ */

  var banner = null;
  var bannerTitle = null;
  var bannerPct = null;
  var bannerStatus = null;
  var bannerSegments = [];   // { track, fill } — one per cache group
  var bannerBar = null;
  var bannerMonthBar = null;
  var bannerMonthSegments = [];   // { track, fill } — one per month of the defaults stage
  var STEPS = { backgrounds: 0, logos: 1, games: 2, defaults: 3 };
  var MONTH_COUNT = 12;

  // Appearance lives in css/glass.css (`.plu-cache-banner`), which takes every
  // colour from the theme tokens (--ui-accent, --ui-accent-rgb, --ui-text...).
  // That way the pill re-tints itself the moment the user changes their accent,
  // and it wears the same liquid-glass surface as the rest of the shell.
  // The inline variant is deliberately not glass: the onboarding card is flat
  // black, so there it renders as a plain black panel.
  function buildBanner() {
    banner = document.createElement('div');
    banner.id = 'plu-cache-banner';
    banner.className = 'plu-cache-banner' + (inlineMode ? ' plu-cache-banner--inline' : '');
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');

    var head = document.createElement('div');
    head.className = 'plu-cache-banner__head';

    bannerTitle = document.createElement('span');
    bannerTitle.className = 'plu-cache-banner__title';
    bannerTitle.textContent = 'Caching assets';

    bannerPct = document.createElement('span');
    bannerPct.className = 'plu-cache-banner__pct';
    bannerPct.textContent = '0%';

    head.appendChild(bannerTitle);
    head.appendChild(bannerPct);

    bannerBar = document.createElement('div');
    bannerBar.className = 'plu-cache-banner__bar';

    for (var i = 0; i < GROUP_COUNT; i++) {
      var track = document.createElement('span');
      track.className = 'plu-cache-banner__track';
      var fill = document.createElement('span');
      fill.className = 'plu-cache-banner__fill';
      track.appendChild(fill);
      bannerBar.appendChild(track);
      bannerSegments.push({ track: track, fill: fill });
    }

    // The default-background stage covers a whole year, so once it starts the row
    // is swapped for one segment per month, filled January through December.
    bannerMonthBar = document.createElement('div');
    bannerMonthBar.className = 'plu-cache-banner__bar plu-cache-banner__bar--months';
    bannerMonthBar.setAttribute('hidden', '');
    for (var m = 0; m < MONTH_COUNT; m++) {
      var mTrack = document.createElement('span');
      mTrack.className = 'plu-cache-banner__track';
      var mFill = document.createElement('span');
      mFill.className = 'plu-cache-banner__fill';
      mTrack.appendChild(mFill);
      bannerMonthBar.appendChild(mTrack);
      bannerMonthSegments.push({ track: mTrack, fill: mFill });
    }

    bannerStatus = document.createElement('div');
    bannerStatus.className = 'plu-cache-banner__status';

    banner.appendChild(head);
    banner.appendChild(bannerBar);
    banner.appendChild(bannerMonthBar);
    banner.appendChild(bannerStatus);

    var host = inlineMode ? inlineMount : document.body;
    host.appendChild(banner);
  }

  function showBanner() {
    if (!banner || bannerVisible || bannerFinished) return;
    bannerVisible = true;
    if (inlineMode) inlineMount.removeAttribute('hidden');
    // One frame later so the element has a chance to lay out before the class
    // flips: otherwise a banner appended in the same tick skips its fade-in.
    requestAnimationFrame(function () {
      if (banner && bannerVisible) banner.classList.add('is-visible');
    });
  }

  // Caching can outrun the splash. Only reveal once the page is actually in
  // front of the user, and never for a run that has already finished.
  function revealWhenAllowed() {
    if (bannerVisible || bannerFinished || cacheComplete) return;
    // No work has been found yet: stay hidden so a warm cache (nothing to
    // fetch) never flashes an empty 0% pill on load.
    if (!progressStarted) return;
    if (!inlineMode && !splashHidden) return;
    showBanner();
  }

  function hideBanner(immediate) {
    if (!banner) return;
    var node = banner;
    banner = null;
    bannerVisible = false;
    if (immediate) {
      node.remove();
      if (inlineMount) inlineMount.setAttribute('hidden', '');
      return;
    }
    node.classList.remove('is-visible');
    setTimeout(function () {
      node.remove();
      if (inlineMount) inlineMount.setAttribute('hidden', '');
    }, 400);
  }

  function setOverall(pct) {
    if (bannerPct) bannerPct.textContent = Math.max(0, Math.min(100, pct)) + '%';
  }

  function updateOverall() {
    var pct = ((completedGroups + (activeGroupIndex >= 0 ? activeGroupPct / 100 : 0)) / GROUP_COUNT) * 100;
    var rounded = Math.floor(pct);
    // Rounding a near-finished final group must not read as 100% before the run
    // is actually done; the checkmark is the only thing that says "finished".
    if (!cacheComplete && rounded > 99) rounded = 99;
    setOverall(rounded);
  }

  function stepIndexFromLabel(label) {
    var l = String(label || '').toLowerCase();
    // 'default backgrounds' would otherwise land on the plain backgrounds step.
    if (l.indexOf('default') !== -1) return STEPS.defaults;
    if (l.indexOf('logo') !== -1) return STEPS.logos;
    if (l.indexOf('game') !== -1) return STEPS.games;
    return STEPS.backgrounds;
  }

  function setSegmentActive(index) {
    bannerSegments.forEach(function (seg, i) {
      seg.track.classList.toggle('is-active', i === index);
    });
  }

  function updateProgress(cached, total, bytesDone, bytesTotal, label) {
    var pct = total > 0 ? Math.round((cached / total) * 100) : 0;
    var idx = stepIndexFromLabel(label);
    activeGroupIndex = idx;
    activeGroupPct = pct;
    if (bannerSegments[idx]) bannerSegments[idx].fill.style.width = pct + '%';
    setSegmentActive(idx);
    updateOverall();
    if (bannerStatus) {
      bannerStatus.textContent =
        (label || 'Caching assets:') + ' ' + cached + '/' + total + ' items  ' +
        formatMB(bytesDone) + ' / ' + formatMB(bytesTotal);
    }
  }

  function formatMB(bytes) {
    bytes = Number(bytes) || 0;
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  /* ------------------------------------------------------------------ *
   * Caching task
   * ------------------------------------------------------------------ */

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

  function markStepComplete(label) {
    var idx = stepIndexFromLabel(label);
    if (bannerSegments[idx]) bannerSegments[idx].fill.style.width = '100%';
    if (progressStarted && bannerStatus) {
      bannerStatus.textContent = label.replace('Caching ', 'Cached ') + ' up to date';
    }
  }

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

      progressStarted = true;
      revealWhenAllowed();
      updateProgress(0, missing.length, 0, 0, 'Caching backgrounds:');

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
          } else {
            failedAssets++;
          }
        } catch (_) { failedAssets++; }
        updateProgress(i + 1, missing.length, bytesDone, bytesTotal, 'Caching backgrounds:');
      }
    } catch (_) {}
  }

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

      progressStarted = true;
      revealWhenAllowed();
      updateProgress(0, missing.length, 0, 0, 'Caching logos:');

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
          } else {
            failedAssets++;
          }
        } catch (_) { failedAssets++; }
        updateProgress(li + 1, missing.length, bytesDone, bytesTotal, 'Caching logos:');
      }
    } catch (_) {}
  }

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

      progressStarted = true;
      revealWhenAllowed();
      updateProgress(0, missing.length, 0, 0, 'Caching games:');

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
          } else {
            failedAssets++;
          }
        } catch (_) { failedAssets++; }
        updateProgress(gi + 1, missing.length, bytesDone, bytesTotal, 'Caching games:');
      }
    } catch (_) {}
  }

  /* The 365 day backgrounds. data/bg-default.json is the source of truth (the
   * same file theme-state.js and the default background page read), so the list
   * cannot drift from what the app actually renders. Every dated entry has a
   * file on disk; the top-level `default.image` is deliberately skipped because
   * it does not exist in this checkout and would fail on every run. */
  function sortNumericKeys(keys) {
    return keys.slice().sort(function (a, b) {
      return (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0);
    });
  }

  async function defaultBackgroundsByMonth() {
    var resp = await fetch(BG_DEFAULT_DATA_URL, { cache: 'no-store' });
    if (!resp.ok) return [];
    var cfg = await resp.json();
    var months = (cfg && cfg.months) || {};

    return sortNumericKeys(Object.keys(months)).map(function (key) {
      var month = months[key] || {};
      var urls = [];
      var seen = new Set();
      ['weeks', 'days'].forEach(function (bucket) {
        var group = month[bucket] || {};
        sortNumericKeys(Object.keys(group)).forEach(function (slot) {
          var file = group[slot] && group[slot].image;
          if (typeof file !== 'string' || !file || seen.has(file)) return;
          seen.add(file);
          urls.push(file);
        });
      });
      return { key: key, label: month.name || ('Month ' + key), urls: urls };
    }).filter(function (month) { return month.urls.length; });
  }

  /* Swap the group row for the month row: the defaults stage is a year of
   * backgrounds, so it reports itself as twelve monthly steps instead of one. */
  function enterMonthMode() {
    if (bannerBar) bannerBar.setAttribute('hidden', '');
    if (bannerMonthBar) bannerMonthBar.removeAttribute('hidden');
  }

  function setMonthProgress(index, pct) {
    bannerMonthSegments.forEach(function (seg, i) {
      if (i < index) {
        seg.fill.style.width = '100%';
        seg.track.classList.remove('is-active');
      } else if (i === index) {
        seg.fill.style.width = pct + '%';
        seg.track.classList.add('is-active');
      } else {
        seg.fill.style.width = '0%';
        seg.track.classList.remove('is-active');
      }
    });
  }

  // A month that needs nothing still moves the stage along. It leaves the status
  // line alone on purpose: flashing "0/0 items" would read as a broken transfer.
  function skipMonth(monthIndex) {
    bannerMonthSegments.forEach(function (seg, i) {
      seg.fill.style.width = i <= monthIndex ? '100%' : '0%';
      seg.track.classList.remove('is-active');
    });
    activeGroupIndex = STEPS.defaults;
    activeGroupPct = ((monthIndex + 1) / MONTH_COUNT) * 100;
    updateOverall();
  }

  // Overall progress treats the twelve months as the one group they belong to.
  function updateMonthProgress(label, monthIndex, monthPct, cached, total, bytesDone, bytesTotal) {
    setMonthProgress(monthIndex, monthPct);
    var groupPct = ((monthIndex + (monthPct / 100)) / MONTH_COUNT) * 100;
    activeGroupIndex = STEPS.defaults;
    activeGroupPct = groupPct;
    if (bannerSegments[STEPS.defaults]) bannerSegments[STEPS.defaults].fill.style.width = groupPct + '%';
    setSegmentActive(STEPS.defaults);
    updateOverall();
    if (bannerStatus) {
      bannerStatus.textContent =
        'Caching default backgrounds (' + label + '): ' + cached + '/' + total + ' items  ' +
        formatMB(bytesDone) + ' / ' + formatMB(bytesTotal);
    }
  }

  async function cacheDefaultBackgrounds() {
    if (!('caches' in window)) return;
    try {
      var months = await defaultBackgroundsByMonth();
      if (!months.length) return;

      var dayCache = await caches.open(BG_DEFAULT_CACHE_KEY);
      var dayKeys = await dayCache.keys();
      var alreadyCached = new Set(dayKeys.map(function (r) { return r.url; }));
      var planned = months.map(function (month) {
        return {
          label: month.label,
          urls: month.urls.map(function (url) { return new URL(url, location.href).href; })
            .filter(function (url) { return !alreadyCached.has(url); })
        };
      });
      var anyMissing = planned.some(function (month) { return month.urls.length; });
      if (!anyMissing) { markStepComplete('Caching default backgrounds:'); return; }

      progressStarted = true;
      revealWhenAllowed();
      enterMonthMode();

      // Out of storage: later months cannot help either, so the whole stage stops.
      var stopped = false;

      for (var mi = 0; mi < planned.length && !stopped; mi++) {
        var month = planned[mi];
        if (!month.urls.length) { skipMonth(mi); continue; }

        var lengths = await contentLengths(month.urls);
        var bytesDone = 0;
        var bytesTotal = sumBytes(lengths);
        var done = 0;
        updateMonthProgress(month.label, mi, 0, 0, month.urls.length, 0, bytesTotal);

        // Hundreds of files across the stage, so a month pulls a few at a time
        // instead of strictly one by one. The counter only ever climbs.
        var next = 0;
        async function worker() {
          while (next < month.urls.length && !stopped) {
            var index = next++;
            var url = month.urls[index];
            try {
              var resp = await fetch(url, { cache: 'no-store' });
              var len = parseInt(resp.headers.get('content-length') || '0', 10) || lengths[index] || 0;
              if (resp.ok) {
                await dayCache.put(url, resp.clone());
                // Declared length rather than the body's size: with six of these
                // large files in flight, reading the body back reports a short
                // count, which would understate the MB figure by half.
                bytesDone += len || await responseBytes(resp, len);
              } else {
                failedAssets++;
              }
            } catch (err) {
              failedAssets++;
              // Retrying the rest of the year cannot help, and hammering it would
              // only thrash the quota.
              if (err && (err.name === 'QuotaExceededError' || err.code === 22)) stopped = true;
            }
            done++;
            var pct = month.urls.length ? Math.round((done / month.urls.length) * 100) : 100;
            updateMonthProgress(month.label, mi, pct, done, month.urls.length, bytesDone, bytesTotal);
          }
        }

        var workers = [];
        var workerCount = Math.min(6, month.urls.length);
        for (var w = 0; w < workerCount; w++) workers.push(worker());
        await Promise.all(workers);
      }
    } catch (_) {}
  }

  function finishCaching() {
    cacheComplete = true;
    activeGroupIndex = -1;
    updateOverall();
    if (bannerFinished) return;

    if (!progressStarted || !bannerVisible) {
      // Nothing needed caching, or the run finished before the page appeared.
      hideBanner(true);
      return;
    }

    bannerFinished = true;
    if (bannerTitle) bannerTitle.textContent = failedAssets ? 'Caching incomplete' : 'Assets cached';
    if (bannerPct) bannerPct.textContent = failedAssets ? '!' : '✓';
    if (bannerStatus) {
      // The payoff of the run is speed, so the "done" line promises that rather
      // than describing the cache itself.
      bannerStatus.textContent = failedAssets
        ? 'Some assets could not be cached'
        : 'Games and pages will load faster from now on';
    }
    setTimeout(function () { hideBanner(false); }, 2200);
  }

  function runGroup(label, fn) {
    return Promise.resolve()
      .then(fn)
      .then(function () {
        completedGroups = Math.min(GROUP_COUNT, completedGroups + 1);
        activeGroupIndex = -1;
        updateOverall();
      })
      .catch(function () {});
  }

  async function cacheVisibleAssets() {
    try {
      await runGroup('Caching backgrounds:', cacheBackgroundImages);
      await runGroup('Caching logos:', cacheLogoImages);
      await runGroup('Caching games:', cacheGameImages);
      await runGroup('Caching default backgrounds:', cacheDefaultBackgrounds);
    } finally {
      finishCaching();
    }
  }

  /* ------------------------------------------------------------------ *
   * Boot
   * ------------------------------------------------------------------ */

  if (!inlineMode) buildSplash();
  if (appShell || inlineMode) {
    buildBanner();
    // Caching starts immediately at boot and runs behind the splash. The banner
    // reveals itself only once there is real work to show, and (in the app)
    // only after the splash has lifted.
    cacheVisibleAssets();
  }

  if (!inlineMode) {
    setTimeout(function () {
      if (!splashHidden) hideSplash();
    }, 90000);
  }
})();
