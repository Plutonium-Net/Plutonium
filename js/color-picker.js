/**
 * Plutonium — Custom Color Picker
 * Replaces the native <input type="color"> for the accent-color swatch.
 * Exposes: window.PluColorPicker.init()
 */
(function () {
  'use strict';

  /* ── Helpers ──────────────────────────────────────────────── */

  function hexToHsv(hex) {
    var r = parseInt(hex.slice(1, 3), 16) / 255;
    var g = parseInt(hex.slice(3, 5), 16) / 255;
    var b = parseInt(hex.slice(5, 7), 16) / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var d = max - min;
    var h, s, v = max;
    s = max === 0 ? 0 : d / max;
    if (max === min) {
      h = 0;
    } else {
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return { h: h * 360, s: s, v: v };
  }

  function hsvToHex(h, s, v) {
    h = h / 360;
    var r, g, b;
    var i = Math.floor(h * 6);
    var f = h * 6 - i;
    var p = v * (1 - s);
    var q = v * (1 - f * s);
    var t = v * (1 - (1 - f) * s);
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
    }
    return '#' +
      Math.round(r * 255).toString(16).padStart(2, '0') +
      Math.round(g * 255).toString(16).padStart(2, '0') +
      Math.round(b * 255).toString(16).padStart(2, '0');
  }

  function isValidHex(v) {
    return /^#[0-9a-f]{6}$/i.test(v);
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  /* ── State ────────────────────────────────────────────────── */
  var hue = 0, sat = 1, val = 1;  // HSV: h 0-360, s/v 0-1

  /* ── DOM refs (set in init) ───────────────────────────────── */
  var picker, svCanvas, svCtx, hueCanvas, hueCtx;
  var svCursor, hueCursor, preview, hexInput, applyBtn;
  var triggerBtn, nativeInput;

  /* ── Drawing ──────────────────────────────────────────────── */

  var SV_W = 220, SV_H = 150, HUE_W = 220, HUE_H = 16;

  function drawSV() {
    svCtx.clearRect(0, 0, SV_W, SV_H);
    var gradH = svCtx.createLinearGradient(0, 0, SV_W, 0);
    gradH.addColorStop(0, '#fff');
    gradH.addColorStop(1, 'hsl(' + hue + ',100%,50%)');
    svCtx.fillStyle = gradH;
    svCtx.fillRect(0, 0, SV_W, SV_H);
    var gradV = svCtx.createLinearGradient(0, 0, 0, SV_H);
    gradV.addColorStop(0, 'rgba(0,0,0,0)');
    gradV.addColorStop(1, 'rgba(0,0,0,1)');
    svCtx.fillStyle = gradV;
    svCtx.fillRect(0, 0, SV_W, SV_H);
  }

  function drawHue() {
    var grad = hueCtx.createLinearGradient(0, 0, HUE_W, 0);
    for (var i = 0; i <= 360; i += 30) {
      grad.addColorStop(i / 360, 'hsl(' + i + ',100%,50%)');
    }
    hueCtx.fillStyle = grad;
    hueCtx.fillRect(0, 0, HUE_W, HUE_H);
  }

  function updateCursors() {
    // SV cursor — positioned inside .clr-sv-wrap (position:relative)
    svCursor.style.left = (sat * 100) + '%';
    svCursor.style.top  = ((1 - val) * 100) + '%';

    // Hue cursor — positioned inside .clr-hue-row (position:relative)
    hueCursor.style.left = ((hue / 360) * 100) + '%';
  }

  function updateBottom() {
    var hex = hsvToHex(hue, sat, val);
    preview.style.background = hex;
    hexInput.value = hex;
  }

  function fullUpdate() {
    drawSV();
    updateCursors();
    updateBottom();
  }

  /* ── Open / Close ─────────────────────────────────────────── */

  function openPicker() {
    var current = nativeInput.value || '#e8175d';
    var hsv = hexToHsv(current);
    hue = hsv.h; sat = hsv.s; val = hsv.v;

    picker.hidden = false;

    // Position below the trigger button
    var r = triggerBtn.getBoundingClientRect();
    var pw = 240;
    var left = clamp(r.left, 8, window.innerWidth - pw - 8);
    var top  = r.bottom + 8;
    if (top + 320 > window.innerHeight) top = r.top - 320 - 8;
    picker.style.left = left + 'px';
    picker.style.top  = top  + 'px';

    drawSV();
    drawHue();
    updateCursors();
    updateBottom();
  }

  function closePicker() {
    picker.hidden = true;
  }

  /* ── Drag helpers ─────────────────────────────────────────── */

  function makeDrag(onMove) {
    function move(e) {
      var touch = e.touches ? e.touches[0] : e;
      onMove(touch.clientX, touch.clientY);
    }
    function up() {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup',   up);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend',  up);
    }
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup',   up);
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend',  up);
    return move;
  }

  /* ── SV drag ──────────────────────────────────────────────── */

  function handleSV(cx, cy) {
    var rect = svCanvas.getBoundingClientRect();
    sat = clamp((cx - rect.left) / rect.width,  0, 1);
    val = 1 - clamp((cy - rect.top)  / rect.height, 0, 1);
    fullUpdate();
  }

  /* ── Hue drag ─────────────────────────────────────────────── */

  function handleHue(cx) {
    var rect = hueCanvas.getBoundingClientRect();
    hue = clamp((cx - rect.left) / rect.width, 0, 1) * 360;
    fullUpdate();
  }

  /* ── Apply ────────────────────────────────────────────────── */

  function applyColor(hex) {
    nativeInput.value = hex;
    // Fire both events so settings.js picks it up
    nativeInput.dispatchEvent(new Event('input',  { bubbles: true }));
    nativeInput.dispatchEvent(new Event('change', { bubbles: true }));
    closePicker();
  }

  /* ── Init ─────────────────────────────────────────────────── */

  function init() {
    picker     = document.getElementById('clr-picker');
    svCanvas   = document.getElementById('clr-sv');
    hueCanvas  = document.getElementById('clr-hue');
    svCursor   = document.getElementById('clr-sv-cursor');
    hueCursor  = document.getElementById('clr-hue-cursor');
    preview    = document.getElementById('clr-preview');
    hexInput   = document.getElementById('clr-hex');
    applyBtn   = document.getElementById('clr-apply');
    triggerBtn = document.getElementById('accent-custom-btn');
    nativeInput= document.getElementById('accent-custom-input');

    if (!picker || !triggerBtn) return;

    svCtx  = svCanvas.getContext('2d');
    hueCtx = hueCanvas.getContext('2d');

    // Scale canvases for devicePixelRatio
    var dpr = window.devicePixelRatio || 1;
    [{ c: svCanvas,  w: SV_W,  h: SV_H  },
     { c: hueCanvas, w: HUE_W, h: HUE_H }].forEach(function (item) {
      item.c.width  = item.w * dpr;
      item.c.height = item.h * dpr;
      item.c.style.width  = item.w + 'px';
      item.c.style.height = item.h + 'px';
      item.c.getContext('2d').scale(dpr, dpr);
    });

    /* Open */
    triggerBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!picker.hidden) { closePicker(); return; }
      openPicker();
    });

    /* SV canvas */
    svCanvas.addEventListener('mousedown', function (e) {
      e.preventDefault();
      handleSV(e.clientX, e.clientY);
      var move = makeDrag(function (cx, cy) { handleSV(cx, cy); });
      move(e);
    });
    svCanvas.addEventListener('touchstart', function (e) {
      e.preventDefault();
      var t = e.touches[0];
      handleSV(t.clientX, t.clientY);
      makeDrag(function (cx, cy) { handleSV(cx, cy); });
    }, { passive: false });

    /* Hue strip */
    hueCanvas.addEventListener('mousedown', function (e) {
      e.preventDefault();
      handleHue(e.clientX);
      makeDrag(function (cx) { handleHue(cx); });
    });
    hueCanvas.addEventListener('touchstart', function (e) {
      e.preventDefault();
      handleHue(e.touches[0].clientX);
      makeDrag(function (cx) { handleHue(cx); });
    }, { passive: false });

    /* Hex input */
    hexInput.addEventListener('input', function () {
      var v = hexInput.value.trim();
      if (!v.startsWith('#')) v = '#' + v;
      if (isValidHex(v)) {
        var hsv = hexToHsv(v);
        hue = hsv.h; sat = hsv.s; val = hsv.v;
        drawSV();
        updateCursors();
        preview.style.background = v;
      }
    });
    hexInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var v = hexInput.value.trim();
        if (!v.startsWith('#')) v = '#' + v;
        if (isValidHex(v)) applyColor(v);
      }
    });

    /* Apply button */
    applyBtn.addEventListener('click', function () {
      applyColor(hsvToHex(hue, sat, val));
    });

    /* Click outside to close */
    document.addEventListener('click', function (e) {
      if (!picker.hidden && !picker.contains(e.target) && e.target !== triggerBtn) {
        closePicker();
      }
    });

    /* Keep cursors in sync if window resizes */
    window.addEventListener('resize', function () {
      if (!picker.hidden) updateCursors();
    });
  }

  window.PluColorPicker = { init: init };
})();
