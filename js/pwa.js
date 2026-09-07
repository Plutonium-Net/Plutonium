(function () {
  'use strict';

  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker
    .register('/sw.js', { scope: '/' })
    .catch(function (err) {
      console.warn('Service worker registration failed:', err);
    });
})();