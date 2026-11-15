/**
 * The paint behind DistortionWave.
 *
 * The wave opens from the frame the search was picked in: the path starts as
 * that pill or row (a superellipse rounded to its own corners), eases into a
 * full-bleed circle, and its rim ripples and splits into chromatic bands. Every
 * colour is mixed from the accent the account is wearing, so the wave is never
 * a fixed palette. Positions are viewport (CSS) pixels; the caller has already
 * scaled the context for the device pixel ratio.
 *
 * The body is deliberately dark — a tinted near-black that hides the screen
 * swap — while the accent only shows up as the thin leading rim and the bands
 * behind it. Filling the window with the accent itself reads as a flash.
 */

export type WaveOrigin = { x: number; y: number; width: number; height: number }

export type WavePalette = {
  deep: string
  base: string
  light: string
  ice: string
  glow: string
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

/** The accent pulled apart into the bands the wave is built from. */
export function wavePalette(rgb: [number, number, number]): WavePalette {
  const { h, s, l } = rgbToHsl(rgb)
  // White is a valid accent, and a grey wave would lose the bands entirely, so
  // a floor on saturation keeps some colour in the effect either way.
  const sat = Math.max(30, s)

  return {
    // The body sits far below the accent in lightness; only the ice tone and the
    // glow keep the accent's own brightness, and both are used sparingly.
    deep: hsl(h + 8, sat * 0.42, l - 56),
    base: hsl(h, sat * 0.5, l - 46),
    light: hsl(h - 10, sat * 0.55, l - 34),
    ice: hsl(h + 20, sat * 0.7, l + 2),
    glow: hsl(h, sat, l, 0.18),
  }
}

/**
 * Traces one wave front: a superellipse through (ax, ay) with a rim that wobbles
 * with the angle, so the edge reads as a wave rather than a circle.
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
  const steps = 200
  ctx.beginPath()

  for (let i = 0; i <= steps; i += 1) {
    const theta = (i / steps) * TAU
    const cos = Math.cos(theta)
    const sin = Math.sin(theta)
    const horizontal = Math.abs(cos) / Math.max(ax, 0.001)
    const vertical = Math.abs(sin) / Math.max(ay, 0.001)
    const radius = Math.pow(Math.pow(horizontal, exponent) + Math.pow(vertical, exponent), -1 / exponent)

    const ripple =
      Math.sin(theta * 3.5 + phase * 1.9) * 0.5 +
      Math.sin(theta * 7 - phase * 1.3) * 0.32 +
      Math.sin(theta * 13 + phase * 0.7) * 0.18
    const distance = radius * (1 + wobble * ripple)

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

  const opened = 1 - Math.pow(1 - clamp01(cover), 5)
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

  const grow = 1 + 0.09 * easedFade
  const ax = Math.max(8, lerp(Math.max(origin.width, 16) / 2, reach, opened)) * grow
  const ay = Math.max(8, lerp(Math.max(origin.height, 16) / 2, reach, opened)) * grow
  const exponent = lerp(4.6, 2, opened)
  const wobble = 0.006 + 0.026 * opened
  const phase = time * 1.35
  const span = Math.max(ax, ay)

  // The wave fades up as it leaves the source instead of popping in at full
  // strength, which used to read as the pill flashing accent-coloured.
  const enter = Math.min(1, opened * 4 + 0.12)
  const wash = alpha * enter

  // The body: barely lifted at the centre, sinking to near-black at the rim, so
  // it covers the swap without lighting the window up.
  const body = ctx.createRadialGradient(cx, cy, 0, cx, cy, span * 1.04)
  body.addColorStop(0, palette.light)
  body.addColorStop(0.44, palette.base)
  body.addColorStop(1, palette.deep)

  ctx.save()
  ctx.globalAlpha = wash
  ctx.shadowColor = palette.glow
  ctx.shadowBlur = 24
  traceShape(ctx, cx, cy, ax, ay, exponent, wobble, phase)
  ctx.fillStyle = body
  ctx.fill()
  ctx.restore()

  // Bands trailing the front, each a little further behind and softer, which is
  // what sells the front as a wave instead of an expanding blob. They are the
  // accent's one bright moment, so they stay thin and low-alpha.
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  for (let band = 1; band <= 5; band += 1) {
    const inset = 1 - band * 0.052
    ctx.globalAlpha = wash * Math.max(0.03, 0.14 - band * 0.022)
    ctx.lineWidth = Math.max(1.5, span * 0.007 * (1 - band * 0.1))
    ctx.strokeStyle = band % 2 ? palette.ice : palette.light
    traceShape(
      ctx,
      cx,
      cy,
      ax * inset,
      ay * inset,
      exponent,
      wobble * (1 + band * 0.16),
      phase - band * 0.42,
    )
    ctx.stroke()
  }
  ctx.restore()

  // Interference rings inside the wash, only once the wave is wide enough for
  // them to read as caustics rather than as an outline of the source.
  if (opened > 0.12) {
    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    ctx.globalAlpha = wash * 0.1
    ctx.lineWidth = 1
    ctx.strokeStyle = palette.ice
    for (const scale of [0.4, 0.56, 0.7, 0.82]) {
      traceShape(ctx, cx, cy, ax * scale, ay * scale, exponent, wobble * 1.5, phase + scale * 3)
      ctx.stroke()
    }
    ctx.restore()
  }

  // The leading rim: the only place the accent is allowed to be bright.
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  ctx.globalAlpha = wash * 0.7
  ctx.lineJoin = 'round'
  ctx.strokeStyle = palette.ice
  ctx.lineWidth = 1.8
  ctx.shadowColor = palette.ice
  ctx.shadowBlur = 12
  traceShape(ctx, cx, cy, ax, ay, exponent, wobble, phase)
  ctx.stroke()
  ctx.restore()

  // A faint sheen across the wave, clipped to its own edge.
  ctx.save()
  traceShape(ctx, cx, cy, ax, ay, exponent, wobble, phase)
  ctx.clip()
  const sheen = ctx.createLinearGradient(cx - ax, cy - ay, cx + ax * 0.6, cy + ay)
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0.05)')
  sheen.addColorStop(0.45, 'rgba(255, 255, 255, 0.01)')
  sheen.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.globalAlpha = wash
  ctx.fillStyle = sheen
  ctx.fillRect(cx - ax * 1.2, cy - ay * 1.2, ax * 2.4, ay * 2.4)
  ctx.restore()
}
