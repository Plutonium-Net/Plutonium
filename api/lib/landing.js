/**
 * The API index page: brand splash on api.plutoniumnet.work.
 *
 * Three stacked cards — title, detailed status, description — left-aligned
 * above the brand wordmark that is baked into background.png (anchored bottom).
 * The status card is filled from one same-origin request to /healthz, which
 * reports each subsystem, so the page never claims "up" before it has asked.
 *
 * Background, logo and favicon are static files in ../../public, served by the
 * Worker's [assets] binding rather than inlined here (the background alone is
 * 414 KB, which has no place in a Worker bundle).
 */

export function landingPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Plutonium API</title>
<meta name="description" content="Authentication, AI and remote sessions for Plutonium Network, served by one Cloudflare Worker." />
<meta name="theme-color" content="#050508" />
<meta property="og:title" content="Plutonium API" />
<meta property="og:description" content="Authentication, AI and remote sessions for Plutonium Network." />
<meta property="og:image" content="/background.png" />
<link rel="icon" type="image/png" href="/favicon.png" />
<link rel="apple-touch-icon" href="/favicon.png" />
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --text:   #f5f5f7;
    --muted:  #9b9ba4;
    --accent: #e8175d;
    --ok:     #3ecf8e;
    --warn:   #f5a524;
    --err:    #f2555a;
    --card:   rgba(6, 6, 10, 0.72);
    --line:   rgba(255, 255, 255, 0.10);
    --mono:   ui-monospace, "SF Mono", "Fira Code", Menlo, monospace;
  }

  html { background: #000; }

  body {
    min-height: 100%;
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  /* Fixed so the artwork stays put while short screens scroll; bottom-anchored
     so the brand wordmark always sits on the bottom edge, never half-cropped.
     Untinted: the image is drawn exactly as supplied. */
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: -2;
    background: #000 url("/background.png") center bottom / cover no-repeat;
  }

  .stage {
    min-height: 100svh;
    display: grid;
    align-content: start;
    justify-items: start;
    gap: clamp(10px, 1.2vh, 12px);
    /* background.png is exactly 2:1 and its Plutonium wordmark fills the lower
       third. Under cover the image is max(50vw, 100svh) tall and the artwork
       starts 34.8% of that above the bottom edge, so that band is reserved:
       the cards sit above the brand instead of on top of it. */
    padding:
      clamp(34px, 7vh, 92px)
      22px
      calc(max(50vw, 100svh) * 0.348 + 4px)
      clamp(26px, 9vw, 150px);
  }

  .card {
    width: min(100%, 720px);
    padding: clamp(14px, 2.6vh, 24px);
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 22px;
    backdrop-filter: blur(22px) saturate(130%);
    -webkit-backdrop-filter: blur(22px) saturate(130%);
    box-shadow:
      0 30px 80px -32px rgba(0, 0, 0, 0.95),
      inset 0 1px 0 rgba(255, 255, 255, 0.06);
  }

  /* ---- 1. title ---------------------------------------------------------- */

  .card--title {
    display: flex;
    align-items: center;
    gap: clamp(16px, 1.8vw, 24px);
  }
  .card__mark {
    flex: none;
    width: clamp(38px, 5.2vh, 58px);
    height: auto;
    filter: drop-shadow(0 0 20px rgba(232, 23, 93, 0.3));
  }
  .card__eyebrow {
    font-family: var(--mono);
    font-size: clamp(0.62rem, 1.4vh, 0.72rem);
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: rgba(232, 23, 93, 0.95);
    margin-bottom: clamp(2px, 0.8vh, 6px);
  }
  .card__title {
    font-size: clamp(1.4rem, 4.4vh, 2.8rem);
    font-weight: 650;
    letter-spacing: -0.03em;
    line-height: 1.05;
  }

  /* ---- 2. status -------------------------------------------------------- */

  .status__head {
    display: flex;
    align-items: center;
    gap: 11px;
  }
  .status__dot {
    width: clamp(7px, 1.1vh, 9px);
    height: clamp(7px, 1.1vh, 9px);
    flex: none;
    border-radius: 50%;
    background: var(--warn);
    box-shadow: 0 0 0 5px rgba(245, 165, 36, 0.14);
  }
  .status__state {
    font-size: clamp(0.95rem, 2.2vh, 1.3rem);
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .status__latency {
    font-family: var(--mono);
    font-size: 0.76rem;
    color: var(--muted);
  }
  .status__latency:empty { display: none; }
  .status__link {
    margin-left: auto;
    font-family: var(--mono);
    font-size: 0.74rem;
    color: rgba(255, 255, 255, 0.34);
    text-decoration: none;
    transition: color 0.15s ease;
  }
  .status__link:hover,
  .status__link:focus-visible { color: var(--accent); }

  .status[data-state="ok"] .status__dot {
    background: var(--ok);
    box-shadow: 0 0 0 5px rgba(62, 207, 142, 0.16);
    animation: pulse 2.6s ease-in-out infinite;
  }
  .status[data-state="error"] .status__dot {
    background: var(--err);
    box-shadow: 0 0 0 5px rgba(242, 85, 90, 0.16);
  }

  @keyframes pulse {
    0%, 100% { box-shadow: 0 0 0 5px rgba(62, 207, 142, 0.16); }
    50%      { box-shadow: 0 0 0 8px rgba(62, 207, 142, 0.05); }
  }
  @media (prefers-reduced-motion: reduce) {
    .status[data-state="ok"] .status__dot { animation: none; }
  }

  .checks {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: clamp(4px, 0.9vh, 8px) 26px;
    margin-top: clamp(8px, 1.8vh, 14px);
    padding-top: clamp(8px, 1.6vh, 13px);
    border-top: 1px solid rgba(255, 255, 255, 0.07);
    list-style: none;
  }
  .checks[hidden] { display: none; }
  .checks li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: clamp(0.74rem, 1.7vh, 0.86rem);
  }
  .checks__name { color: rgba(245, 245, 247, 0.74); }
  .checks__val {
    font-family: var(--mono);
    font-size: 0.74rem;
    color: var(--muted);
    white-space: nowrap;
  }
  .checks li[data-ok="true"] .checks__val  { color: rgba(62, 207, 142, 0.92); }
  .checks li[data-ok="false"] .checks__val { color: rgba(242, 85, 90, 0.95); }

  .status__foot {
    margin-top: clamp(7px, 1.4vh, 11px);
    font-family: var(--mono);
    font-size: clamp(0.62rem, 1.3vh, 0.7rem);
    color: rgba(255, 255, 255, 0.3);
  }

  /* ---- 3. description --------------------------------------------------- */

  .card__desc {
    max-width: 68ch;
    color: var(--muted);
    font-size: clamp(0.82rem, 1.9vh, 1rem);
    line-height: 1.7;
  }
  .card__desc strong { color: rgba(245, 245, 247, 0.88); font-weight: 550; }

  /* Short, wide windows (a 768p laptop minus browser chrome): cover would blow
     the artwork up to nearly half the height, so scale the image by height
     instead and reserve the correspondingly smaller band. */
  @media (max-height: 700px) {
    .backdrop {
      background-size: auto 72%;
      background-position: left bottom;
    }
    .stage { padding-bottom: calc(72vh * 0.348 + 8px); }
  }

  /* Every size above is vh-driven, so the stack shrinks with the window and
     keeps clear of the artwork band without a stack of breakpoints. Wide
     screens get a third column so the checks take two rows, not three. */
  @media (min-width: 860px) {
    .checks { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
  @media (max-width: 520px) {
    .checks { grid-template-columns: minmax(0, 1fr); }
  }
</style>
</head>
<body>
<div class="backdrop" aria-hidden="true"></div>

<main class="stage">
  <section class="card card--title">
    <img class="card__mark" src="/logo.png" alt="" width="58" height="58" />
    <div>
      <p class="card__eyebrow">api.plutoniumnet.work</p>
      <h1 class="card__title">Plutonium API</h1>
    </div>
  </section>

  <section class="card status" data-state="checking" role="status" aria-live="polite">
    <div class="status__head">
      <span class="status__dot" aria-hidden="true"></span>
      <span class="status__state">Checking status</span>
      <span class="status__latency"></span>
      <a class="status__link" href="/healthz">/healthz</a>
    </div>
    <ul class="checks" hidden></ul>
    <p class="status__foot">Contacting the worker…</p>
  </section>
  <noscript><style>.status { display: none; }</style></noscript>

  <section class="card card--desc">
    <p class="card__desc">
      Authentication, AI and remote sessions for Plutonium Network, served by a single Worker.
      <strong>Provider keys stay server-side</strong>; AI and VM routes require a verified Firebase ID token.
    </p>
  </section>
</main>

<script>
  (function () {
    var card    = document.querySelector('.status');
    var state   = card.querySelector('.status__state');
    var latency = card.querySelector('.status__latency');
    var list    = card.querySelector('.checks');
    var foot    = card.querySelector('.status__foot');
    var started = Date.now();

    function settle(mode, label, ms, body) {
      card.dataset.state = mode;
      state.textContent  = label;
      latency.textContent = ms ? Math.max(1, Math.round(ms)) + ' ms' : '';

      if (body && Array.isArray(body.components) && body.components.length) {
        list.innerHTML = body.components.map(function (c) {
          return '<li data-ok="' + (c.ok ? 'true' : 'false') + '">' +
                   '<span class="checks__name">' + c.name + '</span>' +
                   '<span class="checks__val">' + (c.ok ? 'ok' : 'down') + '</span>' +
                 '</li>';
        }).join('');
        list.hidden = false;
      }

      var at = new Date();
      foot.textContent = 'Checked ' + at.toISOString().slice(11, 19) + ' UTC · GET /healthz';
    }

    fetch('/healthz', { cache: 'no-store', headers: { Accept: 'application/json' } })
      .then(function (res) {
        var ms = Date.now() - started;
        return res.json().catch(function () { return null; }).then(function (body) {
          if (!body) return settle('error', 'No response', ms, null);
          settle(body.status === 'ok' ? 'ok' : 'error',
                 body.status === 'ok' ? 'Operational' : 'Degraded', ms, body);
        });
      })
      .catch(function () {
        card.dataset.state = 'error';
        state.textContent  = 'Unreachable';
        latency.textContent = '';
        foot.textContent = 'No response from /healthz';
      });
  })();
</script>
</body>
</html>`;
}
