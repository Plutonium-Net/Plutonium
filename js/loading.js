(function () {
  let pageLoaded = false;
  let kPressed = false;

  /* ── accent colour ────────────────────────────────────────────────── */
  let accent = '#e8175d';          // default Plutonium pink
  try {
    const state = window.BrowserThemeState
      ? BrowserThemeState.loadThemeState()
      : null;
    if (state && state.accentColor) accent = state.accentColor;
  } catch (_) { /* keep default */ }

  /* helper: #rrggbb → "r,g,b" */
  function hexToRgbTriple(hex) {
    const h = (hex || '#e8175d').replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return r + ',' + g + ',' + b;
  }
  const accentRgb = hexToRgbTriple(accent);

  /* ── build the overlay ────────────────────────────────────────────── */
  const overlay = document.createElement('div');
  overlay.id = 'page-loader';
  overlay.style.cssText = `
    position:fixed; inset:0;
    background:#000;
    display:flex; flex-direction:column;
    justify-content:center; align-items:center;
    z-index:9999;
    transition:opacity .6s ease;
  `;

  /* ── "Plutonium" title (Curly font, letter-by-letter wave) ────── */
  const title = document.createElement('div');
  title.style.cssText = `
    display:flex;
    color:${accent};
    font-family:'Curly',cursive;
    font-size:clamp(42px,8vw,80px);
    letter-spacing:2px;
    margin-bottom:40px;
    z-index:1;
  `;
  'Plutonium'.split('').forEach(function (ch, i) {
    const span = document.createElement('span');
    span.textContent = ch;
    span.style.cssText = `
      display:inline-block;
      animation:boot-letter 3s ease-in-out ${i * 0.18}s infinite;
    `;
    title.appendChild(span);
  });

  /* ── conic-gradient loader ──────────────────────────────────────── */
  const spinner = document.createElement('div');
  spinner.className = 'boot-spinner';
  spinner.style.cssText = `
    width:80px; height:80px;
    padding:10px;
    border-radius:20px;
    box-sizing:border-box;
    position:relative;
    mask:conic-gradient(#000 0 0) content-box exclude,conic-gradient(#000 0 0);
    filter:blur(12px);
    animation:boot-morph 1.2s linear infinite alternate;
  `;

  const spinnerBefore = document.createElement('div');
  spinnerBefore.style.cssText = `
    content:''; position:absolute; inset:0;
    background:repeating-conic-gradient(
      #0000 0 5%,
      ${accent},
      #0000 20% 50%
    );
    animation:boot-spin 1s linear infinite;
  `;
  spinner.appendChild(spinnerBefore);

  /* ── injected keyframes ──────────────────────────────────────────── */
  const style = document.createElement('style');
  style.textContent = `
    @keyframes boot-morph { to { border-radius: 50% } }
    @keyframes boot-spin  { to { rotate: .5turn } }
    @keyframes boot-letter {
      0%, 100% { transform: translateY(0)   scaleY(1);    filter: drop-shadow(0 0  8px rgba(${accentRgb},.4)); }
      25%      { transform: translateY(-8px) scaleY(1.06); filter: drop-shadow(0 0 18px rgba(${accentRgb},.8)); }
      50%      { transform: translateY(0)   scaleY(0.96); filter: drop-shadow(0 0  4px rgba(${accentRgb},.25)); }
      75%      { transform: translateY(8px)  scaleY(1.05); filter: drop-shadow(0 0 16px rgba(${accentRgb},.7)); }
    }
  `;
  document.head.appendChild(style);

  /* ── assemble & insert ───────────────────────────────────────────── */
  overlay.appendChild(title);
  overlay.appendChild(spinner);
  document.body.insertBefore(overlay, document.body.firstChild);
  document.body.style.overflow = 'hidden';

  /* ── hide logic (unchanged from original) ────────────────────────── */
  function hideLoader() {
    overlay.style.opacity = '0';
    setTimeout(function () {
      overlay.remove();
      document.body.style.overflow = '';
    }, 600);
  }

  function checkAndHide() {
    if (pageLoaded && !kPressed) hideLoader();
  }

  window.addEventListener('load', function () {
    pageLoaded = true;
    checkAndHide();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'k' || e.key === 'K') kPressed = true;
  });
  document.addEventListener('keyup', function (e) {
    if (e.key === 'k' || e.key === 'K') { kPressed = false; checkAndHide(); }
  });

  /* safety net: force-hide after 30 s */
  setTimeout(function () { if (!kPressed) hideLoader(); }, 30000);
})();
