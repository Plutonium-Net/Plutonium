(function () {
  'use strict';

  function snapshot() {
    var out = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        out[k] = localStorage.getItem(k);
      }
    } catch (_) {}
    return out;
  }

  function sendSnapshot() {
    try {
      var saves = snapshot();
      window.parent.postMessage({ plu: true, type: 'plu_sync_data', saves: saves }, '*');
    } catch (_) {}
  }

  function applyRestore(saves) {
    if (!saves) return;
    try {
      var keys = Object.keys(saves);
      for (var i = 0; i < keys.length; i++) {
        localStorage.setItem(keys[i], saves[keys[i]]);
      }
    } catch (_) {}
  }

  var _debounce = null;
  function scheduleSnapshot() {
    clearTimeout(_debounce);
    _debounce = setTimeout(sendSnapshot, 800);
  }

  setInterval(sendSnapshot, 5000);

  var _origSetItem    = Storage.prototype.setItem;
  var _origRemoveItem = Storage.prototype.removeItem;
  var _origClear      = Storage.prototype.clear;

  try {
    Storage.prototype.setItem = function (key, value) {
      _origSetItem.call(this, key, value);
      if (this === localStorage) scheduleSnapshot();
    };
    Storage.prototype.removeItem = function (key) {
      _origRemoveItem.call(this, key);
      if (this === localStorage) scheduleSnapshot();
    };
    Storage.prototype.clear = function () {
      _origClear.call(this);
      if (this === localStorage) scheduleSnapshot();
    };
  } catch (_) {}

  window.addEventListener('message', function (e) {
    if (!e.data || !e.data.plu) return;
    if (e.data.type === 'plu_sync_restore') applyRestore(e.data.saves);
    if (e.data.type === 'plu_sync_request') sendSnapshot();
  });

  try {
    window.parent.postMessage({ plu: true, type: 'plu_sync_ready' }, '*');
  } catch (_) {}

})();
