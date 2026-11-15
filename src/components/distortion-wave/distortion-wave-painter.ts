/**
 * The paint behind DistortionWave.
 *
 * The wave opens from the frame the search was picked in: the path starts as
 * that pill or row (a superellipse rounded to its own corners), eases into a
 * full-bleed circle, and carries a lit crest on its leading edge.
 *
 * The body is deliberately dark — a black core that hides the screen swap, with
 * the accent only arriving as a dark tint ring and a soft crest of light at the
 * rim. Filling the window with the accent itself reads as a flash; painting hard
 * concentric rings reads as a diagram. Everything here is soft bloom and low
 * alpha so the wave looks like light rather than geometry.
 *
 * Positions are viewport (CSS) pixels; the caller has already scaled the context
 * for the device pixel ratio.
 */

export type WaveOrigin = { x: number; y: number; width: number; height: number }

export type WavePalette = {
  /** The body never lifts above black. */
  light: string
  deep: string
  base: string
  /** The accent itself, for the crest. */
  ice: string
  /** The accent's hue-shifted partner, for the chromatic split on the edge. */
  ember: string
  /** A lifted accent, for the hottest part of the crest. */
  bloom: string
}

const TAU = Math.PI * 2

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount

function rgbToHsl(rgb: [number, number, number]) {
  const r = rgb[0] / 255
  const g = rgb[1] / 255
  const b = rgb[2] / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: l * 100 }

  const delta = max - min
  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min)
  let h: number
  if (max === r) h = ((g - b) / delta + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / delta + 2) / 6
  else h = ((r - g) / delta + 4) / 6

  return { h: h * 360, s: s * 100, l: l * 100 }
}

const hsl = (h: number, s: number, l: number, alpha = 1) =>
  `hsla(${((h % 360) + 360) % 360}, ${Math.min(100, Math.max(0, s))}%, ${Math.min(
    96,
    Math.max(2, l),
  )}%, ${alpha})`

/** The accent pulled apart into the tones the wave is built from. */
export function wavePalette(rgb: [number, number, number]): WavePalette {
  const { h, s, l } = rgbToHsl(rgb)
  // White is a valid accent, and a grey wave would lose the crest entirely, so
  // a floor on saturation keeps some colour in the effect either way.
  const sat = Math.max(30, s)

  return {
    // The body sits far below the accent in lightness; only the crest keeps the
    // accent's own brightness, and it is only ever a rim of light.
    light: '#000000',
    deep: hsl(h + 8, sat * 0.45, l - 54),
    base: hsl(h, sat * 0.52, l - 42),
    ice: hsl(h + 20, sat * 0.72, l + 2),
    ember: hsl(h - 16, sat * 0.65, l - 2),
    bloom: hsl(h + 18, sat * 0.85, l + 16),
  }
}

/**
 * Traces one wave front: a superellipse through (ax, ay) whose rim swells with
 * the angle, so the edge reads as a wave rather than a circle. The harmonics are
 * low and few on purpose — three fast ones made the outline look chewed.
 */
function traceShape(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  ax: number,
  ay: number,
  exponent: number,
  wobble: number,
  phase: number,
) {
  const steps = 180
  ctx.beginPath()

  for (let i = 0; i <= steps; i += 1) {
    const theta = (i / steps) * TAU
    const cos = Math.cos(theta)
    const sin = Math.sin(theta)
    const horizontal = Math.abs(cos) / Math.max(ax, 0.001)
    const vertical = Math.abs(sin) / Math.max(ay, 0.001)
    const radius = Math.pow(Math.pow(horizontal, exponent) + Math.pow(vertical, exponent), -1 / exponent)

    // Two slow lobes drifting around the rim, and a whisper of a third.
    const swell =
      Math.sin(theta * 2 + phase * 0.9) * 0.62 +
      Math.sin(theta * 3 - phase * 0.7) * 0.26 +
      Math.sin(theta * 5 + phase * 0.5) * 0.12
    const distance = radius * (1 + wobble * swell)

    const x = cx + cos * distance
    const y = cy + sin * distance
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }

  ctx.closePath()
}

export function paintWave(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  origin: WaveOrigin,
  cover: number,
  reveal: number,
  time: number,
  palette: WavePalette,
  reduced = false,
) {
  ctx.clearRect(0, 0, width, height)

  const fade = clamp01(reveal)

  // Reduced motion still needs the cover, just without the travel: a flat wash.
  if (reduced) {
    const alpha = 1 - fade
    if (alpha <= 0) return
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.fillStyle = palette.base
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
    return
  }

  const progress = clamp01(cover)
  // Gentler than an ease-out quart: a faster curve put 94% of the radius behind
  // the crest by the halfway point, so the lit edge only existed for a flash.
  const opened = Math.pow(progress, 0.82)
  const easedFade = fade * fade * (3 - 2 * fade)
  const alpha = 1 - easedFade
  if (alpha <= 0) return

  const cx = origin.x + origin.width / 2
  const cy = origin.y + origin.height / 2

  // Far enough that the final circle clears every corner.
  const reach =
    Math.max(
      Math.hypot(cx, cy),
      Math.hypot(width - cx, cy),
      Math.hypot(cx, height - cy),
      Math.hypot(width - cx, height - cy),
    ) + 72

  const grow = 1 + 0.06 * easedFade
  const ax = Math.max(8, lerp(Math.max(origin.width, 16) / 2, reach, opened)) * grow
  const ay = Math.max(8, lerp(Math.max(origin.height, 16) / 2, reach, opened)) * grow

  // The source is a capsule, not a superellipse, so the outline rounds off in
  // the first third of the flight instead of staying a wide blob for the whole
  // journey. Likewise the ripple peaks mid-flight and is gone by full cover, so
  // the edge never looks chewed once it is edge of the screen.
  const exponent = lerp(4.2, 2, Math.min(1, opened * 1.7))
  const wobble = 0.016 * Math.sin(Math.PI * progress)
  const phase = time * 1.1
  const span = Math.max(ax, ay)

  // The wave fades up as it leaves the source instead of popping in at full
  // strength, which used to read as the pill flashing accent-coloured.
  const enter = Math.min(1, opened * 4 + 0.12)
  const wash = alpha * enter

  const shape = (scale: number, phaseShift = 0) =>
    traceShape(ctx, cx, cy, ax * scale, ay * scale, exponent, wobble, phase + phaseShift)

  // The body: black through the middle, with a dark accent tint only as it
  // gathers towards the crest. This is what covers the screen swap.
  const body = ctx.createRadialGradient(cx, cy, span * 0.06, cx, cy, span)
  body.addColorStop(0, palette.light)
  body.addColorStop(0.6, palette.light)
  body.addColorStop(0.87, palette.deep)
  body.addColorStop(1, palette.base)

  ctx.save()
  ctx.globalAlpha = wash
  shape(1)
  ctx.fillStyle = body
  ctx.fill()
  ctx.restore()

  // Soft ripples inside the wash, wide and faint, so the body reads as liquid
  // depth instead of a flat cut-out.
  if (opened > 0.08) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineJoin = 'round'
    for (const [scale, width, strength] of [
      [0.94, 26, 0.05],
      [0.82, 20, 0.036],
      [0.66, 16, 0.024],
    ]) {
      ctx.globalAlpha = wash * strength
      ctx.lineWidth = width * Math.min(1, opened + 0.2)
      ctx.strokeStyle = palette.base
      shape(scale, scale * 2.2)
      ctx.stroke()
    }
    ctx.restore()
  }

  // The crest: the same outline stroked at growing widths and falling alpha, so
  // additive light piles up into a hot edge with a soft halo. Wide strokes with
  // 'lighter' are what make it glow; a shadowBlur was the flat-looking shortcut.
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineJoin = 'round'
  const bloomSteps = 9
  for (let step = 0; step < bloomSteps; step += 1) {
    const t = step / (bloomSteps - 1)
    ctx.globalAlpha = wash * 0.11 * Math.pow(1 - t, 1.85)
    ctx.lineWidth = 1.4 + t * t * 46
    ctx.strokeStyle = step === 0 ? palette.bloom : palette.ice
    shape(1 - t * 0.01)
    ctx.stroke()
  }
  ctx.restore()

  // The chromatic split: a warm arc just outside the crest and a cool one just
  // inside it, which is what makes the edge look refractive rather than drawn.
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 1.6
  ctx.globalAlpha = wash * 0.2
  ctx.strokeStyle = palette.ember
  shape(1.004)
  ctx.stroke()
  ctx.globalAlpha = wash * 0.28
  ctx.strokeStyle = palette.bloom
  shape(0.996)
  ctx.stroke()
  ctx.restore()

  // A crisp line at the very front, so the crest has a defined edge.
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = wash * 0.42
  ctx.lineWidth = 1
  ctx.strokeStyle = palette.bloom
  shape(1)
  ctx.stroke()
  ctx.restore()

  // A faint cold sheen falling across the body, clipped to the wave.
  ctx.save()
  shape(1)
  ctx.clip()
  const sheen = ctx.createLinearGradient(cx - ax, cy - ay, cx + ax * 0.5, cy + ay)
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0.035)')
  sheen.addColorStop(0.4, 'rgba(255, 255, 255, 0.008)')
  sheen.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.globalAlpha = wash
  ctx.fillStyle = sheen
  ctx.fillRect(cx - ax * 1.2, cy - ay * 1.2, ax * 2.4, ay * 2.4)
  ctx.restore()
}
