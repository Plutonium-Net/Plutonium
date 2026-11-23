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
// How long the offscreen document may take to start listening, and how long the
// recorder may take to open the tab's stream before we call it a failure.
const RECORDER_READY_TIMEOUT = 4000
const BEGIN_TIMEOUT = 12000

const NO_RECORDER = 'The clip recorder did not load. Turn Plutonium Clip off and on again at chrome://extensions, then reload Plutonium.'
const RECORDER_SILENT = 'The clip recorder did not answer. Reload Plutonium and try again.'
const RECORDER_HUNG = 'Chrome did not hand over the tab stream. Reload Plutonium and try again.'

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
    return 'Chrome only allows tab capture right after the extension is invoked. Click the Plutonium Clip icon in the toolbar once (that starts a clip), then press clip again.'
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

// An offscreen document exists a moment before its script starts listening, so a
// message sent straight after createDocument can land with no receiving end at
// all and come back empty. Ping until the recorder answers instead of racing it.
async function waitForRecorder(timeout) {
  const deadline = Date.now() + timeout
  for (;;) {
    const reply = await recorder({ type: 'ping' })
    if (reply && reply.ok) return true
    if (Date.now() >= deadline) return false
    await new Promise((resolve) => setTimeout(resolve, 80))
  }
}

async function ensureRecorder() {
  // A document that is already up answers immediately; only pay the startup wait
  // when it has to be created (or is still warming up).
  if ((await hasOffscreen()) && (await waitForRecorder(600))) return true
  await ensureOffscreen()
  return waitForRecorder(RECORDER_READY_TIMEOUT)
}

function beginInRecorder(message, streamId) {
  return new Promise((resolve) => {
    let settled = false
    const timer = setTimeout(() => finish({ ok: false, error: RECORDER_HUNG }), BEGIN_TIMEOUT)

    function finish(value) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }

    recorder({
      type: 'begin',
      streamId,
      rect: message.rect,
      viewport: message.viewport,
    })
      .then((reply) => finish(reply && typeof reply === 'object' ? reply : { ok: false, error: RECORDER_SILENT }))
      .catch((error) => finish({ ok: false, error: messageOf(error) }))
  })
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

  if (!(await ensureRecorder())) {
    console.warn('[plu-clip] the offscreen recorder never answered')
    return { ok: false, error: NO_RECORDER }
  }

  let streamId
  try {
    streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId })
  } catch (error) {
    const text = captureErrorText(error)
    console.warn('[plu-clip] tab capture refused:', messageOf(error))
    return { ok: false, error: text }
  }

  await rememberTab(tabId)

  const reply = await beginInRecorder(message, streamId)

  if (!reply || !reply.ok) {
    await forgetTab()
    const text = reply?.error || RECORDER_SILENT
    console.warn('[plu-clip] recording did not start:', text)
    return { ok: false, error: text }
  }

  return { ok: true, width: reply.width, height: reply.height }
}

async function handleStop() {
  const reply = await recorder({ type: 'stop' })
  if (reply && typeof reply === 'object') return reply
  return { ok: false, error: 'The recorder is no longer running. Try another clip.' }
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
