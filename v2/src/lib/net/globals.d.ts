/** Globals exposed by the vendored engine scripts in public/ (same as v1). */

type UvConfig = {
  prefix: string
  encodeUrl: (url: string) => string
  decodeUrl: (encoded: string) => string
  handler?: string
  client?: string
  bundle?: string
}

type ScramjetControllerInstance = {
  init: () => Promise<void>
  encodeUrl: (url: string) => string
  decodeUrl: (encoded: string) => string
}

type BareMuxConnectionInstance = {
  setTransport: (path: string, options: unknown[]) => Promise<void>
  getTransport: () => Promise<unknown>
}

interface Window {
  __uv$config?: UvConfig
  $scramjetLoadController?: () => { ScramjetController: new (options: unknown) => ScramjetControllerInstance }
  BareMux?: { BareMuxConnection: new (worker: string) => BareMuxConnectionInstance }
  PluRuntimeV2?: {
    ensure: (relayUrl: string) => Promise<boolean>
    encodeUrl: (url: string) => string
    decodeUrl: (frameUrl: string) => string
    setRelay: (relayUrl: string) => Promise<void>
  }
}
