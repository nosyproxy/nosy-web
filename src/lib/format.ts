export function formatBytes(n: number | null | undefined): string {
  if (n == null) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

export function formatDuration(us: number | null | undefined): string {
  if (us == null) return ''
  if (us < 1000) return `${us} µs`
  if (us < 1_000_000) return `${(us / 1000).toFixed(us < 10_000 ? 1 : 0)} ms`
  return `${(us / 1_000_000).toFixed(2)} s`
}

const timeFormats = new Map<string, Intl.DateTimeFormat>()

/** Cached formatter per (locale, 12h) — creating Intl formatters is expensive. */
export function formatTime(ms: number, locale = 'en', hour12 = false): string {
  const key = `${locale}:${hour12}`
  let f = timeFormats.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12 })
    timeFormats.set(key, f)
  }
  return f.format(ms)
}

export function statusClass(status: number | null): string {
  if (status == null) return 'text-dim'
  if (status < 200) return 'text-info'
  if (status < 300) return 'text-ok'
  if (status < 400) return 'text-warn'
  if (status < 500) return 'text-caution'
  return 'text-err'
}

/** Badge colors per HTTP method. */
export function methodClass(m: string): string {
  switch (m) {
    case 'GET':
      return 'text-info'
    case 'POST':
      return 'text-ok'
    case 'PUT':
    case 'PATCH':
      return 'text-warn'
    case 'DELETE':
      return 'text-err'
    default:
      return 'text-violet'
  }
}

export const HIGHLIGHTS: Record<string, string> = {
  red: 'bg-red-500/15',
  orange: 'bg-orange-500/15',
  yellow: 'bg-yellow-500/15',
  green: 'bg-emerald-500/15',
  cyan: 'bg-cyan-500/15',
  blue: 'bg-blue-500/15',
  purple: 'bg-purple-500/15',
}

export const HIGHLIGHT_SWATCH: Record<string, string> = {
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  yellow: 'bg-yellow-500',
  green: 'bg-emerald-500',
  cyan: 'bg-cyan-500',
  blue: 'bg-blue-500',
  purple: 'bg-purple-500',
}

export function mimeLabel(ct: string | null): string {
  if (!ct) return ''
  const base = ct.split(';')[0]!.trim().toLowerCase()
  const sub = base.split('/')[1] ?? base
  if (base.startsWith('image/')) return sub === 'svg+xml' ? 'SVG' : sub.toUpperCase()
  if (sub.includes('json')) return 'JSON'
  if (sub === 'html') return 'HTML'
  if (sub.includes('javascript') || sub === 'ecmascript') return 'script'
  if (sub === 'css') return 'CSS'
  if (sub.includes('xml')) return 'XML'
  if (base.startsWith('font/')) return 'font'
  if (base === 'text/plain') return 'text'
  return sub
}
