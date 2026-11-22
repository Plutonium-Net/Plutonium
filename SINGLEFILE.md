# Single-file builds

Plutonium ships two ways from one build.

| Artifact | Built by | Updates |
| --- | --- | --- |
| `plutonium.html` / `.svg` / `.xhtml` (`dist-download`) | `npm run build:pages download` | thin wrappers around the client; always the latest build |
| The client at `/client.html` (`public/client.html`) | `npm run publish:single` | loads the latest published build from jsDelivr |

The lite downloads (`dist-download`, served at `lite.plutoniumnet.work`) are wrappers, not
builds: `plutonium.html` is `public/client.html` verbatim, `.svg` and `.xhtml` carry it in an
iframe. All three are a few KB and load the published build from jsDelivr, so they never go
stale — and they need a network connection. `npm run build:single` still produces the fully
self-contained 13 MB `dist-single/index.html` when an offline copy is wanted.

`public/client.html` is stable: it reads `owner/repo@branch` from its
`plutonium-cdn` meta tag (default `Plutonium-Net/SingleFile-SRC@main`), fetches
`payload.json`, then loads `app.css` and `app.js` from
`https://cdn.jsdelivr.net/gh/<owner>/<repo>@<branch>/`.

## Commands

```bash
npm run build:cdn                    # build dist-cdn only (app.js, app.css, payload.json)
npm run publish:single               # build, push, purge jsDelivr
npm run publish:single -- --dry-run  # build + validate, no push, no purge
npm run publish:single -- --no-purge # push without purging
```

Test overrides on the client: `client.html?source=<owner>/<repo>@<ref>` and
`client.html?base=/dist-cdn/` (any https URL or absolute path works as a base).

## Environment

- `PLU_GITHUB_APP_ID` — the App's numeric ID
- `PLU_GITHUB_APP_PRIVATE_KEY_BASE64` — the downloaded `.pem`, base64 encoded
  (`base64 -w0 app.pem`, macOS: `base64 -i app.pem`)
- `PLU_CDN_REPO` — default `Plutonium-Net/SingleFile-SRC`
- `PLU_CDN_BRANCH` — default `main`

No personal access token is used. The script signs a JWT, exchanges it for a
one-hour installation token, and never prints either.

## Repo and App setup

1. Create `Plutonium-Net/SingleFile-SRC` as a public repo (jsDelivr only reads
   public repos, and a Contents-only App cannot create one).
2. Org → Settings → Developer settings → GitHub Apps → **New GitHub App**.
   Webhook: inactive. Homepage: the repo.
3. Repository permissions: **Contents: Read and write**. Everything else: no access.
4. Generate a private key, then install the App on the org and select only
   `SingleFile-SRC`.
5. Leave `main` unprotected. Each publish force-updates it with a parentless
   commit, so old 13 MB builds do not accumulate in history.

## Limits

- jsDelivr rejects single GitHub files over 20 MB; the publish script fails before
  pushing if any exported file is larger.
- jsDelivr serves `.html` as `text/plain`, which is why the client lives on the
  site and only loads JS/CSS/JSON from the CDN.
- Branch refs are cached for 7 days, so every publish purges each exported file.
