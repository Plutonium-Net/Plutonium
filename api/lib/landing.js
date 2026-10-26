/**
 * The API index page: brand splash on api.plutoniumnet.work.
 *
 * Full-bleed background + glass status card. The card's health pill is filled
 * in by one same-origin request to /healthz, so the page never claims "up"
 * before it has actually asked.
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

  /* Background layer is fixed so the artwork stays put while the page
     scrolls on short screens; the vignette keeps the card legible. */
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: -2;
    background: #000 url("/background.png") center bottom / cover no-repeat;
  }
  .backdrop::after {
    content: "";
    position: absolute;
    inset: 0;
    background: radial-gradient(130% 95% at 50% 0%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.55) 100%);
  }

  .topbar {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 2;
    padding: clamp(18px, 2.4vw, 30px);
  }
  .brand {
    display: block;
    width: clamp(38px, 3.4vw, 46px);
    height: auto;
    filter: drop-shadow(0 0 20px rgba(232, 23, 93, 0.35));
  }

  .stage {
    min-height: 100svh;
    display: grid;
    place-items: center;
    /* background.png is exactly 2:1 and its Plutonium logotype sits in the
       lower third. Under `cover` the image is max(50vw, 100svh) tall and the
       artwork starts 34.8% of that above the bottom edge, so reserve that
       band: the card sits above the brand instead of on top of it. */
    padding: clamp(88px, 12vh, 132px) 22px calc(max(50vw, 100svh) * 0.348 + 28px);
  }

  .card {
    width: min(100%, 560px);
    padding: clamp(26px, 3.4vw, 40px);
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 24px;
    backdrop-filter: blur(22px) saturate(130%);
    -webkit-backdrop-filter: blur(22px) saturate(130%);
    box-shadow:
      0 30px 80px -32px rgba(0, 0, 0, 0.95),
      inset 0 1px 0 rgba(255, 255, 255, 0.06);
  }

  .card__eyebrow {
    font-family: var(--mono);
    font-size: 0.7rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: rgba(232, 23, 93, 0.95);
    margin-bottom: 14px;
  }

  .card__title {
    font-size: clamp(1.9rem, 4.4vw, 2.6rem);
    font-weight: 650;
    letter-spacing: -0.025em;
    line-height: 1.1;
  }

  .status {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    margin-top: 18px;
    padding: 7px 14px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.045);
    font-size: 0.83rem;
    font-weight: 500;
  }
  .status__dot {
    width: 7px;
    height: 7px;
    flex: none;
    border-radius: 50%;
    background: var(--warn);
    box-shadow: 0 0 0 4px rgba(245, 165, 36, 0.14);
  }
  .status__meta {
    font-family: var(--mono);
    font-size: 0.72rem;
    color: var(--muted);
  }
  .status__meta:empty { display: none; }

  .status[data-state="ok"] .status__dot {
    background: var(--ok);
    box-shadow: 0 0 0 4px rgba(62, 207, 142, 0.16);
    animation: pulse 2.6s ease-in-out infinite;
  }
  .status[data-state="error"] .status__dot {
    background: var(--err);
    box-shadow: 0 0 0 4px rgba(242, 85, 90, 0.16);
  }

  @keyframes pulse {
    0%, 100% { box-shadow: 0 0 0 4px rgba(62, 207, 142, 0.16); }
    50%      { box-shadow: 0 0 0 7px rgba(62, 207, 142, 0.06); }
  }
  @media (prefers-reduced-motion: reduce) {
    .status[data-state="ok"] .status__dot { animation: none; }
  }

  .card__desc {
    margin-top: 20px;
    max-width: 46ch;
    color: var(--muted);
    font-size: 0.95rem;
    line-height: 1.7;
  }
  .card__desc strong { color: rgba(245, 245, 247, 0.86); font-weight: 550; }

  .card__foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-top: 26px;
    padding-top: 18px;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
    font-family: var(--mono);
    font-size: 0.74rem;
  }
  .card__foot a {
    color: var(--muted);
    text-decoration: none;
    transition: color 0.15s ease;
  }
  .card__foot a:hover,
  .card__foot a:focus-visible { color: var(--accent); }
  .card__foot span { color: rgba(255, 255, 255, 0.28); }
</style>
</head>
<body>
<div class="backdrop" aria-hidden="true"></div>

<header class="topbar">
  <a href="https://plutoniumnet.work" aria-label="Plutonium Network">
    <img class="brand" src="/logo.png" alt="Plutonium" width="46" height="46" />
  </a>
</header>

<main class="stage">
  <section class="card">
    <p class="card__eyebrow">api.plutoniumnet.work</p>
    <h1 class="card__title">Plutonium API</h1>

    <div class="status" data-state="checking" role="status" aria-live="polite">
      <span class="status__dot" aria-hidden="true"></span>
      <span class="status__label">Checking status</span>
      <span class="status__meta"></span>
    </div>
    <noscript><style>.status { display: none; }</style></noscript>

    <p class="card__desc">
      Authentication, AI and remote sessions for Plutonium Network, served by a single Worker.
      <strong>Provider keys stay server-side</strong>; AI and VM routes require a verified Firebase ID token.
    </p>

    <div class="card__foot">
      <a href="/healthz">GET /healthz</a>
      <span>Plutonium Network</span>
    </div>
  </section>
</main>

<script>
  (function () {
    var el    = document.querySelector('.status');
    var label = el.querySelector('.status__label');
    var meta  = el.querySelector('.status__meta');
    var start = Date.now();

    function settle(state, text, extra) {
      el.dataset.state = state;
      label.textContent = text;
      meta.textContent  = extra || '';
    }

    fetch('/healthz', { cache: 'no-store', headers: { Accept: 'application/json' } })
      .then(function (res) {
        var ms = Math.max(1, Date.now() - start);
        if (!res.ok) return settle('error', 'Degraded', 'HTTP ' + res.status);
        return res.json().then(function (body) {
          if (body && body.status === 'ok') settle('ok', 'Operational', ms + ' ms');
          else settle('error', 'Degraded', 'unexpected response');
        });
      })
      .catch(function () {
        settle('error', 'Unreachable', 'network error');
      });
  })();
</script>
</body>
</html>`;
}
