(function initEngineSliderDrag() {
  const switchEl = document.querySelector('.engine-switch')
  const slider = document.getElementById('engine-slider')
  if (!switchEl || !slider) return

  let pointerId = null
  let startX = 0
  let dragging = false
  let lastEngine = null
  let suppressClickUntil = 0
  // Natural (un-stretched) geometry of the bar, captured when a drag starts
  // so the elastic overscroll is measured against a stable reference.
  let naturalRect = null
  let baseWidth = 0

  // How far the pill can stretch past either horizontal edge before it
  // resists (the asymptote). The curve tracks the pointer almost 1:1 right
  // at the edge, then tightens up like a rubber band being pulled.
  const MAX_STRETCH = 56

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
    if (engine === lastEngine) return
    lastEngine = engine
    setNetEngine(engine)
  }

  function stretchFor(pull) {
    // Classic elastic overscroll curve: ~1:1 right after the edge, then it
    // eases off as it approaches MAX_STRETCH.
    return MAX_STRETCH * (1 - Math.exp(-pull / MAX_STRETCH))
  }

  function positionSliderTo(clientX) {
    // Pulling past an edge stretches the whole switch (the bar) out on
    // that side while the far edge stays pinned. The pill follows along:
    // its pulled edge rides out to the bar's new edge, its other edge
    // stays glued to the buttons.
    const overLeft = naturalRect.left - clientX
    const overRight = clientX - naturalRect.right
    let ext = 0
    if (overLeft > 0) {
      ext = stretchFor(overLeft)
      switchEl.style.width = (baseWidth + ext) + 'px'
      // The switch sits centered in the new-tab column, so widening
      // pushes both edges out equally; shift left by half to pin the
      // right edge in place while the left edge follows the pointer.
      switchEl.style.transform = 'translateX(' + (-ext / 2) + 'px)'
    } else if (overRight > 0) {
      ext = stretchFor(overRight)
      switchEl.style.width = (baseWidth + ext) + 'px'
      switchEl.style.transform = 'translateX(' + (ext / 2) + 'px)'
    } else {
      switchEl.style.width = ''
      switchEl.style.transform = ''
    }

    const switchRect = switchEl.getBoundingClientRect()
    const engines = enginesInOrder()
    if (!engines.length) return
    const pts = engines.map(function (e) {
      const r = e.getBoundingClientRect()
      return { left: r.left - switchRect.left, width: r.width, center: r.left + r.width / 2 - switchRect.left }
    })
    const first = pts[0].center
    const last = pts[pts.length - 1].center
    if (last === first) return
    let t = (clientX - switchRect.left - first) / (last - first)
    t = Math.max(0, Math.min(1, t))
    const scaled = t * (pts.length - 1)
    const idx = Math.min(pts.length - 2, Math.floor(scaled))
    const f = scaled - idx
    const a = pts[idx]
    const b = pts[idx + 1]
    const natLeft = a.left + (b.left - a.left) * f
    const natRight = natLeft + (a.width + (b.width - a.width) * f)

    if (overLeft > 0) {
      // Left edge pulled out: the pill's left edge rides to the bar's
      // edge, its right edge stays glued to the last button.
      slider.style.left = '0px'
      slider.style.width = natRight + 'px'
    } else if (overRight > 0) {
      // Right edge pulled out: the pill's left edge stays glued to the
      // first button, its right edge rides out to the bar's edge.
      slider.style.left = natLeft + 'px'
      slider.style.width = (baseWidth + ext - natLeft) + 'px'
    } else {
      slider.style.left = natLeft + 'px'
      slider.style.width = (natRight - natLeft) + 'px'
    }
  }

  switchEl.addEventListener('pointerdown', function (e) {
    if (pointerId !== null) return
    pointerId = e.pointerId
    startX = e.clientX
    dragging = false
    lastEngine = null
    naturalRect = switchEl.getBoundingClientRect()
    baseWidth = naturalRect.width
    try { switchEl.setPointerCapture(e.pointerId) } catch (_) {}
  })

  switchEl.addEventListener('pointermove', function (e) {
    if (e.pointerId !== pointerId) return
    if (!dragging && Math.abs(e.clientX - startX) > 5) {
      dragging = true
      switchEl.classList.add('dragging')
    }
    if (!dragging) return
    applyToEngine(nearestEngine(e.clientX))
    positionSliderTo(e.clientX)
  })

  function endDrag(e) {
    if (e.pointerId !== pointerId) return
    if (dragging) suppressClickUntil = Date.now() + 150
    pointerId = null
    dragging = false
    switchEl.classList.remove('dragging')
    // Let the bar spring back to its natural size (its CSS transition
    // runs now that .dragging is gone), then re-home the pill.
    switchEl.style.width = ''
    switchEl.style.transform = ''
    try { switchEl.releasePointerCapture(e.pointerId) } catch (_) {}
    // Re-home the pill over the selected engine on the next frame so the CSS
    // transition has a chance to run and the pill visibly springs back.
    requestAnimationFrame(function () {
      if (typeof syncEngineButtons === 'function') syncEngineButtons()
    })
  }

  switchEl.addEventListener('pointerup', endDrag)
  switchEl.addEventListener('pointercancel', endDrag)

  switchEl.addEventListener('click', function (e) {
    if (Date.now() < suppressClickUntil) {
      e.preventDefault()
      e.stopImmediatePropagation()
    }
  }, true)
})()
