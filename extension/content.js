// Bridges the Plutonium page and the extension. The page never touches Chrome
// APIs directly; it posts messages on a private channel and gets clip bytes
// back in pieces.
//
// This file runs on every http/https page so any Plutonium deployment works,
// whether it is plutoniumnet.work, a self-hosted copy or a renamed domain. It
// only ever answers the Plutonium page: nothing happens on a page that does not
// speak this private channel. The guard keeps the extra injection harmless when
// the background worker hand-injects a tab that predates the install.

if (!globalThis.__plutoniumClipBridge) {
  globalThis.__plutoniumClipBridge = true

  const CHANNEL = 'plutonium-clip'
  const SCOPE = 'plu-clip'

  function toPage(payload) {
    window.postMessage({ channel: CHANNEL, dir: 'ext', ...payload }, '*')
  }

  function messageOf(error) {
    if (!error) return 'Unknown error'
    if (typeof error === 'string') return error
    return error.message || String(error)
  }

  function viewport() {
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
    }
  }

  // After the extension is reloaded, updated or removed, this script keeps
  // running but its Chrome APIs are dead: every call throws "Extension context
  // invalidated". Say so on the page's channel instead of leaking that error, so
  // Plutonium can ask for a reload rather than offering a clip button that fails.
  function alive() {
    try {
      return Boolean(chrome && chrome.runtime && chrome.runtime.id)
    } catch {
      return false
    }
  }

  function tell(type, data) {
    if (!alive()) {
      toPage({ type: 'lost' })
      return
    }
    chrome.runtime.sendMessage({ scope: SCOPE, type, ...data }).catch(() => {})
  }

  // Starting and stopping both need an answer: the extension can refuse to
  // capture the tab, and the save can fail.
  async function request(kind, data) {
    if (!alive()) {
      toPage({ type: 'lost' })
      return
    }

    let reply
    try {
      reply = await chrome.runtime.sendMessage({ scope: SCOPE, type: kind, ...data })
    } catch (error) {
      const text = messageOf(error)
      if (/context invalidated|extension context|receiving end does not exist/i.test(text)) {
        toPage({ type: 'lost' })
        return
      }
      toPage(kind === 'start' ? { type: 'failed', error: text } : { type: 'error', message: text })
      return
    }

    if (reply && reply.ok) {
      if (kind === 'start') toPage({ type: 'started', width: reply.width, height: reply.height })
      return
    }

    const error = reply?.error || 'The recorder did not answer.'
    if (kind === 'start') toPage({ type: 'failed', error })
    else toPage({ type: 'error', message: error })
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return
    const data = event.data
    if (!data || data.channel !== CHANNEL || data.dir !== 'page') return

    if (data.type === 'hello') {
      // Never answer "ready" from a dead context: the page would keep a clip
      // button that cannot record.
      toPage(alive() ? { type: 'ready' } : { type: 'lost' })
      return
    }
    if (data.type === 'start') {
      void request('start', { rect: data.rect, viewport: viewport() })
      return
    }
    if (data.type === 'stop') {
      void request('stop', {})
      return
    }
    if (data.type === 'cancel') {
      tell('cancel', {})
    }
  })

  chrome.runtime.onMessage.addListener((message) => {
    if (!message) return

    if (message.scope === SCOPE) {
      if (message.type === 'chunk') {
        toPage({ type: 'chunk', data: message.data })
      } else if (message.type === 'done') {
        toPage({
          type: 'done',
          mime: message.mime,
          width: message.width,
          height: message.height,
          duration: message.duration,
          size: message.size,
        })
      } else if (message.type === 'error') {
        toPage({ type: 'error', message: message.message })
      }
      return
    }

    if (message.scope === 'plu-clip-ext' && message.type === 'toggle') {
      toPage({ type: 'toolbar' })
    }
  })

  // Announce the moment the bridge exists, not only at DOMContentLoaded: this
  // file can be injected after the page has already asked whether the recorder
  // is there (site access granted on click, or the extension installed while
  // this tab was open), and a silent bridge leaves Plutonium saying it is not
  // installed.
  toPage({ type: 'ready' })
  window.addEventListener('DOMContentLoaded', () => toPage({ type: 'ready' }))
}
