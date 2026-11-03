import { describe, expect, it } from 'vitest'
import { encodeText, headEnd, parseMessage, bodyKind, looksTextual } from './http'
import { toCurl } from './curl'
import { prettyJson, prettyMarkup } from './pretty'
import { hexRow } from './hex'
import { compileFilter, emptyFilter, pathExt } from './filter'
import { formatDuration } from './format'
import type { FlowSummary } from '@/api/client'

describe('http', () => {
  it('splits head and body', () => {
    const b = encodeText('GET / HTTP/1.1\r\nHost: a\r\nX: y: z\r\n\r\nbody')
    const m = parseMessage(b)
    expect(m.startLine).toBe('GET / HTTP/1.1')
    expect(m.headers).toEqual([
      ['Host', 'a'],
      ['X', 'y: z'],
    ])
    expect(new TextDecoder().decode(m.body)).toBe('body')
    expect(headEnd(encodeText('a\n\nb'))).toBe(3)
  })
  it('classifies bodies', () => {
    expect(bodyKind(encodeText('{"a":1}'))).toBe('json')
    expect(bodyKind(new Uint8Array([0, 1, 2]))).toBe('binary')
    expect(looksTextual(encodeText('x'), 'image/png')).toBe(false)
  })
})

describe('curl', () => {
  it('builds a command with quoting', () => {
    const raw = encodeText("POST /p?q=1 HTTP/1.1\r\nHost: ex.com\r\nX-A: it's\r\nContent-Length: 2\r\n\r\nhi")
    const c = toCurl(raw, { host: 'ex.com', port: 443, tls: true, http2: false })
    expect(c).toBe(
      `curl -sS --path-as-is -X 'POST' 'https://ex.com/p?q=1' -H 'X-A: it'\\''s' --data-binary 'hi'`,
    )
  })
})

describe('pretty', () => {
  it('formats json and markup', () => {
    expect(prettyJson('{"a":[1]}')).toBe('{\n  "a": [\n    1\n  ]\n}')
    expect(prettyJson('nope')).toBe('nope')
    expect(prettyMarkup('<div><br><p>x</p></div>')).toBe('<div>\n  <br>\n  <p>\n    x\n  </p>\n</div>')
  })
})

describe('hex', () => {
  it('renders a row', () => {
    const r = hexRow(encodeText('ABC'), 0)
    expect(r.offset).toBe('00000000')
    expect(r.hex.startsWith('41 42 43')).toBe(true)
    expect(r.ascii).toBe('ABC')
  })
})

describe('filter', () => {
  const flow = (p: Partial<FlowSummary>): FlowSummary => ({
    id: 1,
    ts_start: 0,
    scheme: 'https',
    host: 'api.example.com',
    port: 443,
    method: 'GET',
    path: '/a.js?x',
    http_version: 'HTTP/1.1',
    status: 200,
    req_size: 0,
    resp_size: 0,
    content_type: null,
    duration_us: 0,
    error: null,
    truncated: false,
    highlight: null,
    note: null,
    ...p,
  })
  it('matches like the server', () => {
    expect(pathExt('/a/b.JS?x=1.png')).toBe('js')
    const f = { ...emptyFilter(), host: '*.example.com', status: [2], hideStatic: false }
    expect(compileFilter(f)(flow({}))).toBe(true)
    expect(compileFilter({ ...f, hideStatic: true })(flow({}))).toBe(false)
    expect(compileFilter({ ...f, status: [0] })(flow({ status: null }))).toBe(true)
    expect(compileFilter({ ...emptyFilter(), q: 'EXAMPLE.COM/A' })(flow({}))).toBe(true)
    expect(compileFilter({ ...emptyFilter(), methods: ['POST'] })(flow({}))).toBe(false)
  })
  it('formats durations', () => {
    expect(formatDuration(500)).toBe('500 µs')
    expect(formatDuration(1500)).toBe('1.5 ms')
    expect(formatDuration(2_500_000)).toBe('2.50 s')
  })
})

import { buildPreview } from './render'
import { decodeBody, detectCharset } from './http'

describe('render preview', () => {
  const csp =
    /<meta http-equiv="Content-Security-Policy" content="default-src 'none';[^"]*"><meta name="referrer"/

  it('injects CSP right after the doctype', () => {
    const out = buildPreview(
      '<!doctype html><html><head><link rel=stylesheet href=//evil></head><body>x</body></html>',
      { external: false },
    )
    expect(out.startsWith('<!doctype html><meta http-equiv="Content-Security-Policy"')).toBe(true)
    expect(out).toMatch(csp)
    expect(out.indexOf('Content-Security-Policy')).toBeLessThan(out.indexOf('evil'))
    expect(out).not.toContain('<base')
  })
  it('cannot be hidden in a comment', () => {
    const out = buildPreview('<!-- <head> --><html><head><img src=//evil>', { external: false })
    expect(out.startsWith('<meta http-equiv="Content-Security-Policy"')).toBe(true)
    expect(out).toMatch(csp)
    expect(out.indexOf('Content-Security-Policy')).toBeLessThan(out.indexOf('<!--'))
  })
  it('handles fragments and escapes the base URL', () => {
    const out = buildPreview('<p>hi</p>', { external: true, baseUrl: 'https://a.com/"x' })
    expect(out.startsWith('<meta http-equiv="Content-Security-Policy"')).toBe(true)
    expect(out).toContain('<base href="https://a.com/&quot;x">')
    expect(out).toContain('img-src * data:')
  })
})

describe('charset', () => {
  it('decodes windows-1251 from header or meta', () => {
    const cp1251 = new Uint8Array([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]) // "Привет"
    expect(decodeBody(cp1251, 'text/html; charset=windows-1251')).toBe('Привет')
    const meta = new Uint8Array([...new TextEncoder().encode('<meta charset="windows-1251">'), ...cp1251])
    expect(detectCharset(meta)).toBe('windows-1251')
    expect(decodeBody(meta).endsWith('Привет')).toBe(true)
  })
})
