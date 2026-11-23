// Records the captured tab, cropped to the rectangle the page asked for, from
// the moment clip is pressed until it is pressed again.
//
// The page never touches Chrome APIs: the service worker hands this document a
// tabCapture stream id, this document draws the cropped frames into a canvas and
// runs MediaRecorder on it, then sends the finished WebM back in base64 pieces.

const SCOPE = 'plu-clip'
const FPS = 30
const MAX_WIDTH = 1920
const PIECE_BYTES = 384 * 1024 // divisible by 3, so every base64 piece decodes alone

let session = null

function messageOf(error) {
  if (!error) return 'Unknown error'
  if (typeof error === 'string') return error
  return error.message || String(error)
}

function pickMime() {
  // VP8 first: it encodes several times faster in real time than VP9, and the
  // recorder runs alongside the game it is capturing.
  const candidates = ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm']
  for (const type of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type
    } catch {
      // Keep looking.
    }
  }
  return ''
}

function waitForMetadata(video) {
  return new Promise((resolve) => {
    if (video.videoWidth > 0) {
      resolve()
      return
    }
    const timer = setTimeout(finish, 4000)
    function finish() {
      clearTimeout(timer)
      video.removeEventListener('loadedmetadata', finish)
      video.removeEventListener('resize', finish)
      resolve()
    }
    video.addEventListener('loadedmetadata', finish)
    video.addEventListener('resize', finish)
  })
}

function cropFor(rect, sourceWidth, sourceHeight, viewportWidth, viewportHeight) {
  const safeViewportWidth = Math.max(1, Number(viewportWidth) || sourceWidth)
  const safeViewportHeight = Math.max(1, Number(viewportHeight) || sourceHeight)
  const scaleX = sourceWidth / safeViewportWidth
  const scaleY = sourceHeight / safeViewportHeight

  const left = Math.max(0, Number(rect?.x) || 0)
  const top = Math.max(0, Number(rect?.y) || 0)
  const wantedWidth = Number(rect?.width) || safeViewportWidth
  const wantedHeight = Number(rect?.height) || safeViewportHeight

  const sx = Math.min(sourceWidth - 2, Math.max(0, Math.round(left * scaleX)))
  const sy = Math.min(sourceHeight - 2, Math.max(0, Math.round(top * scaleY)))
  const sw = Math.max(2, Math.min(sourceWidth - sx, Math.round(wantedWidth * scaleX)))
  const sh = Math.max(2, Math.min(sourceHeight - sy, Math.round(wantedHeight * scaleY)))

  let width = sw - (sw % 2)
  let height = sh - (sh % 2)
  if (width > MAX_WIDTH) {
    const shrink = MAX_WIDTH / width
    width = MAX_WIDTH
    height = Math.max(2, Math.round((height * shrink) / 2) * 2)
  }
  return { sx, sy, sw, sh, width, height }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const comma = result.indexOf(',')
      resolve(comma === -1 ? '' : result.slice(comma + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error('The clip could not be encoded.'))
    reader.readAsDataURL(blob)
  })
}

function send(message) {
  return chrome.runtime.sendMessage({ scope: SCOPE, ...message }).catch(() => {})
}

/* ------------------------------------------------------------------ *
 * Recording
 * ------------------------------------------------------------------ */

function draw(active) {
  if (!active || active.stopped) return
  try {
    active.context.drawImage(
      active.video,
      active.crop.sx,
      active.crop.sy,
      active.crop.sw,
      active.crop.sh,
      0,
      0,
      active.width,
      active.height,
    )
    active.lastDraw = Date.now()
  } catch {
    // A frame may be unavailable while the stream is starting up.
  }
}

async function begin({ streamId, rect, viewport }) {
  if (session) return { ok: false, error: 'A clip is already recording. Stop it first.' }
  if (!streamId) return { ok: false, error: 'Chrome did not return a capture stream.' }

  let stream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
          maxFrameRate: FPS,
        },
      },
    })
  } catch (error) {
    return { ok: false, error: `Chrome refused the capture: ${messageOf(error)}` }
  }

  const video = document.getElementById('source')
  const canvas = document.getElementById('crop')
  video.srcObject = stream
  video.muted = true
  video.playsInline = true

  try {
    await video.play().catch(() => {})
    await waitForMetadata(video)
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop())
    return { ok: false, error: messageOf(error) }
  }

  const sourceWidth = video.videoWidth || Math.max(2, Number(viewport?.width) || 2)
  const sourceHeight = video.videoHeight || Math.max(2, Number(viewport?.height) || 2)
  const crop = cropFor(rect, sourceWidth, sourceHeight, viewport?.width, viewport?.height)

  canvas.width = crop.width
  canvas.height = crop.height
  const context = canvas.getContext('2d', { alpha: false, desynchronized: true })
  if (!context) {
    stream.getTracks().forEach((track) => track.stop())
    return { ok: false, error: 'The recorder could not create a canvas.' }
  }
  context.fillStyle = '#000'
  context.fillRect(0, 0, crop.width, crop.height)

  const out = canvas.captureStream(FPS)
  const mime = pickMime()
  const bitrate = Math.min(12_000_000, Math.max(2_500_000, Math.round(crop.width * crop.height * FPS * 0.09)))

  let recorder
  try {
    recorder = mime
      ? new MediaRecorder(out, { mimeType: mime, videoBitsPerSecond: bitrate })
      : new MediaRecorder(out, { videoBitsPerSecond: bitrate })
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop())
    return { ok: false, error: `This browser cannot record: ${messageOf(error)}` }
  }

  const recording = {
    stream,
    video,
    context,
    recorder,
    chunks: [],
    crop,
    startedAt: Date.now(),
    lastDraw: 0,
    width: crop.width,
    height: crop.height,
    stopped: false,
    frameHandle: null,
    pumpTimer: null,
    guardTimer: null,
  }
  session = recording

  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size) recording.chunks.push(event.data)
  }
  recorder.start(500)

  // requestVideoFrameCallback is driven by the media pipeline, so it keeps
  // producing frames even though this document is never visible. The guard
  // timer covers browsers that starve it.
  const pump = () => {
    if (recording.stopped) return
    draw(recording)
    if (typeof recording.video.requestVideoFrameCallback === 'function') {
      recording.frameHandle = recording.video.requestVideoFrameCallback(pump)
    } else {
      recording.pumpTimer = setTimeout(pump, Math.round(1000 / FPS))
    }
  }
  pump()

  recording.guardTimer = setInterval(() => {
    if (recording.stopped) return
    if (Date.now() - recording.lastDraw > 250) draw(recording)
  }, 120)

  return { ok: true, width: crop.width, height: crop.height }
}

async function stop() {
  const active = session
  if (!active) return { ok: false, error: 'Nothing is recording.' }

  active.stopped = true

  if (active.guardTimer) clearInterval(active.guardTimer)
  if (active.pumpTimer) clearTimeout(active.pumpTimer)
  try {
    if (active.frameHandle != null && typeof active.video.cancelVideoFrameCallback === 'function') {
      active.video.cancelVideoFrameCallback(active.frameHandle)
    }
  } catch {
    // Already gone.
  }

  const duration = Date.now() - active.startedAt
  let blob = null
  try {
    blob = await new Promise((resolve) => {
      const finish = () =>
        resolve(new Blob(active.chunks, { type: active.recorder.mimeType || 'video/webm' }))
      active.recorder.onstop = finish
      try {
        active.recorder.stop()
      } catch {
        finish()
      }
    })
  } finally {
    session = null
    active.stream.getTracks().forEach((track) => track.stop())
    active.video.srcObject = null
  }

  if (!blob || !blob.size) {
    await send({ type: 'error', message: 'The clip came out empty. Try recording a little longer.' })
    return { ok: true, empty: true }
  }

  let base64 = ''
  try {
    base64 = await blobToBase64(blob)
  } catch (error) {
    await send({ type: 'error', message: messageOf(error) })
    return { ok: false, error: messageOf(error) }
  }

  for (let index = 0; index < base64.length; index += PIECE_BYTES) {
    await send({ type: 'chunk', data: base64.slice(index, index + PIECE_BYTES) })
  }

  await send({
    type: 'done',
    mime: blob.type || 'video/webm',
    width: active.width,
    height: active.height,
    duration,
    size: blob.size,
  })

  return { ok: true }
}

function cancel() {
  const active = session
  session = null
  if (!active) return
  active.stopped = true
  if (active.guardTimer) clearInterval(active.guardTimer)
  if (active.pumpTimer) clearTimeout(active.pumpTimer)
  try {
    if (active.recorder.state !== 'inactive') active.recorder.stop()
  } catch {
    // Already stopped.
  }
  try {
    active.stream.getTracks().forEach((track) => track.stop())
  } catch {
    // Already released.
  }
  active.video.srcObject = null
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only messages the service worker addressed to this document count; the page
  // and the worker use the same channel name.
  if (!message || message.scope !== SCOPE || message.to !== 'recorder') return

  if (message.type === 'begin') {
    begin(message)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: messageOf(error) }))
    return true
  }

  if (message.type === 'stop') {
    stop()
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: messageOf(error) }))
    return true
  }

  if (message.type === 'cancel') {
    cancel()
    sendResponse({ ok: true })
  }
})
