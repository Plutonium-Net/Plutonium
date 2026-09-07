(function () {
  'use strict';
  var ua = (navigator.userAgent || '').toLowerCase();
  var uaData = navigator.userAgentData;
  var isMobile = uaData && typeof uaData.mobile === 'boolean' ? uaData.mobile : false;

  if (!isMobile) {
    isMobile = /android|iphone|ipod|ipad|windows phone|iemobile|blackberry|kindle|silk|opera mini|fennec|mobi|playbook|tablet|smart-?tv|googletv|roku/i.test(ua);
  }
  if (!isMobile && /macintosh/.test(ua) && navigator.maxTouchPoints > 1) {
    isMobile = true;
  }

  if (isMobile) {
    document.documentElement.classList.add('device-blocked');
    var overlay = document.getElementById('device-block-overlay');
    if (overlay) overlay.hidden = false;
  }
})();