const utf8 = new TextDecoder('utf-8', { fatal: false })
const enc = new TextEncoder()

const strictUtf8 = new TextDecoder('utf-8', { fatal: true })

export const decodeText = (b: Uint8Array): string => utf8.decode(b)
export const encodeText = (s: string): Uint8Array => enc.encode(s)

export function isUtf8(b: Uint8Array): boolean {
  try {
    strictUtf8.decode(b)
    return true
  } catch {
    return false
  }
}

const toBase64 = (b: Uint8Array): string => {
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(s)
}

/**
 * Editor text for a raw request. A body that is not valid UTF-8 cannot live in the
 * editor without corruption, so it is returned separately as base64.
 */
export function requestForEditor(b: Uint8Array): { raw: string; bodyB64: string | null } {
  const end = headEnd(b)
  if (end < 0 || end === b.length || isUtf8(b.subarray(end))) return { raw: decodeText(b), bodyB64: null }
  return { raw: decodeText(b.subarray(0, end)), bodyB64: toBase64(b.subarray(end)) }
}

/** Decoded size of a base64 string. */
export const base64Size = (s: string): number =>
  Math.floor((s.replace(/=+$/, '').length * 3) / 4)

/** Offset of the first byte after the head terminator (CRLFCRLF or LFLF), or -1. */
export function headEnd(b: Uint8Array): number {
  for (let i = 0; i + 1 < b.length; i++) {
    if (b[i] === 10) {
      if (b[i + 1] === 10) return i + 2
      if (b[i + 1] === 13 && b[i + 2] === 10) return i + 3
    }
  }
  return -1
}

export interface ParsedMessage {
  startLine: string
  headers: [string, string][]
  body: Uint8Array
  /** Byte length of the head including the terminator. */
  headLength: number
}

export function parseMessage(b: Uint8Array): ParsedMessage {
  const end = headEnd(b)
  const headBytes = end < 0 ? b : b.subarray(0, end)
  const body = end < 0 ? new Uint8Array() : b.subarray(end)
  const lines = decodeText(headBytes).split(/\r?\n/)
  const startLine = lines.shift() ?? ''
  const headers: [string, string][] = []
  for (const line of lines) {
    if (!line) continue
    const i = line.indexOf(':')
    if (i <= 0) continue
    headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()])
  }
  return { startLine, headers, body, headLength: end < 0 ? b.length : end }
}

export function header(headers: [string, string][], name: string): string | undefined {
  const n = name.toLowerCase()
  return headers.find(([k]) => k.toLowerCase() === n)?.[1]
}

/** Heuristic: does this body look like text? */
export function looksTextual(body: Uint8Array, contentType?: string | null): boolean {
  if (contentType) {
    const ct = contentType.toLowerCase()
    if (
      /^(text\/|application\/(json|.*\+json|javascript|ecmascript|xml|.*\+xml|x-www-form-urlencoded|graphql))/.test(
        ct,
      )
    )
      return true
    if (/^(image|audio|video|font)\/|octet-stream|protobuf|zip|pdf|wasm/.test(ct)) return false
  }
  const n = Math.min(body.length, 4096)
  let bad = 0
  for (let i = 0; i < n; i++) {
    const c = body[i]!
    if (c === 0) return false
    if (c < 9 || (c > 13 && c < 32)) bad++
  }
  return bad <= n * 0.05
}

export type BodyKind = 'json' | 'html' | 'xml' | 'text' | 'binary'

export function bodyKind(body: Uint8Array, contentType?: string): BodyKind {
  const ct = (contentType ?? '').toLowerCase()
  if (/json/.test(ct)) return 'json'
  if (/html/.test(ct)) return 'html'
  if (/xml|svg/.test(ct)) return 'xml'
  if (!looksTextual(body, contentType)) return 'binary'
  const first = decodeText(body.subarray(0, 64)).trimStart()[0]
  if (first === '{' || first === '[') return 'json'
  if (first === '<') return 'html'
  return 'text'
}

/** Charset from a Content-Type header, or sniffed from an HTML <meta> tag. */
export function detectCharset(body: Uint8Array, contentType?: string): string | undefined {
  const fromHeader = contentType && /charset\s*=\s*"?([\w.:-]+)/i.exec(contentType)?.[1]
  if (fromHeader) return fromHeader
  const head = new TextDecoder('latin1').decode(body.subarray(0, 2048))
  return /<meta[^>]+charset\s*=\s*["']?([\w.:-]+)/i.exec(head)?.[1]
}

/** Decode text honoring the declared charset (e.g. windows-1251), falling back to UTF-8. */
export function decodeBody(body: Uint8Array, contentType?: string): string {
  const charset = detectCharset(body, contentType)
  if (charset) {
    try {
      return new TextDecoder(charset).decode(body)
    } catch {
      /* unknown label */
    }
  }
  return decodeText(body)
}

export const isImage = (ct?: string) => !!ct && /^image\//i.test(ct.trim())
export const isHtml = (ct?: string) => !!ct && /^(text\/html|application\/xhtml\+xml)/i.test(ct.trim())
