/// <reference types="vite/client" />

/** Injected by both Vite configs: the commit this build was cut from. */
declare const __PLU_COMMIT__: string

/** Injected by the download-page build: the lite file's size, e.g. "3.2 MB". */
declare const __PLU_SIZE__: string

/** The same build packaged as a single SVG. */
declare const __PLU_SVG_SIZE__: string

/** Injected by the download-page build: newest-first `[sha, date]` history. */
declare const __PLU_HISTORY__: [string, string][]


