/**
 * bg-init.js — Plutonium background manager
 * Handles particles.js and all Vanta.js effects.
 * Must be loaded at the bottom of <body>, after all Vanta/Three/p5 scripts.
 * Exposes window.PluBG.init() and window.PluBG.destroy().
 */
(function () {
  'use strict';

  var VANTA_KEY = {
    birds:    'BIRDS',
    fog:      'FOG',
    waves:    'WAVES',
    clouds:   'CLOUDS',
    globe:    'GLOBE',
    net:      'NET',
    trunk:    'TRUNK',
    topology: 'TOPOLOGY',
    dots:     'DOTS',
    rings:    'RINGS',
    halo:     'HALO',
  };

  var _instance = null;

  function hexToInt(hex) {
    return parseInt((hex || '#000000').replace('#', ''), 16);
  }

  function hexToRgb(hex) {
    var n = hexToInt(hex);
    return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
  }

  function darken(hex, factor) {
    var c = hexToRgb(hex);
    return ((Math.round(c.r * factor) << 16) | (Math.round(c.g * factor) << 8) | Math.round(c.b * factor));
  }

  function lighten(hex, factor) {
    var c = hexToRgb(hex);
    return (((Math.round(c.r + (255 - c.r) * factor)) << 16) |
            ((Math.round(c.g + (255 - c.g) * factor)) << 8) |
             (Math.round(c.b + (255 - c.b) * factor)));
  }

  function destroy() {
    if (_instance) {
      try { _instance.destroy(); } catch (_) {}
      _instance = null;
    }
    var el = document.getElementById('vanta-bg');
    if (el) {
      var canvases = el.querySelectorAll('canvas');
      for (var i = 0; i < canvases.length; i++) {
        canvases[i].parentNode.removeChild(canvases[i]);
      }
    }
  }

  function _launchParticles(s, color) {
    if (typeof particlesJS === 'undefined') return;
    try {
      particlesJS('particles-js', {
        particles: {
          number: { value: s.particleDensity || 80, density: { enable: true, value_area: 800 } },
          color: { value: color },
          shape: { type: 'circle' },
          opacity: { value: s.particleOpacity || 0.4, random: true, anim: { enable: true, speed: 0.6, opacity_min: 0.1, sync: false } },
          size: { value: 2.5, random: true, anim: { enable: false } },
          line_linked: { enable: true, distance: 150, color: color, opacity: 0.12, width: 1 },
          move: { enable: true, speed: s.particleSpeed || 1.2, direction: 'none', random: true, straight: false, out_mode: 'out', bounce: false }
        },
        interactivity: {
          detect_on: 'canvas',
          events: { onhover: { enable: true, mode: 'repulse' }, onclick: { enable: false }, resize: true },
          modes: { repulse: { distance: 100, duration: 0.4 } }
        },
        retina_detect: true
      });
    } catch (e) {}
  }

  function _launchVanta(style, color, vantaEl) {
    var key = VANTA_KEY[style];
    if (!key || !window.VANTA || !window.VANTA[key]) return;

    vantaEl.style.width  = window.innerWidth  + 'px';
    vantaEl.style.height = window.innerHeight + 'px';

    var colorInt = hexToInt(color);
    var opts = {
      el:              vantaEl,
      THREE:           window.THREE,
      p5:              window.p5,
      mouseControls:   true,
      touchControls:   true,
      gyroControls:    false,
      backgroundColor: 0x000000,
      color:           colorInt,
      color1:          colorInt,
      color2:          colorInt,
    };

    switch (style) {
      case 'birds':
        opts.colorMode = 'lerp';
        opts.quantity  = 3;
        break;
      case 'fog':
        opts.highlightColor = lighten(color, 0.18);
        opts.midtoneColor   = darken(color, 0.45);
        opts.lowlightColor  = darken(color, 0.15);
        opts.baseColor      = 0x000000;
        opts.blurFactor = 0.7; opts.speed = 0.8; opts.zoom = 1.0;
        break;
      case 'waves':
        opts.color      = darken(color, 0.35);
        opts.color1     = darken(color, 0.35);
        opts.color2     = darken(color, 0.35);
        opts.shininess  = 20;
        opts.waveSpeed  = 0.5; opts.waveHeight = 12; opts.zoom = 0.85;
        break;
      case 'net':
        opts.points = 9; opts.maxDistance = 20; opts.spacing = 17;
        break;
      case 'globe':
        opts.size = 1;
        break;
      case 'dots':
        opts.size = 3; opts.spacing = 35; opts.showLines = true;
        break;
      case 'halo':
        opts.baseColor  = colorInt;
        opts.color2     = lighten(color, 0.55);
        opts.size = 1.5; opts.amplitudeFactor = 1; opts.xOffset = 0; opts.yOffset = 0;
        break;
      case 'trunk':
        opts.chaos = 1;
        break;
      case 'clouds':
        opts.skyColor         = darken(color, 0.08);
        opts.cloudColor       = darken(color, 0.2);
        opts.cloudShadowColor = 0x000000;
        opts.sunColor         = darken(color, 0.5);
        opts.sunGlareColor    = darken(color, 0.35);
        opts.sunlightColor    = darken(color, 0.4);
        opts.speed            = 0.8;
        break;
      case 'rings':
        // VANTA.RINGS ignores color option — uses a hardcoded prototype.colors array.
        // Reach the underlying class via a temp instance, patch, then destroy it.
        (function () {
          var tmp = document.createElement('div');
          tmp.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none';
          document.body.appendChild(tmp);
          var inst;
          try { inst = window.VANTA.RINGS({ el: tmp, THREE: window.THREE }); } catch(e) {}
          if (inst) {
            inst.constructor.prototype.colors = [
              colorInt,
              lighten(color, 0.15),
              lighten(color, 0.35),
              darken(color, 0.5),
              darken(color, 0.3),
              lighten(color, 0.55),
              darken(color, 0.7),
            ];
            try { inst.destroy(); } catch(e) {}
          }
          document.body.removeChild(tmp);
        })();
        break;
    }

    try {
      _instance = window.VANTA[key](opts);
      window.addEventListener('resize', function () {
        if (_instance) {
          vantaEl.style.width  = window.innerWidth  + 'px';
          vantaEl.style.height = window.innerHeight + 'px';
        }
      });
    } catch (e) {}
  }

  function init() {
    var s       = (window.PluSettings && window.PluSettings.load()) || {};
    var style   = s.bgStyle    || 'particles';
    var color   = s.accentColor || '#e8175d';
    var ptEl    = document.getElementById('particles-js');
    var vantaEl = document.getElementById('vanta-bg');
    var isParticles = (style === 'particles' && !s.disableParticles);
    var isVanta     = !!VANTA_KEY[style];

    destroy();

    if (ptEl)    ptEl.style.display    = isParticles ? 'block' : 'none';
    if (vantaEl) vantaEl.style.display = isVanta     ? 'block' : 'none';

    if (isParticles) {
      _launchParticles(s, color);
      return;
    }

    if (!isVanta || !vantaEl) return;

    requestAnimationFrame(function () {
      _launchVanta(style, color, vantaEl);
    });
  }

  window.PluBG = { init: init, destroy: destroy };

  init();

})();
