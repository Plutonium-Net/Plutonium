(function () {
  'use strict'

  var BASE = '/runtimev2/'
  var FILES = {
    worker: BASE + 'sw.js',
    scramjet: BASE + 'scramjet.js',
    controller: BASE + 'controller.api.js',
    inject: BASE + 'controller.inject.js',
    wasm: BASE + 'scramjet.wasm',
    transport: BASE + 'libcurl.js',
  }

  var controller = null
  var frame = null
  var frameContext = null
  var ready = false
  var ensurePromise = null
  var scriptPromises = {}

  function loadScript(src) {
    if (scriptPromises[src]) return scriptPromises[src]
    scriptPromises[src] = new Promise(function (resolve, reject) {
      var el = document.createElement('script')
      el.src = src
      el.async = false
      el.onload = function () { resolve(src) }
      el.onerror = function () {
        delete scriptPromises[src]
        reject(new Error('Failed to load ' + src))
      }
      ;(document.head || document.documentElement).appendChild(el)
    })
    return scriptPromises[src]
  }

  async function registerWorker() {
    if (!('serviceWorker' in navigator)) throw new Error('service workers unavailable')
    var registration = await navigator.serviceWorker.register(FILES.worker, {
      scope: BASE,
      updateViaCache: 'none',
    })

    if (registration.active) return registration.active

    var pending = registration.installing || registration.waiting
    if (!pending) throw new Error('runtimev2 service worker did not install')

    await new Promise(function (resolve) {
      if (pending.state === 'activated') { resolve(); return }
      pending.addEventListener('statechange', function onChange() {
        if (pending.state !== 'activated') return
        pending.removeEventListener('statechange', onChange)
        resolve()
      })
    })

    if (!registration.active) throw new Error('runtimev2 service worker did not activate')
    return registration.active
  }

  function buildTransport(wispUrl) {
    var api = window.LibcurlTransport
    if (!api || !api.LibcurlClient) throw new Error('libcurl client missing')
    return new api.LibcurlClient({ wisp: wispUrl })
  }

  function createFrame() {
    var element = document.getElementById('page-frame')
    if (!element) throw new Error('no #page-frame to proxy into')
    frame = controller.createFrame(element)
    frameContext = frame.context
    return frame
  }

  async function boot(wispUrl) {
    if (!wispUrl) throw new Error('no wisp relay url')

    var serviceworker = await registerWorker()
    await loadScript(FILES.scramjet)
    await loadScript(FILES.controller)
    await loadScript(FILES.transport)

    var api = window.$scramjetController
    if (!api || !api.Controller) throw new Error('scramjet controller missing')
    if (!window.$scramjet || !window.$scramjet.rewriteUrl) throw new Error('scramjet runtime missing')

    api.config.prefix = BASE
    api.config.scramjetPath = FILES.scramjet
    api.config.injectPath = FILES.inject
    api.config.wasmPath = FILES.wasm

    var transport = buildTransport(wispUrl)
    await transport.init()

    controller = new api.Controller({
      serviceworker: serviceworker,
      transport: transport,
    })
    await controller.wait()
    createFrame()
    ready = true
    return true
  }

  function ensure(wispUrl) {
    if (ready) return Promise.resolve(true)
    if (ensurePromise) return ensurePromise

    ensurePromise = boot(wispUrl)
      .catch(function (e) {
        console.warn('[runtimev2] init failed:', e)
        ready = false
        return false
      })
      .finally(function () { ensurePromise = null })

    return ensurePromise
  }

  async function setRelay(wispUrl) {
    if (!controller) return false
    try {
      var transport = buildTransport(wispUrl)
      await transport.init()
      controller.setTransport(transport)
      return true
    } catch (e) {
      console.warn('[runtimev2] relay swap failed:', e)
      return false
    }
  }

  function encodeUrl(url) {
    if (!ready || !frameContext) return url
    try {
      return window.$scramjet.rewriteUrl(String(url), frameContext, {
        origin: new URL(location.href),
        base: new URL(location.href),
      })
    } catch (e) {
      console.warn('[runtimev2] rewrite failed:', e)
      return url
    }
  }

  function decodeUrl(value) {
    if (!ready || !frameContext) return value
    var absolute = String(value == null ? '' : value)
    if (!absolute.startsWith(frameContext.prefix.href)) return value
    try {
      return window.$scramjet.unrewriteUrl(absolute, frameContext)
    } catch (e) {
      return value
    }
  }

  window.PluRuntimeV2 = {
    ensure: ensure,
    setRelay: setRelay,
    encodeUrl: encodeUrl,
    decodeUrl: decodeUrl,
    base: BASE,
    get ready() { return ready },
    get prefix() { return frameContext ? frameContext.prefix.href : '' },
  }
})()
