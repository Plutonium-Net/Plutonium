/* Register the root service worker so the browser treats the site as
   installable (Chrome requires a registered service worker before it
   shows the install prompt; Safari uses the manifest + apple-touch-icon). */
(function () {
  'use strict';

  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker
    .register('/sw.js', { scope: '/' })
    .catch(function (err) {
      console.warn('Service worker registration failed:', err);
    });
})();