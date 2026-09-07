(function () {
  'use strict';
  if (localStorage.getItem('plu_onboarded') === '1') return;
  if (document.documentElement.classList.contains('device-blocked')) return;
  function go() { location.replace('onboarding.html'); }
  if (window.__pluBootDone) go();
  else window.addEventListener('plu-boot-done', go);
})();