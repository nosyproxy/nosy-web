import type { FlowSummary } from '@/api/client'

export interface Filter {
  q: string
  host: string
  methods: string[]
  /** Status classes: 1..5, and 0 = no response. */
  status: number[]
  hideStatic: boolean
}

export const emptyFilter = (): Filter => ({ q: '', host: '', methods: [], status: [], hideStatic: false })

export const STATIC_EXTS = new Set([
  'js',
  'mjs',
  'css',
  'map',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'svg',
  'ico',
  'bmp',
  'woff',
  'woff2',
  'ttf',
  'otf',
  'eot',
  'mp4',
  'webm',
  'mp3',
  'ogg',
  'wav',
])

export function pathExt(path: string): string {
  const p = path.split(/[?#]/)[0] ?? ''
  const last = p.slice(p.lastIndexOf('/') + 1)
  const dot = last.lastIndexOf('.')
  if (dot < 0) return ''
  const ext = last.slice(dot + 1)
  return ext && ext.length <= 8 ? ext.toLowerCase() : ''
}

function globToRegex(glob: string): RegExp {
  const esc = glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(glob.includes('*') ? `^${esc}$` : esc, 'i')
}

/** Client-side mirror of the server filter, applied to live updates. */
export function compileFilter(f: Filter): (s: FlowSummary) => boolean {
  const q = f.q.toLowerCase()
  const host = f.host ? globToRegex(f.host) : null
  const methods = new Set(f.methods.map((m) => m.toUpperCase()))
  const status = new Set(f.status)
  return (s) => {
    if (q && !(s.host + s.path).toLowerCase().includes(q)) return false
    if (host && !host.test(s.host)) return false
    if (methods.size && !methods.has(s.method)) return false
    if (status.size && !status.has(s.status == null ? 0 : Math.floor(s.status / 100))) return false
    if (f.hideStatic && STATIC_EXTS.has(pathExt(s.path))) return false
    return true
  }
}

export function toQuery(f: Filter) {
  return {
    q: f.q || undefined,
    host: f.host || undefined,
    methods: f.methods.join(',') || undefined,
    status: f.status.join(',') || undefined,
    hide_static: f.hideStatic || undefined,
  }
}
