// PlutoniumOrb — WebGL shader orb for Talk mode (Jarvis-style energy sphere).
// Renders a fbm-noise energy orb that swells and brightens with the voice
// level (uPulse) and shifts behavior per state (uState).
window.PlutoniumOrb = (function () {
  const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

  const FRAG = `
precision highp float;
uniform vec2  uRes;
uniform float uTime;
uniform vec3  uAccent;
uniform float uPulse;
uniform float uState;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.02 + 7.3;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / min(uRes.x, uRes.y);
  float d = length(uv);
  float pulse = clamp(uPulse, 0.0, 1.0);

  // state: 0 listening, 1 thinking, 2 voicing, 3 speaking
  float spd = 0.22 + 0.24 * uState;          // faster shimmer when active
  float baseBoost = 0.85 + 0.35 * uState;

  float rad = 0.40 + 0.05 * pulse;           // voice swells the orb

  // energy noise
  float n1 = fbm(uv * 3.4 + uTime * spd);
  float n2 = fbm(uv * 6.5 - uTime * spd * 0.8 + 4.7);
  float energy = 0.6 + 0.5 * n1 - 0.15 * n2;

  float t = d / rad;
  float body = 1.0 - smoothstep(0.96, 1.05, t);

  // color ramp: white-hot core -> accent -> deep shadow
  vec3 col = mix(vec3(1.0), uAccent, smoothstep(0.06, 0.5, t));
  col = mix(col, uAccent * 0.22, smoothstep(0.4, 0.98, t));

  // rim light
  float rim = smoothstep(0.5, 0.96, t) * (0.4 + 0.7 * pulse);

  // hot center
  float core = exp(-t * 9.0) * (1.0 + 1.2 * pulse);

  vec3 orb = col * body * (0.25 + 0.9 * energy) * baseBoost;
  orb += uAccent * rim * body;
  orb += vec3(1.0) * core * body;

  // outer glow swells with the voice
  float glow = exp(-d * 3.4) * (0.28 + 0.6 * pulse);
  orb += uAccent * glow;

  orb *= 1.0 + 0.35 * pulse;

  float alpha = clamp(body * (0.35 + 0.7 * energy) + glow, 0.0, 1.0);
  gl_FragColor = vec4(orb, alpha);
}
`;

  let canvas = null;
  let gl = null;
  let prog = null;
  let running = false;
  let raf = 0;
  const uni = { uTime: 0, uPulse: 0, uState: 0, uAccent: [232, 23, 93] };
  const loc = {};

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error('[orb] shader compile error:', gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || 190;
    const h = canvas.clientHeight || 190;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function setup() {
    gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false })
      || canvas.getContext('experimental-webgl');
    if (!gl) return false;

    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;

    prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[orb] program link error:', gl.getProgramInfoLog(prog));
      return false;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    loc.uRes = gl.getUniformLocation(prog, 'uRes');
    loc.uTime = gl.getUniformLocation(prog, 'uTime');
    loc.uPulse = gl.getUniformLocation(prog, 'uPulse');
    loc.uState = gl.getUniformLocation(prog, 'uState');
    loc.uAccent = gl.getUniformLocation(prog, 'uAccent');

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    resize();
    return true;
  }

  function render() {
    if (!running || !gl || !prog) return;
    const now = performance.now() / 1000;
    gl.uniform2f(loc.uRes, canvas.width, canvas.height);
    gl.uniform1f(loc.uTime, now);
    gl.uniform1f(loc.uPulse, uni.uPulse);
    gl.uniform1f(loc.uState, uni.uState);
    gl.uniform3f(loc.uAccent, uni.uAccent[0], uni.uAccent[1], uni.uAccent[2]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    raf = requestAnimationFrame(render);
  }

  return {
    attach(c, opts) {
      if (!c) return false;
      canvas = c;
      if (!gl && !setup()) return false;
      if (opts && Array.isArray(opts.accent)) uni.uAccent = opts.accent;
      resize();
      running = true;
      if (!raf) render();
      return true;
    },
    setPulse(v) { uni.uPulse = Math.max(0, Math.min(1, v || 0)); },
    setState(s) { uni.uState = s; },
    detach() {
      running = false;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
    },
  };
})();
