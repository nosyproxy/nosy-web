import { parseMessage, decodeText } from './http'
import type { Target } from '@/api/client'

const quote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`

const SKIP = new Set(['content-length', 'connection', 'host', 'transfer-encoding'])

/** Build a cURL command from a raw HTTP/1.x request. */
export function toCurl(raw: Uint8Array, target: Target): string {
  const m = parseMessage(raw)
  const [method = 'GET', path = '/'] = m.startLine.split(' ')
  const hostHeader = m.headers.find(([k]) => k.toLowerCase() === 'host')?.[1]
  const scheme = target.tls ? 'https' : 'http'
  const defaultPort = target.tls ? 443 : 80
  const authority =
    hostHeader ?? (target.port === defaultPort ? target.host : `${target.host}:${target.port}`)
  const url = /^https?:\/\//.test(path) ? path : `${scheme}://${authority}${path}`

  const parts = ['curl', '-sS', '--path-as-is']
  if (target.http2) parts.push('--http2')
  if (method !== 'GET') parts.push('-X', quote(method))
  parts.push(quote(url))
  for (const [k, v] of m.headers) {
    if (SKIP.has(k.toLowerCase())) continue
    parts.push('-H', quote(`${k}: ${v}`))
  }
  if (m.body.length) parts.push('--data-binary', quote(decodeText(m.body)))
  return parts.join(' ')
}
