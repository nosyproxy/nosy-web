import { describe, expect, it } from 'vitest'
import {
  base64Decode,
  base64Encode,
  base64UrlEncode,
  detect,
  gunzip,
  gzip,
  hexDecode,
  hexEncode,
  htmlDecode,
  htmlEncode,
  inspect,
  isPrintable,
  jwtDecode,
  runOp,
  smartChain,
  toBytes,
  toText,
  unicodeDecode,
  unicodeEncode,
  urlDecode,
  urlEncode,
} from './transform'
import { md5 } from './md5'

const s = (b: Uint8Array) => toText(b)
const b = toBytes

describe('transform', () => {
  it('base64 / base64url', () => {
    expect(s(base64Encode(b('Привет, мир')))).toBe('0J/RgNC40LLQtdGCLCDQvNC40YA=')
    expect(s(base64Decode(b('0J/RgNC40LLQtdGCLCDQvNC40YA=')))).toBe('Привет, мир')
    expect(s(base64Decode(b('0J_RgNC40LLQtdGCLCDQvNC40YA')))).toBe('Привет, мир') // url-safe, unpadded
    expect(s(base64UrlEncode(new Uint8Array([0xfb, 0xff])))).toBe('-_8')
    expect(() => base64Decode(b('a$b'))).toThrow()
  })
  it('url (byte-level, + as space)', () => {
    expect(s(urlDecode(b('a%20b+c%2Fd%zz%E2%9C%93')))).toBe('a b c/d%zz✓')
    expect(s(urlEncode(b('a b/✓')))).toBe('a%20b%2F%E2%9C%93')
    expect(s(urlEncode(b('ab'), true))).toBe('%61%62')
  })
  it('html entities', () => {
    expect(s(htmlDecode(b('&lt;a href=&quot;x&quot;&gt; &amp;amp; &#39;&#x41; &laquo;&unknown;')))).toBe(
      `<a href="x"> &amp; 'A «&unknown;`,
    )
    expect(s(htmlEncode(b(`<"'&>`)))).toBe('&lt;&quot;&#x27;&amp;&gt;')
  })
  it('hex', () => {
    expect(s(hexEncode(b('AZ')))).toBe('415a')
    expect(s(hexDecode(b('0x41 5a')))).toBe('AZ')
    expect(s(hexDecode(b('\\x41\\x5a')))).toBe('AZ')
    expect(() => hexDecode(b('abc'))).toThrow()
  })
  it('unicode escapes', () => {
    expect(s(unicodeDecode(b('\\u041f\\u0440\\x21\\n\\u{1F600}')))).toBe('Пр!\n😀')
    expect(s(unicodeEncode(b('aП😀')))).toBe('a\\u041f\\u{1f600}')
  })
  it('gzip round trip', async () => {
    const z = await gzip(b('hello hello hello'))
    expect(z[0]).toBe(0x1f)
    expect(s(await gunzip(z))).toBe('hello hello hello')
    await expect(gunzip(b('nope'))).rejects.toThrow()
  })
  it('hashes match reference vectors', async () => {
    expect(s(hexEncode(md5(b(''))))).toBe('d41d8cd98f00b204e9800998ecf8427e')
    expect(s(hexEncode(md5(b('The quick brown fox jumps over the lazy dog'))))).toBe(
      '9e107d9d372bb6826bd81d3542a419d6',
    )
    expect(s(hexEncode(md5(new Uint8Array(1000).fill(97))))).toBe('cabe45dcc9ae5b66ba86600cca6b8ba8')
    expect(s(await runOp('sha256', b('abc')))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    expect(s(await runOp('sha1', b('abc')))).toBe('a9993e364706816aba3e25717850c26c9cd0d89d')
  })
  it('jwt', () => {
    const tok =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
    const out = s(jwtDecode(b(tok)))
    expect(out).toContain('"alg": "HS256"')
    expect(out).toContain('"name": "John Doe"')
    expect(out).toContain('// iat: 2018-01-18T01:30:22.000Z')
    expect(out).toContain('SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c')
  })
  it('detects and peels nested encodings', async () => {
    const inner = b('{"user":"admin"}')
    const layered = urlEncode(base64Encode(await gzip(inner)))
    const chain = await smartChain(layered)
    expect(chain.slice(-2)).toEqual(['b64-dec', 'gunzip'])
    let cur = layered
    for (const op of chain) cur = await runOp(op, cur)
    expect(s(cur)).toBe('{"user":"admin"}')
    expect(await smartChain(urlEncode(base64Encode(b('admin:secret?'))))).toEqual(['url-dec', 'b64-dec'])
    expect(detect(b('hello world'))).toBeNull()
    expect(detect(b('68656c6c6f20776f726c64'))).toBe('hex-dec')
    expect(isPrintable(new Uint8Array([0xff, 0xfe]))).toBe(false)
  })
  it('inspects selections', () => {
    const r = inspect('YWRtaW46c2VjcmV0')
    expect(r).toEqual([{ label: 'Base64', value: 'admin:secret', op: 'b64-dec' }])
    expect(inspect('a%3Db%26c').map((x) => x.value)).toEqual(['a=b&c'])
    expect(inspect('plain')).toEqual([])
    const jwt = inspect('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiIsImV4cCI6MTcwMDAwMDAwMH0.sig')
    expect(jwt[0]!.value).toBe(
      '{"alg":"HS256"}  {"sub":"admin","exp":1700000000}  exp 2023-11-14T22:13:20.000Z (expired)',
    )
  })
})
