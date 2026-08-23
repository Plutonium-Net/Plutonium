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

    // 2x resolution for crisp rendering on retina displays. H is tall enough
    // for Curly's full glyph box at 200px (ascent+descent ≈ 307px) plus glow,
    // so the big text never clips.
    const W = 1040
    const H = 360
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
    // Anchor the text near the bottom of the canvas so it spills toward the
    // search bar (glow room below), while the top margin keeps ascenders safe.
    const metrics = ctx.measureText(TEXT)
    const ascent = metrics.actualBoundingBoxAscent || (fontPx * 0.7)
    const descent = metrics.actualBoundingBoxDescent || (fontPx * 0.3)
    const y = H - descent - 12

    // Halo + tight glow (two passes ≈ the old feGaussianBlur merge)
    ctx.save()
    ctx.shadowColor = accent
    ctx.shadowBlur = 38
    ctx.fillStyle = accent
    ctx.fillText(TEXT, x, y)
    ctx.shadowBlur = 13
    ctx.fillText(TEXT, x, y)
    ctx.restore()

    // Bright tube: accent stroke + light fill
    ctx.lineJoin = 'round'
    ctx.strokeStyle = accent
    ctx.lineWidth = 2.5
    ctx.strokeText(TEXT, x, y)
    ctx.fillStyle = mixHex(accent, '#ffffff', 0.3)
    ctx.fillText(TEXT, x, y)

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
