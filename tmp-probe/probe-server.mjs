import http from 'node:http'

const isolated = {
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-embedder-policy': 'credentialless',
}

const parent = `<!doctype html><meta charset="utf-8"><title>probe parent</title>
<body style="margin:0;font:14px system-ui;background:#111;color:#eee">
<p id="out">waiting</p>
<iframe id="f" src="/child.html" width="420" height="160"></iframe>
<script>
  var f = document.getElementById('f')
  f.addEventListener('load', function () {
    var w = f.contentWindow
    document.getElementById('out').textContent =
      'child crossOriginIsolated=' + w.crossOriginIsolated +
      ' SAB=' + (typeof w.SharedArrayBuffer)
  })
</script>`

const child = `<!doctype html><meta charset="utf-8"><title>probe child</title>
<body style="margin:0;font:14px system-ui;background:#142;color:#fff">
<p>child</p>
<script>
  document.body.insertAdjacentHTML('beforeend',
    '<p>crossOriginIsolated=' + crossOriginIsolated + '</p>' +
    '<p>SAB=' + (typeof SharedArrayBuffer) + '</p>')
</script>`

http
  .createServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname
    if (path === '/child.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...isolated })
      return res.end(child)
    }
    if (path === '/parent.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      return res.end(parent)
    }
    res.writeHead(404).end('no')
  })
  .listen(5299, '127.0.0.1', () => console.log('probe on http://127.0.0.1:5299/parent.html'))
