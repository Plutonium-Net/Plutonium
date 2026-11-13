/* Scramjet V2 service worker — the runtimev2 engine.
 *
 * It lives at /runtimev2/ so its scope stays inside this engine's own prefix.
 * The app's v1 worker at /sw.js owns scope /, and the two coexist because a
 * page is handed to the most specific matching scope, not to every worker.
 *
 * All of the routing lives in the published controller (vendored next to this
 * file): it keeps one controller reference per tab, forwards every matching
 * request to the page that owns that prefix over a MessagePort, and hands the
 * response back. This file only wires its fetch handler up. */
importScripts('/runtimev2/controller.sw.js')

self.addEventListener('fetch', (event) => {
  if (typeof $scramjetController === 'undefined') return
  if (!$scramjetController.shouldRoute(event)) return
  event.respondWith($scramjetController.route(event))
})
