(function initEngineSliderDrag() {
  const switchEl = document.querySelector('.engine-switch')
  const slider = document.getElementById('engine-slider')
  if (!switchEl || !slider) return

  let dragging = false
  let pointerId = null

  function enginesInOrder() {
    return Array.from(switchEl.querySelectorAll('.engine-btn'))
      .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)
  }

  function nearestEngine(clientX) {
    const engines = enginesInOrder()
    if (!engines.length) return null
    let best = engines[0]
    let bestDist = Math.abs(best.getBoundingClientRect().left + best.offsetWidth / 2 - clientX)
    for (let i = 1; i < engines.length; i++) {
      const rect = engines[i].getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const dist = Math.abs(cx - clientX)
      if (dist < bestDist) { bestDist = dist; best = engines[i] }
    }
    return best
  }

  function applyToEngine(engineBtn) {
    if (!engineBtn) return
    const engine = engineBtn.dataset.engine
    if (!engine || typeof setNetEngine !== 'function') return
    setNetEngine(engine)
  }

  function onPointerDown(e) {
    dragging = true
    pointerId = e.pointerId
    try { slider.setPointerCapture(e.pointerId) } catch (_) {}
    e.preventDefault()
  }

  function onPointerMove(e) {
    if (!dragging) return
    const target = nearestEngine(e.clientX)
    applyToEngine(target)
  }

  function onPointerUp(e) {
    if (!dragging) return
    dragging = false
    pointerId = null
    try { slider.releasePointerCapture(e.pointerId) } catch (_) {}
  }

  slider.addEventListener('pointerdown', onPointerDown)
  slider.addEventListener('pointermove', onPointerMove)
  slider.addEventListener('pointerup', onPointerUp)
  slider.addEventListener('pointercancel', onPointerUp)
})()
