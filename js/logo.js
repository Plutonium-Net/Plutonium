// Neon "Plutonium" logo — rendered ONCE to an offscreen canvas instead of a
// live SVG filter. A static bitmap costs nothing per frame (the old inline
// feGaussianBlur re-rasterized on every paint that touched it), and the
// flicker is now a plain opacity animation on the composited image.
(function () {
  const logo = document.getElementById('logo')
  if (!logo) return

  let renderToken = 0
  let renderTimer = null

  function accentColor() {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--ui-accent').trim()
    return /^#[0-9a-f]{6}$/i.test(v) ? v : '#e8175d'
  }

  function mixHex(a, b, t) {
    const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16))
    const pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16))
    return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')
  }

  async function render() {
    const token = ++renderToken

    // Make sure the Curly font is ready before drawing
    try { await document.fonts.load('200px "Curly"') } catch (e) {}
    try { await document.fonts.ready } catch (e) {}
    if (token !== renderToken) return

    const accent = accentColor()

    // 2x resolution for crisp rendering on retina displays. The canvas is
    // sized (same 26:9 aspect as the CSS box) with the glyph centered so the
    // wide halo has room to fall off above and below instead of being cut off
    // at the canvas edge like the old bottom-anchored layout.
    const W = 1330
    const H = 460
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')

    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    if ('letterSpacing' in ctx) ctx.letterSpacing = '-2px'

    // Curly's glyph box (ascent + descent ≈ 307px at 200px font) is taller
    // than the old 260px canvas, so the canvas is sized tall enough that the
    // full 200px text fits with no clipping — the big, bold look.
    const TEXT = 'Plutonium'
    const fontPx = 200
    ctx.font = fontPx + 'px "Curly", sans-serif'

    const x = W / 2
    const metrics = ctx.measureText(TEXT)
    const ascent = metrics.actualBoundingBoxAscent || (fontPx * 0.7)
    const descent = metrics.actualBoundingBoxDescent || (fontPx * 0.3)
    // Vertically center the glyph so the halo falls off evenly on both sides.
    const y = H / 2 + (ascent - descent) / 2

    // Three glow passes: wide ambient halo, mid glow, then a hot ring that
    // hugs the tube edge — the layered falloff is what sells "neon" over a
    // flat blur.
    ctx.save()
    ctx.shadowColor = accent
    ctx.globalAlpha = 0.55
    ctx.shadowBlur = 60
    ctx.fillStyle = accent
    ctx.fillText(TEXT, x, y)
    ctx.globalAlpha = 0.85
    ctx.shadowBlur = 26
    ctx.fillText(TEXT, x, y)
    ctx.globalAlpha = 1
    ctx.shadowBlur = 10
    ctx.fillText(TEXT, x, y)
    ctx.restore()

    // Hot gas core — the middle of a real tube reads almost white
    ctx.fillStyle = mixHex(accent, '#ffffff', 0.85)
    ctx.fillText(TEXT, x, y)

    // Glass tube walls: saturated accent stroke with its own tight glow,
    // so the brightest edge sits right on the tube like real glass.
    ctx.save()
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.strokeStyle = accent
    ctx.lineWidth = 9
    ctx.shadowColor = accent
    ctx.shadowBlur = 8
    ctx.strokeText(TEXT, x, y)
    ctx.restore()

    // Light caught on the inside wall of the glass — a thinner, whiter seam
    // running down the tube.
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.strokeStyle = mixHex(accent, '#ffffff', 0.45)
    ctx.lineWidth = 3
    ctx.strokeText(TEXT, x, y)

    logo.style.backgroundImage = 'url(' + canvas.toDataURL('image/png') + ')'
    logo.classList.add('rendered')
  }

  // Re-render when the theme accent changes (theme.js sets vars on <html>)
  const observer = new MutationObserver(() => {
    clearTimeout(renderTimer)
    renderTimer = setTimeout(render, 120)
  })
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] })

  render()
})()
