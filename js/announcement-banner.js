/*
 * PlutoniumNotices: broadcast surfaces and the per-user inbox.
 *
 * Reads ONE document, `global/public/config/feed`, which the admin console
 * keeps up to date with the notices that are live or imminent. Reading the
 * announcement collection directly would cost one Firestore read per notice
 * per client, which is not affordable on the free plan.
 *
 * Same quota discipline as js/global-config.js: no timers, one fetch per
 * FEED_TTL_MS per browser, driven by page load and tab focus. Do not add an
 * interval.
 */

(function () {
  'use strict';

  var FEED_KEY = 'plu_gfeed';
  var FEED_TTL_MS = 15 * 60 * 1000;
  var DISMISS_PREFIX = 'plu_ann_dismissed_';

  var feed = [];
  var feedAt = 0;
  var inFlight = null;

  /* ------------------------------------------------------------------ *
   * Toast
   * ------------------------------------------------------------------ */

  var toastEl = null;
  var toastTimer = null;

  function toast(message, ms) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.setAttribute('role', 'status');
      toastEl.style.cssText = [
        'position:fixed', 'left:50%', 'bottom:26px', 'transform:translateX(-50%)',
        'max-width:min(520px,88vw)', 'padding:11px 16px', 'border-radius:10px',
        'background:rgba(12,12,18,.96)', 'color:#e8e8ef', 'font-size:13px',
        'line-height:1.5', 'box-shadow:0 8px 28px rgba(0,0,0,.45)',
        'border:1px solid #2a2a38', 'z-index:2147483000', 'text-align:center',
      ].join(';');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = String(message);
    toastEl.style.display = 'block';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.style.display = 'none'; }, ms || 4200);
  }

  /* ------------------------------------------------------------------ *
   * Feed
   * ------------------------------------------------------------------ */

  function workerUrl() {
    try {
      if (window.PlutoniumStore && PlutoniumStore.WORKER_URL) {
        return String(PlutoniumStore.WORKER_URL).replace(/\/+$/, '');
      }
    } catch (err) { /* fall through */ }
    return 'https://accounting.cdn.plutoniumnet.work';
  }

  function readCache() {
    try {
      var raw = localStorage.getItem(FEED_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) { return null; }
  }

  function writeCache(items) {
    try {
      localStorage.setItem(FEED_KEY, JSON.stringify({ at: Date.now(), items: items }));
    } catch (err) { /* ignore */ }
  }

  function decodeValue(value) {
    if (!value || typeof value !== 'object') return null;
    if ('nullValue' in value) return null;
    if ('booleanValue' in value) return value.booleanValue === true;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return Number(value.doubleValue);
    if ('stringValue' in value) return value.stringValue;
    if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
    if ('mapValue' in value) return decodeFields(value.mapValue.fields || {});
    return null;
  }

  function decodeFields(fields) {
    var out = {};
    Object.keys(fields || {}).forEach(function (key) { out[key] = decodeValue(fields[key]); });
    return out;
  }

  function isStale() { return !feedAt || (Date.now() - feedAt) > FEED_TTL_MS; }

  function loadFeed(force) {
    if (inFlight) return inFlight;
    if (!force && !isStale()) return Promise.resolve(feed);
    if (navigator.onLine === false) return Promise.resolve(feed);

    inFlight = fetch(workerUrl() + '/firestore/global/public/config/feed', { cache: 'no-store' })
      .then(function (res) {
        if (res.status === 404) return [];
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (doc) {
        var raw = doc && doc.fields ? decodeFields(doc.fields) : {};
        feed = Array.isArray(raw.items) ? raw.items : [];
        feedAt = Date.now();
        writeCache(feed);
        render();
        return feed;
      })
      .catch(function (err) {
        console.warn('[notices] feed unavailable:', err.message);
        return feed;
      })
      .finally(function () { inFlight = null; });

    return inFlight;
  }

  (function hydrate() {
    var cached = readCache();
    if (cached && Array.isArray(cached.items)) {
      feed = cached.items;
      feedAt = cached.at || 0;
    }
  })();

  /* ------------------------------------------------------------------ *
   * Audience and window filtering
   *
   * NOTE: audience predicates run here, in the browser, so a targeted notice
   * is readable by anyone who can fetch the feed. Private messages belong in
   * the per-user inbox, which is a different document entirely.
   * ------------------------------------------------------------------ */

  function currentUid() {
    try {
      var user = window.PlutoniumStore && PlutoniumStore.currentUser;
      return user ? user.uid : null;
    } catch (err) { return null; }
  }

  function currentBuild() {
    var meta = document.querySelector('meta[name="plu-build"]');
    var value = meta ? parseInt(meta.getAttribute('content'), 10) : 0;
    return Number.isFinite(value) ? value : 0;
  }

  function matches(notice, surface) {
    var now = Date.now();
    if ((notice.startsAt || 0) > now) return false;
    if (notice.endsAt && notice.endsAt <= now) return false;
    if (surface && Array.isArray(notice.surfaces) && notice.surfaces.indexOf(surface) === -1) return false;

    var audience = notice.audience || { all: true };
    if (audience.minBuild && currentBuild() < audience.minBuild) return false;

    var uid = currentUid();
    if (Array.isArray(audience.uids) && audience.uids.length) {
      if (!uid || audience.uids.indexOf(uid) === -1) return false;
    }
    if (Array.isArray(audience.notUids) && uid && audience.notUids.indexOf(uid) !== -1) return false;
    if (Array.isArray(audience.devices) && audience.devices.length) {
      var mobile = /android|iphone|ipod|ipad|windows phone|iemobile|mobile|tablet/i.test(navigator.userAgent || '');
      if (audience.devices.indexOf(mobile ? 'mobile' : 'desktop') === -1) return false;
    }
    return true;
  }

  function isDismissed(notice) {
    try {
      return localStorage.getItem(DISMISS_PREFIX + notice.id) === String(notice.rev || 1);
    } catch (err) { return false; }
  }

  function dismiss(notice) {
    try { localStorage.setItem(DISMISS_PREFIX + notice.id, String(notice.rev || 1)); } catch (err) { /* ignore */ }
  }

  /* ------------------------------------------------------------------ *
   * Maintenance takeover
   *
   * A class on `html` (`plu-maintenance`) plus a full-screen element.
   * ------------------------------------------------------------------ */

  var maintenanceEl = null;

  function renderMaintenance() {
    var config = window.PlutoniumConfig ? PlutoniumConfig.get() : null;
    var on = !!(config && config.maintenance && config.maintenance.enabled);

    if (!on) {
      if (maintenanceEl) {
        maintenanceEl.remove();
        maintenanceEl = null;
      }
      document.documentElement.classList.remove('plu-maintenance');
      return;
    }

    document.documentElement.classList.add('plu-maintenance');

    if (maintenanceEl) return; // already shown; just leave it up

    var message = config.maintenance.message || 'Plutonium is undergoing maintenance.';
    var eta = config.maintenance.eta || '';

    maintenanceEl = document.createElement('div');
    maintenanceEl.id = 'plu-maintenance';
    maintenanceEl.setAttribute('role', 'alertdialog');
    maintenanceEl.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:2147483600',
      'background:#07070a', 'color:#e8e8ef',
      'display:flex', 'align-items:center', 'justify-content:center',
      'padding:32px', 'text-align:center',
    ].join(';');

    var card = document.createElement('div');
    card.style.cssText = 'max-width:420px';

    var title = document.createElement('h1');
    title.textContent = 'Back shortly';
    title.style.cssText = 'margin:0 0 10px;font-size:22px;letter-spacing:-.01em';

    var body = document.createElement('p');
    body.textContent = message;
    body.style.cssText = 'margin:0 0 8px;color:#9a9aab;line-height:1.6';

    card.appendChild(title);
    card.appendChild(body);

    if (eta) {
      var etaEl = document.createElement('p');
      etaEl.textContent = eta;
      etaEl.style.cssText = 'margin:0;color:#9a9aab;font-size:13px;opacity:.8';
      card.appendChild(etaEl);
    }

    var retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Try again';
    retry.style.cssText = [
      'margin-top:20px', 'padding:9px 18px', 'border-radius:9px', 'border:0',
      'background:#e8175d', 'color:#fff', 'font-size:13px', 'font-weight:600', 'cursor:pointer',
    ].join(';');
    retry.addEventListener('click', function () {
      if (window.PlutoniumConfig) PlutoniumConfig.load(true);
      setTimeout(function () { location.reload(); }, 600);
    });
    card.appendChild(retry);

    maintenanceEl.appendChild(card);
    document.body.appendChild(maintenanceEl);
  }

  /* ------------------------------------------------------------------ *
   * Banner
   * ------------------------------------------------------------------ */

  var bannerEl = null;

  function renderBanner() {
    var config = window.PlutoniumConfig ? PlutoniumConfig.get() : null;

    var text = config && config.content ? config.content.banner : null;
    var notice = null;

    if (!text) {
      var candidates = feed.filter(function (item) { return matches(item, 'banner'); });
      notice = candidates[0] || null;
      if (notice) text = notice.title || notice.body;
    }

    if (!text || (notice && isDismissed(notice))) {
      if (bannerEl) { bannerEl.remove(); bannerEl = null; }
      return;
    }

    if (bannerEl) {
      var label = bannerEl.querySelector('[data-plu-banner-text]');
      if (label) label.textContent = text;
      return;
    }

    bannerEl = document.createElement('div');
    bannerEl.id = 'plu-announcement-banner';
    bannerEl.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:2147483500',
      'display:flex', 'align-items:center', 'gap:12px',
      'padding:9px 14px', 'background:#101018', 'color:#e8e8ef',
      'border-bottom:1px solid #23232f', 'font-size:13px',
    ].join(';');

    var dot = document.createElement('span');
    dot.style.cssText = 'width:7px;height:7px;border-radius:50%;background:#e8175d;flex:none';

    var label = document.createElement('span');
    label.setAttribute('data-plu-banner-text', '1');
    label.textContent = text;
    label.style.cssText = 'flex:1;min-width:0';

    bannerEl.appendChild(dot);
    bannerEl.appendChild(label);

    if (notice && notice.cta && notice.cta.url) {
      var link = document.createElement('a');
      link.href = notice.cta.url;
      link.textContent = notice.cta.label || 'Details';
      link.style.cssText = 'color:#e8175d;font-weight:600;text-decoration:none;flex:none';
      bannerEl.appendChild(link);
    }

    if (!notice || notice.dismissible) {
      var close = document.createElement('button');
      close.type = 'button';
      close.textContent = 'Dismiss';
      close.style.cssText = [
        'border:0', 'background:transparent', 'color:#8b8b9c', 'cursor:pointer',
        'font-size:12px', 'flex:none',
      ].join(';');
      close.addEventListener('click', function () {
        if (notice) dismiss(notice);
        else {
          // A banner set directly in the config has no id; remember its text.
          try { localStorage.setItem(DISMISS_PREFIX + 'banner:' + text, '1'); } catch (err) { /* ignore */ }
        }
        renderBanner();
      });
      bannerEl.appendChild(close);
    }

    document.body.appendChild(bannerEl);
  }

  /* ------------------------------------------------------------------ *
   * Per-user inbox
   *
   * The correct home for anything addressed to one person: it lives in that
   * user's own document, so unlike a targeted announcement nobody else can
   * read it.
   * ------------------------------------------------------------------ */

  function runAction(kind) {
    if (kind === 'relink') { location.href = 'account.html'; return; }
    if (kind === 'signout') {
      if (window.PlutoniumStore && PlutoniumStore.signOut) {
        PlutoniumStore.signOut().then(function () { location.reload(); });
      }
      return;
    }
    if (kind === 'resync') {
      // Drop the local snapshots so the cloud copies are pulled down again.
      // Deliberately narrow: user-authored content is never touched.
      ['plu_tabs', 'plu_recent'].forEach(function (key) {
        try { localStorage.removeItem(key); } catch (err) { /* ignore */ }
      });
      toast('Local sync state cleared. Reloading...');
      setTimeout(function () { location.reload(); }, 900);
      return;
    }
    toast('Dismissed.');
  }

  function renderInbox() {
    var existing = document.getElementById('plu-inbox');
    if (existing) existing.remove();

    if (!window.PlutoniumStore || !PlutoniumStore.currentUser) return;
    if (typeof PlutoniumStore.getDoc !== 'function') return;

    PlutoniumStore.getDoc('notices').then(function (doc) {
      var items = doc && Array.isArray(doc.items) ? doc.items : [];
      if (!items.length) return;

      var host = document.getElementById('plu-inbox');
      if (host) host.remove();

      host = document.createElement('div');
      host.id = 'plu-inbox';
      host.style.cssText = [
        'position:fixed', 'right:18px', 'bottom:18px', 'z-index:2147483400',
        'width:min(340px,86vw)', 'display:flex', 'flex-direction:column', 'gap:8px',
      ].join(';');

      items.slice(0, 3).forEach(function (item) {
        var card = document.createElement('div');
        card.style.cssText = [
          'background:#101018', 'border:1px solid #23232f', 'border-left:3px solid #e8175d',
          'border-radius:10px', 'padding:12px 14px', 'color:#e8e8ef', 'font-size:13px',
          'box-shadow:0 10px 30px rgba(0,0,0,.4)',
        ].join(';');

        var title = document.createElement('div');
        title.textContent = item.title || 'Message';
        title.style.cssText = 'font-weight:600;margin-bottom:4px';

        var body = document.createElement('div');
        body.textContent = item.body || '';
        body.style.cssText = 'color:#9a9aab;line-height:1.55;white-space:pre-wrap';

        card.appendChild(title);
        card.appendChild(body);

        var actions = document.createElement('div');
        actions.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:10px';

        if (item.action && item.action.kind && item.action.kind !== 'none') {
          var run = document.createElement('button');
          run.type = 'button';
          run.textContent = item.action.label || 'Do it';
          run.style.cssText = [
            'border:0', 'background:#e8175d', 'color:#fff', 'border-radius:8px',
            'padding:6px 12px', 'font-size:12px', 'font-weight:600', 'cursor:pointer',
          ].join(';');
          run.addEventListener('click', function () { runAction(item.action.kind); });
          actions.appendChild(run);
        }

        var dismiss = document.createElement('button');
        dismiss.type = 'button';
        dismiss.textContent = 'Dismiss';
        dismiss.style.cssText = [
          'border:1px solid #23232f', 'background:transparent', 'color:#8b8b9c',
          'border-radius:8px', 'padding:6px 12px', 'font-size:12px', 'cursor:pointer',
        ].join(';');
        dismiss.addEventListener('click', function () {
          card.remove();
          items = items.map(function (i) {
            return i.id === item.id ? Object.assign({}, i, { read: true }) : i;
          });
          // Best effort: the message is already gone from the screen, and a
          // failed write simply shows it again next visit.
          PlutoniumStore.setDoc('notices', { items: items }).catch(function () {});
          if (!host.children.length) host.remove();
        });
        actions.appendChild(dismiss);

        card.appendChild(actions);
        host.appendChild(card);
      });

      if (host.children.length) document.body.appendChild(host);
    }).catch(function (err) {
      console.warn('[notices] inbox unavailable:', err.message);
    });
  }

  /* ------------------------------------------------------------------ *
   * Render everything
   * ------------------------------------------------------------------ */

  function render() {
    if (!document.body) return;
    try { renderMaintenance(); } catch (err) { console.warn('[notices] maintenance failed', err); }
    try { renderBanner(); } catch (err) { console.warn('[notices] banner failed', err); }
  }

  /* ------------------------------------------------------------------ *
   * Lifecycle
   * ------------------------------------------------------------------ */

  function start() {
    loadFeed(false);
    render();

    if (window.PlutoniumConfig) {
      PlutoniumConfig.onChange(render);
    }

    if (window.PlutoniumStore && typeof PlutoniumStore.onAuthChange === 'function') {
      PlutoniumStore.onAuthChange(function (user) { if (user) renderInbox(); });
    }

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && isStale()) loadFeed(false);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  window.PlutoniumNotices = {
    toast: toast,
    loadFeed: loadFeed,
    getFeed: function () { return feed; },
    /** Notices to merge into the news ticker. */
    tickerItems: function () {
      return feed
        .filter(function (item) { return matches(item, 'ticker') && !isDismissed(item); })
        .map(function (item) {
          return { title: item.title || '', desc: item.body || '' };
        });
    },
  };
})();
