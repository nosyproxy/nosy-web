/**
 * Byte-oriented encoders/decoders/hashes used by the Decoder and the selection
 * inspector. Everything works on Uint8Array so binary data survives chains
 * like base64 → gzip → text.
 */
import { md5 } from './md5'

const enc = new TextEncoder()
const utf8 = new TextDecoder()
export const toBytes = (s: string): Uint8Array => enc.encode(s)
export const toText = (b: Uint8Array): string => utf8.decode(b)
const latin1 = (b: Uint8Array) => {
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return s
}
const fromLatin1 = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff)

export class TransformError extends Error {}

// ------------------------------------------------------------------ base64

export function base64Decode(b: Uint8Array): Uint8Array {
  let s = toText(b).replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s) || s.replace(/=+$/, '').length % 4 === 1)
    throw new TransformError('invalid Base64')
  s = s.replace(/=+$/, '')
  s += '='.repeat((4 - (s.length % 4)) % 4)
  return fromLatin1(atob(s))
}
export const base64Encode = (b: Uint8Array) => toBytes(btoa(latin1(b)))
export const base64UrlEncode = (b: Uint8Array) =>
  toBytes(btoa(latin1(b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''))

// ------------------------------------------------------------------ url

const HEXCH = '0123456789ABCDEF'
const isHex = (c: number) => (c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102)
const hexVal = (c: number) => (c <= 57 ? c - 48 : (c | 0x20) - 87)

/** Percent-decoding at the byte level (`+` becomes a space, as in forms). */
export function urlDecode(b: Uint8Array): Uint8Array {
  const out = new Uint8Array(b.length)
  let n = 0
  for (let i = 0; i < b.length; i++) {
    const c = b[i]!
    if (c === 37 && i + 2 < b.length && isHex(b[i + 1]!) && isHex(b[i + 2]!)) {
      out[n++] = (hexVal(b[i + 1]!) << 4) | hexVal(b[i + 2]!)
      i += 2
    } else out[n++] = c === 43 ? 32 : c
  }
  return out.slice(0, n)
}

const UNRESERVED = /[A-Za-z0-9\-_.~]/
/** Encode everything except RFC 3986 unreserved characters. */
export function urlEncode(b: Uint8Array, all = false): Uint8Array {
  let s = ''
  for (const c of b) {
    const ch = String.fromCharCode(c)
    s += !all && c < 128 && UNRESERVED.test(ch) ? ch : `%${HEXCH[c >> 4]}${HEXCH[c & 15]}`
  }
  return toBytes(s)
}

// ------------------------------------------------------------------ html

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  copy: '©',
  reg: '®',
  trade: '™',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  laquo: '«',
  raquo: '»',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  bull: '•',
  middot: '·',
  deg: '°',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  sect: '§',
  para: '¶',
  times: '×',
  divide: '÷',
  plusmn: '±',
  larr: '←',
  rarr: '→',
  uarr: '↑',
  darr: '↓',
  sol: '/',
  colon: ':',
  lpar: '(',
  rpar: ')',
  equals: '=',
  num: '#',
  excl: '!',
  quest: '?',
  grave: '`',
}

export function htmlDecode(b: Uint8Array): Uint8Array {
  return toBytes(
    toText(b).replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);?/gi, (m, e: string) => {
      if (e[0] === '#') {
        const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
        return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m
      }
      return NAMED[e.toLowerCase()] ?? m
    }),
  )
}

export const htmlEncode = (b: Uint8Array) =>
  toBytes(
    toText(b).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' })[c]!,
    ),
  )

// ------------------------------------------------------------------ hex

export function hexDecode(b: Uint8Array): Uint8Array {
  const s = toText(b)
    .replace(/0x|\\x|%|[\s:,-]/gi, '')
    .toLowerCase()
  if (!/^[0-9a-f]*$/.test(s) || s.length % 2) throw new TransformError('invalid hex')
  const out = new Uint8Array(s.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16)
  return out
}
export const hexEncode = (b: Uint8Array) =>
  toBytes(Array.from(b, (c) => c.toString(16).padStart(2, '0')).join(''))

// ------------------------------------------------------------------ unicode / JS escapes

const SIMPLE: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0' }
export function unicodeDecode(b: Uint8Array): Uint8Array {
  return toBytes(
    toText(b).replace(/\\(u\{[0-9a-f]+\}|u[0-9a-f]{4}|x[0-9a-f]{2}|[nrtbfv0'"\\/])/gi, (_, e: string) => {
      if (e[0] === 'u' || e[0] === 'U') return String.fromCodePoint(parseInt(e.replace(/[u{}]/gi, ''), 16))
      if (e[0] === 'x' || e[0] === 'X') return String.fromCharCode(parseInt(e.slice(1), 16))
      return SIMPLE[e] ?? e
    }),
  )
}
export function unicodeEncode(b: Uint8Array): Uint8Array {
  let s = ''
  for (const ch of toText(b)) {
    const cp = ch.codePointAt(0)!
    if (cp >= 0x20 && cp < 0x7f) s += ch
    else if (cp > 0xffff) s += `\\u{${cp.toString(16)}}`
    else s += `\\u${cp.toString(16).padStart(4, '0')}`
  }
  return toBytes(s)
}

// ------------------------------------------------------------------ compression (native streams)

async function pipe(b: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const res = new Response(new Blob([b as BlobPart]).stream().pipeThrough(stream))
  return new Uint8Array(await res.arrayBuffer())
}
export async function gunzip(b: Uint8Array) {
  try {
    return await pipe(b, new DecompressionStream('gzip'))
  } catch {
    throw new TransformError('not valid gzip data')
  }
}
export const gzip = (b: Uint8Array) => pipe(b, new CompressionStream('gzip'))
export async function inflate(b: Uint8Array) {
  for (const f of ['deflate', 'deflate-raw'] as const) {
    try {
      return await pipe(b, new DecompressionStream(f))
    } catch {
      /* try next */
    }
  }
  throw new TransformError('not valid deflate data')
}

// ------------------------------------------------------------------ JWT

export function jwtDecode(b: Uint8Array): Uint8Array {
  const parts = toText(b).trim().split('.')
  if (parts.length < 2 || parts.length > 3)
    throw new TransformError('not a JWT (expected header.payload.signature)')
  const json = (p: string) => {
    try {
      return JSON.parse(toText(base64Decode(toBytes(p)))) as Record<string, unknown>
    } catch {
      throw new TransformError('not a JWT (segments are not Base64URL JSON)')
    }
  }
  const header = json(parts[0]!)
  const payload = json(parts[1]!)
  let out = `// header\n${JSON.stringify(header, null, 2)}\n\n// payload\n${JSON.stringify(payload, null, 2)}\n`
  const times = (['iat', 'nbf', 'exp'] as const).filter((k) => typeof payload[k] === 'number')
  if (times.length) {
    out += '\n'
    for (const k of times) {
      const d = new Date((payload[k] as number) * 1000)
      const expired = k === 'exp' && d.getTime() < Date.now() ? '  (expired)' : ''
      out += `// ${k}: ${d.toISOString()}${expired}\n`
    }
  }
  out += `\n// signature (${header.alg ?? '?'})\n${parts[2] || '(none)'}\n`
  return toBytes(out)
}

/** One-line JWT summary for the inline inspector: header · payload · expiry. */
export function jwtSummary(token: string): string {
  const [h, p] = token.trim().split('.')
  const json = (x: string) => JSON.parse(toText(base64Decode(toBytes(x)))) as Record<string, unknown>
  const payload = json(p!)
  let out = `${JSON.stringify(json(h!))}  ${JSON.stringify(payload)}`
  if (typeof payload.exp === 'number') {
    const d = new Date(payload.exp * 1000)
    out += `  exp ${d.toISOString()}${d.getTime() < Date.now() ? ' (expired)' : ''}`
  }
  return out
}

const JWT_RE = /^[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]*$/

// ------------------------------------------------------------------ hashes

async function digest(alg: string, b: Uint8Array) {
  return hexEncode(new Uint8Array(await crypto.subtle.digest(alg, b as BufferSource)))
}

// ------------------------------------------------------------------ registry

export type OpGroup = 'decode' | 'encode' | 'hash' | 'compress'
export interface Op {
  id: string
  label: string
  group: OpGroup
  run: (b: Uint8Array) => Uint8Array | Promise<Uint8Array>
  /** Synchronous ops can be used by the selection inspector and editor shortcuts. */
  sync: boolean
}

export const OPS: Op[] = [
  { id: 'b64-dec', label: 'Base64', group: 'decode', run: base64Decode, sync: true },
  { id: 'url-dec', label: 'URL', group: 'decode', run: urlDecode, sync: true },
  { id: 'html-dec', label: 'HTML', group: 'decode', run: htmlDecode, sync: true },
  { id: 'hex-dec', label: 'Hex', group: 'decode', run: hexDecode, sync: true },
  { id: 'uni-dec', label: 'Unicode / \\u', group: 'decode', run: unicodeDecode, sync: true },
  { id: 'jwt', label: 'JWT', group: 'decode', run: jwtDecode, sync: true },
  { id: 'b64-enc', label: 'Base64', group: 'encode', run: base64Encode, sync: true },
  { id: 'b64url-enc', label: 'Base64URL', group: 'encode', run: base64UrlEncode, sync: true },
  { id: 'url-enc', label: 'URL', group: 'encode', run: (b) => urlEncode(b), sync: true },
  { id: 'url-enc-all', label: 'URL (all)', group: 'encode', run: (b) => urlEncode(b, true), sync: true },
  { id: 'html-enc', label: 'HTML', group: 'encode', run: htmlEncode, sync: true },
  { id: 'hex-enc', label: 'Hex', group: 'encode', run: hexEncode, sync: true },
  { id: 'uni-enc', label: 'Unicode / \\u', group: 'encode', run: unicodeEncode, sync: true },
  { id: 'gunzip', label: 'Gunzip', group: 'compress', run: gunzip, sync: false },
  { id: 'inflate', label: 'Inflate (deflate)', group: 'compress', run: inflate, sync: false },
  { id: 'gzip', label: 'Gzip', group: 'compress', run: gzip, sync: false },
  { id: 'md5', label: 'MD5', group: 'hash', run: (b) => hexEncode(md5(b)), sync: true },
  { id: 'sha1', label: 'SHA-1', group: 'hash', run: (b) => digest('SHA-1', b), sync: false },
  { id: 'sha256', label: 'SHA-256', group: 'hash', run: (b) => digest('SHA-256', b), sync: false },
  { id: 'sha384', label: 'SHA-384', group: 'hash', run: (b) => digest('SHA-384', b), sync: false },
  { id: 'sha512', label: 'SHA-512', group: 'hash', run: (b) => digest('SHA-512', b), sync: false },
]
export const OP_BY_ID = new Map(OPS.map((o) => [o.id, o]))

// ------------------------------------------------------------------ detection

/** Mostly printable text (valid UTF-8, few control characters)? */
export function isPrintable(b: Uint8Array): boolean {
  if (!b.length) return true
  let s: string
  try {
    s = new TextDecoder('utf-8', { fatal: true }).decode(b)
  } catch {
    return false
  }
  let bad = 0
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c < 32 && c !== 9 && c !== 10 && c !== 13) bad++
  }
  return bad <= s.length * 0.02
}

const B64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
const B64URL_RE = /^[A-Za-z0-9_-]+$/

/**
 * Guess the next decoding step for `b`, or null. Used by "smart decode" to peel
 * nested encodings (e.g. URL → Base64 → gzip → JSON).
 */
export function detect(b: Uint8Array): string | null {
  if (b.length >= 2 && b[0] === 0x1f && b[1] === 0x8b) return 'gunzip'
  if (b.length >= 2 && b[0] === 0x78 && [0x01, 0x5e, 0x9c, 0xda].includes(b[1]!)) return 'inflate'
  if (!isPrintable(b) || b.length > 4 * 1024 * 1024) return null
  const s = toText(b).trim()
  if (s.length < 4) return null
  if (JWT_RE.test(s)) {
    try {
      jwtDecode(b)
      return 'jwt'
    } catch {
      /* not a JWT */
    }
  }
  if (/%[0-9a-f]{2}/i.test(s)) return 'url-dec'
  if (/&(#x?[0-9a-f]+|[a-z]{2,8});/i.test(s)) return 'html-dec'
  if (/\\(u[0-9a-f]{4}|u\{[0-9a-f]+\}|x[0-9a-f]{2})/i.test(s)) return 'uni-dec'
  const compact = s.replace(/\s+/g, '')
  if (compact.length >= 8 && compact.length % 2 === 0 && /^(0x)?[0-9a-f]+$/i.test(compact)) {
    const out = hexDecode(toBytes(compact))
    if (isPrintable(out) || detect(out) === 'gunzip') return 'hex-dec'
  }
  if (compact.length >= 8 && (B64_RE.test(compact) || B64URL_RE.test(compact))) {
    try {
      const out = base64Decode(toBytes(compact))
      if (out.length && (isPrintable(out) || detect(out) === 'gunzip' || detect(out) === 'inflate'))
        return 'b64-dec'
    } catch {
      /* not base64 */
    }
  }
  return null
}

export async function runOp(id: string, b: Uint8Array): Promise<Uint8Array> {
  const op = OP_BY_ID.get(id)
  if (!op) throw new TransformError(`unknown operation ${id}`)
  return op.run(b)
}

/** Repeatedly apply `detect` (max `limit` steps). Returns the chain of op ids. */
export async function smartChain(b: Uint8Array, limit = 8): Promise<string[]> {
  const chain: string[] = []
  let cur = b
  for (let i = 0; i < limit; i++) {
    const id = detect(cur)
    if (!id) break
    try {
      const next = await runOp(id, cur)
      if (next.length === cur.length && next.every((v, j) => v === cur[j])) break
      chain.push(id)
      cur = next
      if (id === 'jwt') break
    } catch {
      break
    }
  }
  return chain
}

/** Synchronous decodings of a selection for the inline inspector. */
export function inspect(text: string): { label: string; value: string; op: string }[] {
  const b = toBytes(text)
  const out: { label: string; value: string; op: string }[] = []
  const seen = new Set<string>([text])
  const tryOp = (op: string, label: string) => {
    try {
      const r = OP_BY_ID.get(op)!.run(b) as Uint8Array
      if (!r.length || !isPrintable(r)) return
      const v = toText(r)
      if (seen.has(v)) return
      seen.add(v)
      out.push({ label, value: v, op })
    } catch {
      /* not applicable */
    }
  }
  const s = text.trim()
  if (JWT_RE.test(s)) {
    try {
      out.push({ label: 'JWT', value: jwtSummary(s), op: 'jwt' })
    } catch {
      /* not a JWT */
    }
  }
  if (/%[0-9a-f]{2}|\+/i.test(s)) tryOp('url-dec', 'URL')
  if (/^[A-Za-z0-9+/_\-=\s]{4,}$/.test(s)) tryOp('b64-dec', 'Base64')
  if (/&(#x?[0-9a-f]+|[a-z]{2,8});/i.test(s)) tryOp('html-dec', 'HTML')
  if (/\\(u|x)[0-9a-f{]/i.test(s)) tryOp('uni-dec', 'Unicode')
  if (/^(0x)?([0-9a-f]{2}[\s:]?)+$/i.test(s) && s.replace(/[\s:]|0x/gi, '').length % 2 === 0)
    tryOp('hex-dec', 'Hex')
  return out
}
