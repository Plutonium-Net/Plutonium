/* Scramjet V2 — the `runtimev2` browsing engine.
 *
 * v2 is not shaped like v1. There is no encodeUrl/decodeUrl pair on a global
 * controller: a `Controller` owns the service-worker channel and a `Frame` owns
 * the rewriting context for one iframe (prefix, cookie jar, inject scripts).
 * Both are per-instance, so this module holds them and exposes a flat surface
 * that js/net.js can drive exactly the way it drives v1's runtimeController.
 *
 * Everything is lazy: no script is fetched and no worker is registered until
 * `ensure()` runs, which only happens when the engine is actually selected. A
 * profile that never picks Scramjet V2 pays for nothing but this file.
 *
 * The files in /runtimev2/ are the published @mercuryworkshop builds
 * (scramjet 2.0.67-alpha.2, scramjet-controller 0.0.14, libcurl-transport
 * 2.0.5), vendored here unmodified. Their globals:
 * scramjet.js -> self.$scramjet, controller.api.js -> $scramjetController,
 * libcurl.js -> LibcurlTransport. */
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
      // Order matters: the controller asserts the runtime version at
      // construction and reads it from the $scramjet global.
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

  /**
   * The worker has to be *active* before the controller hands it a port: a
   * message posted to an installing worker is silently dropped, and the worker
   * then never learns this controller's prefix — every proxied request would
   * miss the controller and go to the static host instead.
   *
   * navigator.serviceWorker.ready is no help here. This page sits outside the
   * worker's scope, so `ready` resolves for the app's own root worker rather
   * than for this one; the state change has to be waited on directly.
   */
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

    // The worker skips waiting on install, so activation lands right here.
    if (!registration.active) throw new Error('runtimev2 service worker did not activate')
    return registration.active
  }

  // libcurl speaks the same wisp protocol the v1 engines use, so this rides the
  // relay list the switcher already owns instead of a second URL.
  function buildTransport(wispUrl) {
    var api = window.LibcurlTransport
    if (!api || !api.LibcurlClient) throw new Error('libcurl client missing')
    return new api.LibcurlClient({ wisp: wispUrl })
  }

  // One frame for the app's single proxied iframe. The worker routes by prefix
  // and the page looks the frame up by the same prefix, so the element itself
  // only has to exist — net.js keeps pointing its src at rewritten URLs.
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

    // The controller exposes one shared config object; the published bootstrap
    // client mutates it the same way. The prefix has to stay inside this
    // engine's scope, which is why it is not the upstream default /~/sj/.
    api.config.prefix = BASE
    api.config.scramjetPath = FILES.scramjet
    api.config.injectPath = FILES.inject
    api.config.wasmPath = FILES.wasm

    controller = new api.Controller({
      serviceworker: serviceworker,
      transport: buildTransport(wispUrl),
    })
    await controller.wait()
    createFrame()
    ready = true
    return true
  }

  /** Register the worker, load the runtime and build the controller. */
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

  /** Point an already-built controller at another relay, for the switcher. */
  function setRelay(wispUrl) {
    if (!controller) return false
    try {
      // setTransport walks the existing frames and swaps the handler's client.
      controller.setTransport(buildTransport(wispUrl))
      return true
    } catch (e) {
      console.warn('[runtimev2] relay swap failed:', e)
      return false
    }
  }

  /**
   * v2's equivalent of v1's encodeUrl(). The same call the controller makes for
   * itself in Frame.go(), with the frame's own context so the prefix, cookie jar
   * and inject scripts all match the frame the worker will route to.
   */
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

  /** Unwrap a rewritten URL back to the original, for the address bar. */
  function decodeUrl(value) {
    if (!ready || !frameContext) return value
    var absolute = String(value == null ? '' : value)
    // unrewriteUrl shouts when it is handed something that is not ours, so the
    // prefix is checked here rather than inside it.
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
