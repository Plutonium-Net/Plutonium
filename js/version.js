(function () {
  'use strict';

  var meta = document.querySelector('meta[name="plu-build"]');
  if (!meta) return;
  var current = parseInt(meta.getAttribute('content'), 10);
  if (!(current > 0)) return;

  var KEY = 'plu_build_version';
  var stored = null;
  try { stored = localStorage.getItem(KEY); } catch (_) {}

  function showModal() {
    var banner = document.createElement('div');
    banner.id = 'update-banner';
    banner.setAttribute('role', 'alert');
    banner.innerHTML =
      '<div class="update-banner__card">' +
        '<div class="update-banner__header">' +
          '<span class="update-banner__badge"><i class="fa-solid fa-rotate"></i></span>' +
          '<h2 class="update-banner__title">An Update Is Required</h2>' +
        '</div>' +
        '<p class="update-banner__body">Press <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>R</kbd><span class="update-banner__mac">(or <kbd>Command</kbd> + <kbd>Shift</kbd> + <kbd>R</kbd> on Mac)</span></p>' +
        '<div class="update-banner__actions">' +
          '<button class="update-banner__btn" type="button">Try Again</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(banner);
    banner.querySelector('.update-banner__btn').addEventListener('click', function () {
      try { localStorage.setItem(KEY, String(current)); } catch (_) {}
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then(function (reg) {
          if (reg) reg.update();
        }).catch(function () {});
      }
      location.reload();
    });
  }

  function getSwVersion() {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
      return Promise.resolve(null);
    }
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () { done = true; resolve(null); }, 1200);
      function onMsg(e) {
        if (done) return;
        if (e.data && e.data.type === 'plu-build-version') {
          done = true;
          clearTimeout(timer);
          navigator.serviceWorker.removeEventListener('message', onMsg);
          resolve(e.data.version);
        }
      }
      navigator.serviceWorker.addEventListener('message', onMsg);
      navigator.serviceWorker.controller.postMessage({ type: 'plu-get-build-version' });
    });
  }

  getSwVersion().then(function (swVer) {
    if (swVer !== null) {
      if (swVer < current) showModal();
      else {
        try { localStorage.setItem(KEY, String(current)); } catch (_) {}
      }
      return;
    }
    if (stored === null || parseInt(stored, 10) < current) showModal();
  });
})();