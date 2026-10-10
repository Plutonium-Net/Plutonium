(function () {
  'use strict';

  /*
   * Device gating.
   *
   * Mobile is supported now (js/mobile-mode.js picks a layout, css/mobile.css
   * draws it), so this script no longer shuts phones out on its own. It is the
   * operator's kill-switch: `devices.blockMobile` in the global config brings
   * the old block screen back without a deploy, and `blockedUA` still matches
   * arbitrary user-agent fragments.
   *
   * Detection stays local: nothing about the user is transmitted. The
   * `device-blocked` class and the `device-block-overlay` element are
   * unchanged, so js/onboarding-redirect.js keeps working untouched.
   */

  function looksMobile () {
    // The layout picker already owns this heuristic; share it so a device can
    // never land in the mobile layout without also being covered by the gate.
    if (window.PlutoniumMobile && typeof PlutoniumMobile.isMobileDevice === 'function') {
      return PlutoniumMobile.isMobileDevice();
    }

    var ua = (navigator.userAgent || '').toLowerCase();
    var uaData = navigator.userAgentData;
    var isMobile = uaData && typeof uaData.mobile === 'boolean' ? uaData.mobile : false;

    if (!isMobile) {
      isMobile = /android|iphone|ipod|ipad|windows phone|iemobile|blackberry|kindle|silk|opera mini|fennec|mobi|playbook|tablet|smart-?tv|googletv|roku/i.test(ua);
    }
    if (!isMobile && /macintosh/.test(ua) && navigator.maxTouchPoints > 1) {
      isMobile = true;
    }
    return isMobile;
  }

  function matchesBlockedUA () {
    var config = window.PlutoniumConfig ? PlutoniumConfig.get() : null;
    var patterns = (config && config.devices && config.devices.blockedUA) || [];
    if (!patterns.length) return false;
    var ua = navigator.userAgent || '';
    for (var i = 0; i < patterns.length; i++) {
      if (patterns[i] && ua.indexOf(patterns[i]) !== -1) return true;
    }
    return false;
  }

  function apply () {
    var config = window.PlutoniumConfig ? PlutoniumConfig.get() : null;
    // Fail open: an unreachable control plane must not lock phones out of a
    // site that supports them. Only an explicit `blockMobile: true` blocks.
    var blockMobile = !!(config && config.devices && config.devices.blockMobile === true);

    var blocked = (blockMobile && looksMobile()) || matchesBlockedUA();

    document.documentElement.classList.toggle('device-blocked', blocked);
    var overlay = document.getElementById('device-block-overlay');
    if (overlay) overlay.hidden = !blocked;
  }

  apply();

  if (window.PlutoniumConfig) PlutoniumConfig.onChange(apply);
})();
