import { onAuthChange } from './cloud-store'
import { getPref, loadPrefs, setPref } from './prefs'

export type PerformanceFeatureId =
  | 'simpleGlass'
  | 'glowCursor'
  | 'borderBeam'
  | 'particleText'
  | 'flatBackground'
  | 'glow'
  | 'animations'
  | 'topBlur'

export type PerformanceFeature = {
  id: PerformanceFeatureId
  label: string
  hint: string
}

/** Every fine-tuning toggle Performance Mode owns. */
export const PERFORMANCE_FEATURES: PerformanceFeature[] = [
  {
    id: 'simpleGlass',
    label: 'Simple glass',
    hint: 'Swap glass UI for a standard CSS blur',
  },
  {
    id: 'glowCursor',
    label: 'Cursor glow',
    hint: 'Turn off the light trail that follows your pointer',
  },
  {
    id: 'borderBeam',
    label: 'Border beams',
    hint: 'Turn off the glowing beams that trace element borders',
  },
  {
    id: 'particleText',
    label: 'Title particles',
    hint: 'Turn off the particle effect on the Plutonium title',
  },
  {
    id: 'flatBackground',
    label: 'Flat wallpaper',
    hint: 'Remove wallpapers, effects and colours for a plain white and grey backdrop',
  },
  {
    id: 'glow',
    label: 'Glow effects',
    hint: 'Remove every glow, halo and shadow across the interface',
  },
  {
    id: 'animations',
    label: 'UI animations',
    hint: 'Turn off transitions and motion across the interface',
  },
  {
    id: 'topBlur',
    label: 'Top blur',
    hint: 'Turn off the blur ramp behind the tab bar',
  },
]

export type PerformanceState = {
  enabled: boolean
  features: Record<PerformanceFeatureId, boolean>
}

const STORE_KEY = 'plu_performance'
const ENABLED_PREF = 'performance'
const FEATURES_PREF = 'performanceFeatures'

const FEATURE_IDS = PERFORMANCE_FEATURES.map((feature) => feature.id)

function blankFeatures(): Record<PerformanceFeatureId, boolean> {
  return FEATURE_IDS.reduce(
    (acc, id) => {
      acc[id] = false
      return acc
    },
    {} as Record<PerformanceFeatureId, boolean>,
  )
}

function readFeatures(value: unknown): Record<PerformanceFeatureId, boolean> {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return FEATURE_IDS.reduce(
    (acc, id) => {
      acc[id] = source[id] === true
      return acc
    },
    {} as Record<PerformanceFeatureId, boolean>,
  )
}

function readLocal(): PerformanceState {
  try {
    const raw = sessionStorage.getItem(STORE_KEY)
    if (!raw) return { enabled: false, features: blankFeatures() }
    const parsed = JSON.parse(raw) as Partial<PerformanceState>
    return { enabled: parsed.enabled === true, features: readFeatures(parsed.features) }
  } catch {
    return { enabled: false, features: blankFeatures() }
  }
}

/** Expose the CSS-driven switches so one rule each can cover the whole UI. */
function applyRoot() {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (state.enabled && state.features.glow) root.dataset.perfGlow = 'off'
  else delete root.dataset.perfGlow
  if (state.enabled && state.features.animations) root.dataset.perfMotion = 'off'
  else delete root.dataset.perfMotion
}

let state = readLocal()
applyRoot()
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((listener) => listener())
}

function cache() {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(state))
  } catch {
  }
}

function commit(next: PerformanceState) {
  state = next
  applyRoot()
  cache()
  setPref(ENABLED_PREF, state.enabled)
  setPref(FEATURES_PREF, state.features)
  emit()
}

export function getPerformance() {
  return state
}

export function subscribePerformance(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** True when glass surfaces should render as a plain CSS blur. */
export function isSimpleGlass() {
  return state.enabled && state.features.simpleGlass
}

export function setPerformanceEnabled(enabled: boolean) {
  if (enabled === state.enabled) return
  commit({ ...state, enabled })
}

export function setPerformanceFeature(id: PerformanceFeatureId, value: boolean) {
  if (state.features[id] === value) return
  commit({ ...state, features: { ...state.features, [id]: value } })
}

/** Adopt what the cloud has without writing it straight back. */
function adopt(enabled: unknown, features: unknown) {
  // No synced document yet: keep whatever this browser already has.
  if (enabled === undefined && features === undefined) return
  const next: PerformanceState = { enabled: enabled === true, features: readFeatures(features) }
  const same = next.enabled === state.enabled && FEATURE_IDS.every((id) => next.features[id] === state.features[id])
  if (same) return
  state = next
  applyRoot()
  cache()
  emit()
}

void loadPrefs().then(() => adopt(getPref<boolean>(ENABLED_PREF), getPref<unknown>(FEATURES_PREF)))
onAuthChange((user) => {
  if (!user) return
  void loadPrefs().then(() => adopt(getPref<boolean>(ENABLED_PREF), getPref<unknown>(FEATURES_PREF)))
})
