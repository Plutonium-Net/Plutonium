// Plutonium Clip service worker.
//
// The page asks for a recording to start and later asks for it to stop. Chrome
// hands the tab's own stream to an offscreen document, which crops every frame
// to the game or proxied page rectangle and records until asked to stop. Chrome
// never shows its screen-share picker because tab capture is the extension's own
// API.

const SCOPE = 'plu-clip'
const OFFSCREEN_URL = 'offscreen.html'
const SESSION_KEY = 'clipTabId'

let creatingOffscreen = null

function messageOf(error) {
  if (!error) return 'Unknown error'
  if (typeof error === 'string') return error
  return error.message || String(error)
}

async function hasOffscreen() {
  if (typeof chrome.runtime.getContexts !== 'function') return false
  try {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })
    return contexts.length > 0
  } catch {
    return false
  }
}

async function ensureOffscreen() {
  if (await hasOffscreen()) return
  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_URL,
        reasons: ['USER_MEDIA'],
        justification: 'Records the game or proxied tab area so clips can be saved locally.',
      })
      .catch((error) => {
        // Racing creation calls are harmless; anything else is not.
        if (!/single offscreen|already/i.test(messageOf(error))) throw error
      })
      .finally(() => {
        creatingOffscreen = null
      })
  }
  await creatingOffscreen
}

async function rememberTab(tabId) {
  try {
    await chrome.storage.session.set({ [SESSION_KEY]: tabId })
  } catch {
    // Losing the pointer only affects relay of a finished clip.
  }
}

async function forgetTab() {
  try {
    await chrome.storage.session.remove(SESSION_KEY)
  } catch {
    // Nothing to clean up.
  }
}

async function recordingTab() {
  try {
    const stored = await chrome.storage.session.get(SESSION_KEY)
    return typeof stored?.[SESSION_KEY] === 'number' ? stored[SESSION_KEY] : null
  } catch {
    return null
  }
}

function captureErrorText(error) {
  const text = messageOf(error)
  if (/invoke|activeTab|not.*granted|permission|denied|user gesture/i.test(text)) {
    return 'Chrome only allows tab capture right after the extension is invoked. Click the Plutonium Clip icon in the toolbar once — that starts a clip — then press clip again.'
  }
  if (/cannot|can't|restricted|chrome:|not allowed/i.test(text)) {
    return 'Chrome will not record this tab. Open the game or proxied page in Plutonium and try again.'
  }
  return `Recording could not start: ${text}`
}

// Messages for the offscreen recorder carry `to`, which also keeps the worker
// from handling its own relays.
function recorder(payload) {
  return chrome.runtime.sendMessage({ scope: SCOPE, to: 'recorder', ...payload }).then(
    (reply) => reply,
    (error) => ({ ok: false, error: messageOf(error) }),
  )
}

async function forwardToPage(message) {
  const tabId = await recordingTab()
  if (tabId == null) return
  try {
    await chrome.tabs.sendMessage(tabId, { scope: SCOPE, ...message })
  } catch {
    // The tab navigated or closed; the clip is already lost to the page.
  }
  if (message.type === 'done' || message.type === 'error') await forgetTab()
}

async function handleStart(tabId, message) {
  if ((await recordingTab()) != null) {
    return { ok: false, error: 'A clip is already recording. Stop it first.' }
  }

  await ensureOffscreen()

  let streamId
  try {
    streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId })
  } catch (error) {
    return { ok: false, error: captureErrorText(error) }
  }

  await rememberTab(tabId)

  const reply = await recorder({
    type: 'begin',
    streamId,
    rect: message.rect,
    viewport: message.viewport,
  })

  if (!reply || !reply.ok) {
    await forgetTab()
    return { ok: false, error: reply?.error || 'The recorder did not start.' }
  }

  return { ok: true, width: reply.width, height: reply.height }
}

async function handleStop() {
  const reply = await recorder({ type: 'stop' })
  return reply && typeof reply === 'object' ? reply : { ok: true }
}

async function handleCancel() {
  await recorder({ type: 'cancel' })
  await forgetTab()
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.scope !== SCOPE || message.to) return

  if (message.type === 'start') {
    const tabId = sender?.tab?.id
    if (typeof tabId !== 'number') {
      sendResponse({ ok: false, error: 'There is no tab to record.' })
      return
    }
    handleStart(tabId, message)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: messageOf(error) }))
    return true
  }

  if (message.type === 'stop') {
    handleStop()
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: messageOf(error) }))
    return true
  }

  if (message.type === 'cancel') {
    handleCancel()
      .catch(() => {})
      .finally(() => sendResponse({ ok: true }))
    return true
  }

  if (message.type === 'chunk' || message.type === 'done' || message.type === 'error') {
    forwardToPage(message).catch(() => {})
    return
  }
})

// Clicking the toolbar icon is the extension's one guaranteed invocation, so the
// page uses that same click as its clip button: it starts a recording, and the
// next click stops and saves it.
async function sendToggle(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { scope: 'plu-clip-ext', type: 'toggle' })
    return true
  } catch {
    return false
  }
}

async function toggleOnTab(tab) {
  if (!tab?.id || !/^https?:\/\//i.test(tab.url || '')) return
  if (await sendToggle(tab.id)) return

  // A tab that was open before the extension was installed has no bridge yet.
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
  } catch {
    return
  }

  await sendToggle(tab.id)
}

chrome.action.onClicked.addListener((tab) => {
  toggleOnTab(tab).catch(() => {})
})

// A closed tab cannot finish its clip; release the capture with it.
chrome.tabs.onRemoved.addListener((tabId) => {
  recordingTab()
    .then((active) => {
      if (active === tabId) return handleCancel()
      return undefined
    })
    .catch(() => {})
})
