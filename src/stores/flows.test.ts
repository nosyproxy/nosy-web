import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import type { FlowSummary, WsEvent } from '@/api/client'

// Minimal browser surface used by the settings store.
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} })
vi.stubGlobal('window', { matchMedia: () => ({ matches: false, addEventListener: () => {} }) })
vi.stubGlobal('document', {
  documentElement: { dataset: {}, style: { setProperty: () => {} }, lang: '' },
})
vi.stubGlobal('navigator', { language: 'en' })
let rafQueue: (() => void)[] = []
vi.stubGlobal('requestAnimationFrame', (cb: () => void) => rafQueue.push(cb))
const runFrame = () => {
  const q = rafQueue
  rafQueue = []
  q.forEach((cb) => cb())
}

let onEvent: (e: WsEvent) => void = () => {}
vi.mock('@/api/ws', () => ({
  connectEvents: (cb: (e: WsEvent) => void) => {
    onEvent = cb
    return () => {}
  },
}))

type Deferred = { resolve: (v: FlowSummary[]) => void; query: Record<string, unknown> }
let calls: Deferred[] = []
vi.mock('@/api/client', () => ({
  api: {
    flows: (query: Record<string, unknown>) =>
      new Promise<FlowSummary[]>((resolve) => calls.push({ resolve, query })),
  },
}))

const { useFlows } = await import('./flows')

function flow(id: number, extra: Partial<FlowSummary> = {}): FlowSummary {
  return {
    id,
    ts_start: id,
    scheme: 'https',
    host: 'a.com',
    port: 443,
    method: 'GET',
    path: `/${id}`,
    http_version: 'HTTP/1.1',
    status: 200,
    req_size: 0,
    resp_size: id,
    content_type: null,
    duration_us: null,
    error: null,
    truncated: false,
    highlight: null,
    note: null,
    ...extra,
  } as FlowSummary
}
const page = (from: number, to: number) => {
  const out = []
  for (let i = from; i >= to; i--) out.push(flow(i))
  return out
}
const flushPromises = () => new Promise((r) => setTimeout(r, 0))

describe('flows store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    calls = []
    rafQueue = []
  })

  it('discards a loadMore page that resolves after a reload', async () => {
    const s = useFlows()
    s.start()
    calls[0]!.resolve(page(2000, 1001))
    await flushPromises()
    expect(s.total).toBe(1000)

    void s.loadMore()
    s.filter.host = 'b.com'
    await new Promise((r) => setTimeout(r, 200)) // filter debounce → reload
    expect(calls).toHaveLength(3)
    calls[2]!.resolve([flow(5, { host: 'b.com' })])
    await flushPromises()
    // The stale page (old filter) arrives last and must be ignored.
    calls[1]!.resolve(page(1000, 1))
    await flushPromises()
    expect(s.rows.map((r) => r.id)).toEqual([5])
    expect(s.loading).toBe(false)
  })

  it('keeps rows sorted under incremental live updates', async () => {
    const s = useFlows()
    s.start()
    calls[0]!.resolve([flow(3), flow(1)])
    await flushPromises()
    s.toggleSort('resp_size') // ascending by size
    await nextTick()

    onEvent({ type: 'flows', flows: [flow(2), flow(4)] })
    onEvent({ type: 'flows', flows: [flow(1, { resp_size: 99 })] })
    runFrame()
    expect(s.rows.map((r) => r.id)).toEqual([2, 3, 4, 1])

    onEvent({ type: 'deleted', ids: [3] })
    expect(s.rows.map((r) => r.id)).toEqual([2, 4, 1])
  })

  it('drops in-flight pages on clear', async () => {
    const s = useFlows()
    s.start()
    calls[0]!.resolve(page(2000, 1001))
    await flushPromises()
    void s.loadMore()
    onEvent({ type: 'cleared' })
    calls[1]!.resolve(page(1000, 1))
    await flushPromises()
    expect(s.total).toBe(0)
  })
})
