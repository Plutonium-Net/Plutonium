(function () {
  'use strict';

  var FULL =
    '<circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" stroke-width="2.5" opacity=".22"/>' +
    '<circle cx="50" cy="50" r="33" fill="none" stroke="currentColor" stroke-width="3" opacity=".6"/>' +
    '<rect x="30" y="33" width="40" height="27" rx="5" fill="none" stroke="currentColor" stroke-width="5"/>' +
    '<path d="M32 41h36" stroke="currentColor" stroke-width="2.5" opacity=".5"/>' +
    '<path d="M45.5 46l4.5 4.5-4.5 4.5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M52.5 55h4" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>' +
    '<path d="M50 60v7" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>' +
    '<path d="M42 70h16" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>' +
    '<circle cx="78.5" cy="33.5" r="4" fill="currentColor" opacity=".85"/>';

  var SIMPLE =
    '<circle cx="50" cy="50" r="33" fill="none" stroke="currentColor" stroke-width="4" opacity=".55"/>' +
    '<rect x="31" y="36" width="38" height="28" rx="6" fill="none" stroke="currentColor" stroke-width="6"/>' +
    '<rect x="40" y="46" width="20" height="7" rx="3.5" fill="currentColor"/>';

  function svg(size, simple) {
    var px = Math.max(1, Math.round(Number(size) || 26));
    return '<svg viewBox="0 0 100 100" width="' + px + '" height="' + px + '" aria-hidden="true">' +
      (simple ? SIMPLE : FULL) + '</svg>';
  }

  window.VmsMark = { svg: svg };
})();
