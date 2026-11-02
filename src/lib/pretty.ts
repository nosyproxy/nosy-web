import type { BodyKind } from './http'

export function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
])

/** Small, forgiving markup indenter (not a full parser: good enough for reading). */
export function prettyMarkup(text: string, html = true): string {
  const tokens = text
    .replace(/>\s+</g, '><')
    .split(/(<[^>]+>)/g)
    .filter((t) => t.trim() !== '')
  const out: string[] = []
  let depth = 0
  let rawUntil: string | null = null
  for (const tok of tokens) {
    if (rawUntil) {
      if (tok.toLowerCase().startsWith(rawUntil)) {
        rawUntil = null
        depth = Math.max(0, depth - 1)
        out.push('  '.repeat(depth) + tok)
      } else out.push(tok.trim() ? '  '.repeat(depth) + tok.trim() : '')
      continue
    }
    if (tok.startsWith('</')) {
      depth = Math.max(0, depth - 1)
      out.push('  '.repeat(depth) + tok)
    } else if (tok.startsWith('<')) {
      out.push('  '.repeat(depth) + tok)
      const name = /^<([a-zA-Z][\w:-]*)/.exec(tok)?.[1]?.toLowerCase()
      const selfClosing = tok.endsWith('/>') || tok.startsWith('<!') || tok.startsWith('<?')
      if (name && !selfClosing && !(html && VOID.has(name))) {
        depth++
        if (html && (name === 'script' || name === 'style')) rawUntil = `</${name}`
      }
    } else {
      out.push('  '.repeat(depth) + tok.trim())
    }
  }
  return out.join('\n')
}

export function prettify(text: string, kind: BodyKind): string {
  if (kind === 'json') return prettyJson(text)
  if (kind === 'html') return prettyMarkup(text, true)
  if (kind === 'xml') return prettyMarkup(text, false)
  return text
}
