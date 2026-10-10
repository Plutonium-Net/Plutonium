/*
 * PlutoniumConfig: the global control-plane reader.
 *
 * One document, `global/public/config/state`, is world-readable. This module
 * fetches it and never blocks: a synchronous view of the defaults exists from
 * the moment the script runs, and the real values are applied when they arrive.
 * A feature that asks before the fetch lands gets the default, not an error.
 *
 * QUOTA DISCIPLINE (important, and the reason this file has no interval timer)
 * ---------------------------------------------------------------------------
 * Firestore's free plan allows roughly 50,000 document reads per day. A 5-minute
 * poll is 288 reads per user per day, which ~170 users would exhaust on config
 * alone. So this module fetches at most once per CACHE_TTL_MS per browser, on
 * page load and on returning to a visible tab, never on a timer. A user who
 * opens twenty pages in ten minutes causes exactly one read.
 *
 * Therefore: do NOT add setInterval here, and do not shorten CACHE_TTL_MS
 * without doing the multiplication first.
 *
 * Security note: these switches hide product surface. They are not a spend
 * control: a modified client can still call the underlying APIs directly.
 */

(function () {
  'use strict';

  var STORE_KEY = 'plu_gcfg';
  var CACHE_TTL_MS = 15 * 60 * 1000;

  /* Fallback only. The live value comes from PlutoniumStore.WORKER_URL, which
   * `js/cloud-store-config.js` sets. Keep the two in step. */
  var FALLBACK_WORKER = 'https://accounting.cdn.plutoniumnet.work';

  /* Which pluto:// page each feature hides. */
  var PAGE_FEATURES = {
    media: 'stream',
    cloud: 'cloudGaming',
    vms:   'vms',
    ai:    'ai',
  };

  function defaults() {
    return {
      configVersion: 0,
      updatedAt: 0,
      updatedBy: 'defaults',
      maintenance: { enabled: false, message: '', eta: '', failClosed: true },
      rollout: { minBuild: 0 },
      features: {
        stream:        { enabled: true, notice: '' },
        cloudGaming:   { enabled: true, notice: '' },
        vms:           { enabled: true, notice: '' },
        ai:            { enabled: true, notice: '' },
        personalGames: { enabled: true, notice: '' },
        proxyUV:       { enabled: true, notice: '' },
        proxyScramjet: { enabled: true, notice: '' },
        accounts:      { enabled: true, notice: '' },
      },
      theme:   { forced: false, preset: null, effect: null, image: null },
      content: { banner: null, announcements: true },
    };
  }

  /* ------------------------------------------------------------------ *
   * Firestore REST decoding
   *
   * The document comes back as typed values (mapValue/booleanValue/...), so it
   * has to be unwrapped before it looks like a plain object.
   * ------------------------------------------------------------------ */

  function decodeValue(value) {
    if (!value || typeof value !== 'object') return null;
    if ('nullValue' in value) return null;
    if ('booleanValue' in value) return value.booleanValue === true;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return Number(value.doubleValue);
    if ('stringValue' in value) return value.stringValue;
    if ('timestampValue' in value) return value.timestampValue;
    if ('arrayValue' in value) {
      return (value.arrayValue.values || []).map(decodeValue);
    }
    if ('mapValue' in value) return decodeFields(value.mapValue.fields || {});
    return null;
  }

  function decodeFields(fields) {
    var out = {};
    Object.keys(fields || {}).forEach(function (key) {
      out[key] = decodeValue(fields[key]);
    });
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Shallow merge over defaults, feature by feature, so a partially written
   * document can never remove a switch from the client's view.
   * ------------------------------------------------------------------ */

  function merge(raw) {
    var base = defaults();
    if (!raw || typeof raw !== 'object') return base;

    var out = defaults();
    out.configVersion = Number(raw.configVersion) || 0;
    out.updatedAt = Number(raw.updatedAt) || 0;
    out.updatedBy = typeof raw.updatedBy === 'string' ? raw.updatedBy : 'unknown';

    if (raw.maintenance && typeof raw.maintenance === 'object') {
      out.maintenance = {
        enabled: raw.maintenance.enabled === true,
        message: typeof raw.maintenance.message === 'string' ? raw.maintenance.message : '',
        eta: typeof raw.maintenance.eta === 'string' ? raw.maintenance.eta : '',
        failClosed: raw.maintenance.failClosed !== false,
      };
    }

    if (raw.rollout && typeof raw.rollout === 'object') {
      out.rollout.minBuild = Math.max(0, Number(raw.rollout.minBuild) || 0);
    }

    if (raw.features && typeof raw.features === 'object') {
      Object.keys(out.features).forEach(function (key) {
        var src = raw.features[key];
        if (src === undefined) return;
        if (typeof src === 'boolean') {
          out.features[key] = { enabled: src, notice: '' };
          return;
        }
        if (src && typeof src === 'object') {
          out.features[key] = {
            enabled: src.enabled !== false,
            notice: typeof src.notice === 'string' ? src.notice : '',
          };
        }
      });
    }

    if (raw.theme && typeof raw.theme === 'object') {
      out.theme = {
        forced: raw.theme.forced === true,
        preset: typeof raw.theme.preset === 'string' ? raw.theme.preset : null,
        effect: typeof raw.theme.effect === 'string' ? raw.theme.effect : null,
        image:  typeof raw.theme.image === 'string' ? raw.theme.image : null,
      };
    }

    if (raw.content && typeof raw.content === 'object') {
      out.content = {
        banner: typeof raw.content.banner === 'string' ? raw.content.banner : null,
        announcements: raw.content.announcements !== false,
      };
    }

    return out;
  }

  /* ------------------------------------------------------------------ *
   * Cache
   * ------------------------------------------------------------------ */

  function readCache() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch (err) {
      return null;
    }
  }

  function writeCache(config) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ at: Date.now(), config: config }));
    } catch (err) { /* private mode, quota: both harmless */ }
  }

  function workerUrl() {
    try {
      if (window.PlutoniumStore && PlutoniumStore.WORKER_URL) {
        return String(PlutoniumStore.WORKER_URL).replace(/\/+$/, '');
      }
    } catch (err) { /* fall through */ }
    return FALLBACK_WORKER;
  }

  /* ------------------------------------------------------------------ *
   * State
   * ------------------------------------------------------------------ */

  var current = defaults();
  var listeners = [];
  var inFlight = null;
  var loadedAt = 0;

  function emit() {
    listeners.slice().forEach(function (cb) {
      try { cb(current); } catch (err) { console.warn('[config] listener failed', err); }
    });
    try {
      window.dispatchEvent(new CustomEvent('plu-config', { detail: current }));
    } catch (err) { /* no CustomEvent support */ }
  }

  function adopt(config, source) {
    current = config;
    loadedAt = Date.now();
    if (source === 'network') writeCache(config);
    try { applyDom(); } catch (err) { console.warn('[config] applyDom failed', err); }
    emit();
    return current;
  }

  /* Restore the cached copy synchronously so gates are right on first paint. */
  (function hydrate() {
    var cached = readCache();
    if (cached && cached.config) current = merge(cached.config);
  })();

  /* ------------------------------------------------------------------ *
   * Fetch
   * ------------------------------------------------------------------ */

  function fetchConfig() {
    if (inFlight) return inFlight;

    if (navigator.onLine === false) {
      return Promise.resolve(current);
    }

    inFlight = fetch(workerUrl() + '/firestore/global/public/config/state', { cache: 'no-store' })
      .then(function (res) {
        if (res.status === 404) return null;          // never written yet
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (doc) {
        var raw = doc && doc.fields ? decodeFields(doc.fields) : null;
        // A 404 or an empty document means "defaults", not "error".
        return adopt(merge(raw), raw ? 'network' : 'defaults');
      })
      .catch(function (err) {
        // Fail open: keep whatever we already have. A control plane that is
        // unreachable must not take the product down with it.
        console.warn('[config] load failed, keeping current values:', err.message);
        return current;
      })
      .finally(function () { inFlight = null; });

    return inFlight;
  }

  function isStale() {
    return !loadedAt || (Date.now() - loadedAt) > CACHE_TTL_MS;
  }

  /** Load if stale (or forced). Always resolves; never rejects. */
  function load(force) {
    if (!force && !isStale()) return Promise.resolve(current);
    return fetchConfig();
  }

  /* ------------------------------------------------------------------ *
   * Public read API
   * ------------------------------------------------------------------ */

  function feature(key) {
    return current.features[key] || { enabled: true, notice: '' };
  }

  function enabled(key) {
    return feature(key).enabled !== false;
  }

  function noticeFor(key) {
    var f = feature(key);
    return f.notice || 'This feature is temporarily unavailable.';
  }

  /** Is this pluto:// page key allowed right now? */
  function pageAllowed(pageKey) {
    var mapped = PAGE_FEATURES[pageKey];
    if (!mapped) return true;
    return enabled(mapped);
  }

  function isMaintenance() {
    return current.maintenance.enabled === true;
  }

  /* ------------------------------------------------------------------ *
   * DOM application
   *
   * Every gate is expressed as either an attribute or a class, so the console
   * can turn a feature off without any page knowing about it in advance.
   * ------------------------------------------------------------------ */

  function applyDom() {
    var root = document.documentElement;

    Object.keys(current.features).forEach(function (key) {
      root.classList.toggle('plu-gate-' + key, !current.features[key].enabled);
    });

    // Hide page tiles and launcher entries for a disabled page.
    Object.keys(PAGE_FEATURES).forEach(function (pageKey) {
      var allowed = pageAllowed(pageKey);
      var nodes = document.querySelectorAll('[data-local-uri^="pluto://' + pageKey + '"]');
      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if (allowed) {
          if (node.getAttribute('data-plu-gated') === '1') {
            node.removeAttribute('data-plu-gated');
            node.style.removeProperty('display');
          }
        } else {
          node.setAttribute('data-plu-gated', '1');
          node.style.display = 'none';
        }
      }
    });

    // Any element the page tags with data-plu-feature is hidden with it.
    Object.keys(current.features).forEach(function (key) {
      var off = !current.features[key].enabled;
      var nodes = document.querySelectorAll('[data-plu-feature="' + key + '"]');
      for (var i = 0; i < nodes.length; i++) {
        nodes[i].style.display = off ? 'none' : '';
      }
    });
  }

  /* Expose so pages that render tiles later (games, pins) can re-apply. */
  function refresh() {
    applyDom();
  }

  /* ------------------------------------------------------------------ *
   * Lifecycle
   * ------------------------------------------------------------------ */

  // Fetch immediately; retry once the DOM is ready if the worker URL was not
  // configured yet (it is set by a later script tag).
  load(true);

  function kickIfStale() {
    if (isStale()) load(false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      applyDom();
      kickIfStale();
    });
  } else {
    applyDom();
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') kickIfStale();
  });

  window.addEventListener('online', kickIfStale);

  window.PlutoniumConfig = {
    load: load,
    refresh: refresh,
    onChange: function (cb) {
      if (typeof cb !== 'function') return function () {};
      listeners.push(cb);
      try { cb(current); } catch (err) { console.warn('[config] listener failed', err); }
      return function () {
        listeners = listeners.filter(function (l) { return l !== cb; });
      };
    },
    get: function () { return current; },
    feature: feature,
    enabled: enabled,
    noticeFor: noticeFor,
    pageAllowed: pageAllowed,
    pageFeatures: PAGE_FEATURES,
    isMaintenance: isMaintenance,
    defaults: defaults,
    ttlMs: CACHE_TTL_MS,
  };
})();
