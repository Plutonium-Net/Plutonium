/**
 * Lightfall — vanilla WebGL background for the new-tab page.
 * Theme colours match the Plutonium pink/black palette.
 *
 * Usage:
 *   const lf = initLightfall(canvasElement);
 *   lf.start();   // begin animation
 *   lf.stop();    // pause (no GPU work)
 *   lf.destroy(); // release all GL resources
 */

const _VERT = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const _FRAG = `
precision highp float;

uniform vec2  iResolution;
uniform vec2  iMouse;
uniform float iTime;

// ── palette (8 slots) ──────────────────────────────────────────
uniform vec3 uColor0;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec3 uColor4;
uniform vec3 uColor5;
uniform vec3 uColor6;
uniform vec3 uColor7;
uniform int  uColorCount;

uniform vec3  uBgColor;
uniform vec3  uMouseColor;
uniform float uSpeed;
uniform int   uStreakCount;
uniform float uStreakWidth;
uniform float uStreakLength;
uniform float uGlow;
uniform float uDensity;
uniform float uTwinkle;
uniform float uZoom;
uniform float uBgGlow;
uniform float uMouseStrength;
uniform float uMouseRadius;

vec3 palette(float h) {
  int n = uColorCount;
  if (n < 1) n = 1;
  int i = int(floor(clamp(h, 0.0, 0.999999) * float(n)));
  if (i <= 0) return uColor0;
  if (i == 1) return uColor1;
  if (i == 2) return uColor2;
  if (i == 3) return uColor3;
  if (i == 4) return uColor4;
  if (i == 5) return uColor5;
  if (i == 6) return uColor6;
  return uColor7;
}

vec3 tanhv(vec3 x) {
  vec3 e = exp(-2.0 * x);
  return (1.0 - e) / (1.0 + e);
}

vec2 sceneC(vec2 frag, vec2 r) {
  vec2 P = (frag + frag - r) / r.x;
  float z = 0.0;
  float d = 1e3;
  vec4 O = vec4(0.0);
  for (int k = 0; k < 39; k++) {
    if (d <= 1e-4) break;
    O = z * normalize(vec4(P, uZoom, 0.0)) - vec4(0.0, 4.0, 1.0, 0.0) / 4.5;
    d = 1.0 - sqrt(length(O * O));
    z += d;
  }
  return vec2(O.x, atan(O.z, O.y));
}

void main() {
  vec2 r  = iResolution;
  vec2 fc = gl_FragCoord.xy;
  vec2 uv0 = (fc + fc - r) / r.x;

  float T       = 0.1 * iTime * uSpeed + 9.0;
  float angRings = max(1.0, floor(6.28318530718 * max(uDensity, 0.05) + 0.5));
  vec2  Y        = vec2(5e-3, 6.28318530718 / angRings);

  // scene coords + screen-space derivatives for antialiasing
  vec2 c0  = sceneC(fc, r);
  vec2 cdx = sceneC(fc + vec2(1.0, 0.0), r);
  vec2 cdy = sceneC(fc + vec2(0.0, 1.0), r);
  vec2 dCx = cdx - c0;
  vec2 dCy = cdy - c0;
  dCx.y -= 6.28318530718 * floor(dCx.y / 6.28318530718 + 0.5);
  dCy.y -= 6.28318530718 * floor(dCy.y / 6.28318530718 + 0.5);
  vec2 fw = abs(dCx) + abs(dCy);
  vec2 C  = c0;

  // background glow
  vec2 P2 = vec2(2.0, 1.0) * uv0 - (r / r.x) * vec2(0.0, 1.0);
  vec4 O  = vec4(uBgColor * 90.0 * uBgGlow / (1e3 * dot(P2, P2) + 6.0), 0.0);

  // mouse glow
  float mGlow = 0.0;
  vec2  mN    = (iMouse + iMouse - r) / r.x;
  float md    = length(uv0 - mN);
  float mr2   = max(uMouseRadius * uMouseRadius, 1e-4);
  mGlow = exp(-md * md / mr2) * uMouseStrength;
  O.rgb += uMouseColor * mGlow * 0.25;

  // streaks
  float zr   = 5e-4 * uStreakWidth;
  vec2  rr   = vec2(max(length(fw), 1e-5));
  float tail = 19.0 / max(uStreakLength, 0.05);

  for (int m = 0; m < 16; m++) {
    if (m >= uStreakCount) break;
    float jf  = float(m) + 1.0;
    float ic  = fract(sin(dot(vec2(jf, floor(C.x / Y.x + 0.5)), vec2(7.0, 11.0)) * 73.0));
    vec2  Pp  = C - (T + T * ic) * vec2(0.0, 1.0);
    Pp -= floor(Pp / Y + 0.5) * Y;
    float h      = fract(8663.0 * ic);
    vec3  col    = palette(h);
    float weight = mix(1.5, 1.0 + sin(T + 7.0 * h + 4.0), uTwinkle);
    weight *= (1.0 + mGlow * 2.0);
    vec2  inner  = vec2(length(max(Pp, vec2(-1.0, 0.0))), length(Pp) - zr) - zr;
    vec2  sm     = vec2(1.0) - smoothstep(-rr, rr, inner);
    O.rgb += dot(sm, vec2(exp(tail * Pp.y), 3.0)) * col * weight;
    C.x  += Y.x / 8.0;
  }

  vec3 colr = sqrt(tanhv(max(O.rgb * uGlow - vec3(0.04, 0.08, 0.02), 0.0)));
  gl_FragColor = vec4(colr, 1.0);
}
`;

function _hex(h) {
  const s = h.replace('#', '').padEnd(6, '0');
  return [
    parseInt(s.slice(0, 2), 16) / 255,
    parseInt(s.slice(2, 4), 16) / 255,
    parseInt(s.slice(4, 6), 16) / 255
  ];
}

function _compileShader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
    console.error('[lightfall] shader error:', gl.getShaderInfoLog(sh));
  return sh;
}

function _buildProgram(gl) {
  const vs  = _compileShader(gl, gl.VERTEX_SHADER,   _VERT);
  const fs  = _compileShader(gl, gl.FRAGMENT_SHADER, _FRAG);
  const prg = gl.createProgram();
  gl.attachShader(prg, vs);
  gl.attachShader(prg, fs);
  gl.linkProgram(prg);
  if (!gl.getProgramParameter(prg, gl.LINK_STATUS))
    console.error('[lightfall] link error:', gl.getProgramInfoLog(prg));
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prg;
}

/**
 * @param {HTMLCanvasElement} canvas
 */
function initLightfall(canvas) {
  // ── Theme colours (derived from user accent colour) ────────────────────
  function _darkenHex(hex, f) {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    const toH = v => Math.max(0,Math.round(v*f)).toString(16).padStart(2,'0');
    return '#' + toH(r) + toH(g) + toH(b);
  }
  const accent = (window.PluSettings && window.PluSettings.load().accentColor) || '#e8175d';
  const COLORS = [
    _darkenHex(accent, 0.55),  // deep shade (primary)
    _darkenHex(accent, 0.35),  // near-black shade
    _darkenHex(accent, 0.70),  // mid shade
    _darkenHex(accent, 0.45),  // dark shade
  ];
  const BG_COLOR   = '#000000';  // --bg
  const SPEED      = 0.45;
  const STREAK_COUNT  = 10;
  const STREAK_WIDTH  = 0.8;
  const STREAK_LENGTH = 1.2;
  const GLOW          = 0.9;
  const DENSITY       = 0.45;
  const TWINKLE       = 0.8;
  const ZOOM          = 3.0;
  const BG_GLOW       = 0.15;
  const MOUSE_STRENGTH = 0.3;
  const MOUSE_RADIUS   = 0.6;

  // ── Build colour arrays ────────────────────────────────────────────────
  const MAX  = 8;
  const cols = COLORS.slice(0, MAX);
  const count = cols.length;
  while (cols.length < MAX) cols.push(cols[cols.length - 1]);
  const colArrays = cols.map(_hex);
  const avg = colArrays.slice(0, count).reduce(
    (a, c) => [a[0] + c[0] / count, a[1] + c[1] / count, a[2] + c[2] / count],
    [0, 0, 0]
  );

  // ── GL context ─────────────────────────────────────────────────────────
  const gl = canvas.getContext('webgl', { antialias: true, alpha: false }) ||
             canvas.getContext('experimental-webgl');
  if (!gl) { console.warn('[lightfall] WebGL not available'); return null; }

  const prg = _buildProgram(gl);
  gl.useProgram(prg);

  // ── Full-screen quad ───────────────────────────────────────────────────
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  const posLoc = gl.getAttribLocation(prg, 'position');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  // ── Uniforms helper ────────────────────────────────────────────────────
  const loc = name => gl.getUniformLocation(prg, name);
  const U = {
    iResolution:   loc('iResolution'),
    iMouse:        loc('iMouse'),
    iTime:         loc('iTime'),
    uBgColor:      loc('uBgColor'),
    uMouseColor:   loc('uMouseColor'),
    uSpeed:        loc('uSpeed'),
    uStreakCount:  loc('uStreakCount'),
    uStreakWidth:  loc('uStreakWidth'),
    uStreakLength: loc('uStreakLength'),
    uGlow:         loc('uGlow'),
    uDensity:      loc('uDensity'),
    uTwinkle:      loc('uTwinkle'),
    uZoom:         loc('uZoom'),
    uBgGlow:       loc('uBgGlow'),
    uMouseStrength:loc('uMouseStrength'),
    uMouseRadius:  loc('uMouseRadius'),
    uColorCount:   loc('uColorCount'),
    colors: Array.from({ length: MAX }, (_, i) => loc('uColor' + i))
  };

  // set static uniforms once
  const bg = _hex(BG_COLOR);
  gl.uniform3fv(U.uBgColor,      bg);
  gl.uniform3fv(U.uMouseColor,   avg);
  gl.uniform1f (U.uSpeed,        SPEED);
  gl.uniform1i (U.uStreakCount,  Math.max(1, Math.min(16, STREAK_COUNT)));
  gl.uniform1f (U.uStreakWidth,  STREAK_WIDTH);
  gl.uniform1f (U.uStreakLength, STREAK_LENGTH);
  gl.uniform1f (U.uGlow,         GLOW);
  gl.uniform1f (U.uDensity,      DENSITY);
  gl.uniform1f (U.uTwinkle,      TWINKLE);
  gl.uniform1f (U.uZoom,         ZOOM);
  gl.uniform1f (U.uBgGlow,       BG_GLOW);
  gl.uniform1f (U.uMouseStrength,MOUSE_STRENGTH);
  gl.uniform1f (U.uMouseRadius,  MOUSE_RADIUS);
  gl.uniform1i (U.uColorCount,   count);
  U.colors.forEach((u, i) => gl.uniform3fv(u, colArrays[i]));

  // ── State ──────────────────────────────────────────────────────────────
  let running = false;
  let raf     = null;
  let mouse   = [0, 0];
  let mouseTarget = [0, 0];
  let lastT   = 0;
  const DAMPEN = 0.12;

  // ── Resize ────────────────────────────────────────────────────────────
  const _container = canvas.parentElement || document.body;
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w   = _container.clientWidth;
    const h   = _container.clientHeight;
    canvas.width  = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(U.iResolution, canvas.width, canvas.height);
  }

  const _ro = new ResizeObserver(resize);
  _ro.observe(_container);
  resize();

  // ── Mouse interaction ─────────────────────────────────────────────────
  // The canvas has pointer-events:none so we listen on the parent container.
  function onPointerMove(e) {
    const rect = _container.getBoundingClientRect();
    const dpr  = window.devicePixelRatio || 1;
    mouseTarget = [
      (e.clientX - rect.left)  * dpr,
      (rect.height - (e.clientY - rect.top)) * dpr
    ];
  }
  _container.addEventListener('pointermove', onPointerMove);

  // ── Render loop ───────────────────────────────────────────────────────
  function frame(t) {
    if (!running) return;
    raf = requestAnimationFrame(frame);

    // smooth mouse
    if (!lastT) lastT = t;
    const dt     = (t - lastT) / 1000;
    lastT        = t;
    const factor = Math.min(1, 1 - Math.exp(-dt / DAMPEN));
    mouse[0] += (mouseTarget[0] - mouse[0]) * factor;
    mouse[1] += (mouseTarget[1] - mouse[1]) * factor;

    gl.uniform1f(U.iTime,  t * 0.001);
    gl.uniform2fv(U.iMouse, mouse);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  return {
    start() {
      if (running) return;
      running = true;
      lastT   = 0;
      raf     = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      if (raf) { cancelAnimationFrame(raf); raf = null; }
    },
    destroy() {
      this.stop();
      _ro.disconnect();
      _container.removeEventListener('pointermove', onPointerMove);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prg);
    }
  };
}
