
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

    try { await document.fonts.load('200px "Curly"') } catch (e) {}
    try { await document.fonts.ready } catch (e) {}
    if (token !== renderToken) return

    const accent = accentColor()

    const W = 1330
    const H = 460
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')

    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    if ('letterSpacing' in ctx) ctx.letterSpacing = '-2px'

    const TEXT = 'Plutonium'
    const fontPx = 200
    ctx.font = fontPx + 'px "Curly", sans-serif'

    const x = W / 2
    const metrics = ctx.measureText(TEXT)
    const ascent = metrics.actualBoundingBoxAscent || (fontPx * 0.7)
    const descent = metrics.actualBoundingBoxDescent || (fontPx * 0.3)
    const y = H / 2 + (ascent - descent) / 2

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

    ctx.fillStyle = mixHex(accent, '#ffffff', 0.85)
    ctx.fillText(TEXT, x, y)

    ctx.save()
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.strokeStyle = accent
    ctx.lineWidth = 9
    ctx.shadowColor = accent
    ctx.shadowBlur = 8
    ctx.strokeText(TEXT, x, y)
    ctx.restore()

    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.strokeStyle = mixHex(accent, '#ffffff', 0.45)
    ctx.lineWidth = 3
    ctx.strokeText(TEXT, x, y)

    logo.style.backgroundImage = 'url(' + canvas.toDataURL('image/png') + ')'
    logo.classList.add('rendered')
  }

  const observer = new MutationObserver(() => {
    clearTimeout(renderTimer)
    renderTimer = setTimeout(render, 120)
  })
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] })

  render()
})()
