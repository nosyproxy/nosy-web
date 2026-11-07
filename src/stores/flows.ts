import { defineStore } from 'pinia'
import { reactive, ref, shallowRef, watch } from 'vue'
import { api, type FlowSummary, type WsEvent } from '@/api/client'
import { connectEvents } from '@/api/ws'
import { compileFilter, emptyFilter, toQuery } from '@/lib/filter'
import { useSettings } from './settings'

export type SortKey =
  'id' | 'host' | 'method' | 'path' | 'status' | 'resp_size' | 'content_type' | 'duration_us'

const PAGE = 1000
/** Live updates beyond this many loaded rows evict the oldest flows (they reload on scroll). */
export const MAX_ROWS = 200_000
/** Above this share of changed rows a full re-sort is cheaper than incremental inserts. */
const BULK_RATIO = 0.1

export const useFlows = defineStore('flows', () => {
  // The index is deliberately non-reactive; `rows` is a shallowRef swapped once
  // per animation frame, so 1000s of updates/s cost one re-render per frame.
  const byId = new Map<number, FlowSummary>()
  /** Kept sorted by `compare`; `rows` is a fresh copy of it after each change. */
  let sorted: FlowSummary[] = []
  const rows = shallowRef<FlowSummary[]>([])
  const filter = reactive(emptyFilter())
  const settings = useSettings()
  const sort = ref<{ key: SortKey; dir: 1 | -1 }>({ key: 'id', dir: settings.s.newestFirst ? -1 : 1 })
  const loading = ref(false)
  const exhausted = ref(false)
  const connected = ref(false)
  const selectedId = ref<number | null>(null)
  const total = ref(0)
  const error = ref<string | null>(null)

  let matcher = compileFilter(filter)
  let oldestLoaded = Infinity
  let pending: FlowSummary[] = []
  let frame = 0
  /** Bumped by every reload; responses from an older generation are discarded. */
  let generation = 0
  let ctl: AbortController | null = null

  function compare(a: FlowSummary, b: FlowSummary): number {
    const { key, dir } = sort.value
    const av = a[key]
    const bv = b[key]
    if (av === bv) return (a.id - b.id) * dir
    if (av == null) return 1
    if (bv == null) return -1
    return (av < bv ? -1 : 1) * dir
  }

  /** First index whose row sorts after `f` (compare is a total order thanks to the id tie-break). */
  function lowerBound(f: FlowSummary): number {
    let lo = 0
    let hi = sorted.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (compare(sorted[mid]!, f) < 0) lo = mid + 1
      else hi = mid
    }
    return lo
  }

  function publish() {
    rows.value = sorted.slice()
    total.value = sorted.length
  }

  function rebuild() {
    sorted = Array.from(byId.values())
    sorted.sort(compare)
    publish()
  }

  function remove(f: FlowSummary) {
    const i = lowerBound(f)
    if (sorted[i] === f) sorted.splice(i, 1)
  }

  /** Apply upserts incrementally (binary insert), or re-sort when the batch is large. */
  function upsert(batch: FlowSummary[]) {
    if (batch.length > Math.max(64, sorted.length * BULK_RATIO)) {
      for (const f of batch) byId.set(f.id, f)
      rebuild()
      return
    }
    for (const f of batch) {
      const old = byId.get(f.id)
      if (old) remove(old)
      byId.set(f.id, f)
      sorted.splice(lowerBound(f), 0, f)
    }
    publish()
  }

  /** Drop the oldest flows once the live window outgrows MAX_ROWS. */
  function evict() {
    if (byId.size <= MAX_ROWS * 1.05) return
    const ids = Array.from(byId.keys()).sort((a, b) => a - b)
    const drop = ids.length - MAX_ROWS
    for (let i = 0; i < drop; i++) {
      if (ids[i] !== selectedId.value) byId.delete(ids[i]!)
    }
    oldestLoaded = ids[drop]!
    exhausted.value = false
    rebuild()
  }

  function begin(): { gen: number; signal: AbortSignal } {
    ctl?.abort()
    ctl = new AbortController()
    return { gen: ++generation, signal: ctl.signal }
  }

  function failed(e: unknown, gen: number) {
    if ((e as Error).name === 'AbortError' || gen !== generation) return
    error.value = (e as Error).message || String(e)
    console.error(e)
  }

  async function reload() {
    const { gen, signal } = begin()
    loading.value = true
    try {
      const page = await api.flows({ ...toQuery(filter), limit: PAGE }, signal)
      if (gen !== generation) return
      byId.clear()
      pending = []
      for (const f of page) byId.set(f.id, f)
      oldestLoaded = page.length ? page[page.length - 1]!.id : Infinity
      exhausted.value = page.length < PAGE
      error.value = null
      if (selectedId.value != null && !byId.has(selectedId.value)) selectedId.value = null
      rebuild()
    } catch (e) {
      failed(e, gen)
    } finally {
      if (gen === generation) loading.value = false
    }
  }

  async function loadMore() {
    if (loading.value || exhausted.value || !Number.isFinite(oldestLoaded)) return
    const gen = generation
    const signal = ctl?.signal
    loading.value = true
    try {
      const page = await api.flows({ ...toQuery(filter), before_id: oldestLoaded, limit: PAGE }, signal)
      // A reload (new filter, resync, clear) started meanwhile: this page is stale.
      if (gen !== generation) return
      if (page.length) oldestLoaded = page[page.length - 1]!.id
      exhausted.value = page.length < PAGE
      error.value = null
      upsert(page)
    } catch (e) {
      failed(e, gen)
    } finally {
      if (gen === generation) loading.value = false
    }
  }

  function flush() {
    frame = 0
    if (!pending.length) return
    // Coalesce repeated updates of the same flow within the frame.
    const latest = new Map<number, FlowSummary>()
    for (const f of pending) {
      // Ignore updates for old flows outside the loaded window.
      const inWindow = exhausted.value || f.id >= oldestLoaded || !Number.isFinite(oldestLoaded)
      if (byId.has(f.id) || (inWindow && matcher(f))) latest.set(f.id, f)
    }
    pending = []
    if (latest.size) {
      upsert(Array.from(latest.values()))
      evict()
    }
  }

  function onEvent(e: WsEvent) {
    switch (e.type) {
      case 'flows':
        for (const f of e.flows) pending.push(f)
        if (!frame) frame = requestAnimationFrame(flush)
        break
      case 'deleted': {
        const ids = new Set(e.ids)
        let n = 0
        for (const id of ids) if (byId.delete(id)) n++
        if (n) {
          sorted = sorted.filter((f) => !ids.has(f.id))
          publish()
        }
        pending = pending.filter((f) => !ids.has(f.id))
        if (selectedId.value != null && ids.has(selectedId.value)) selectedId.value = null
        break
      }
      case 'cleared':
        // Invalidate any in-flight page request: it predates the clear.
        begin()
        loading.value = false
        byId.clear()
        pending = []
        selectedId.value = null
        oldestLoaded = Infinity
        exhausted.value = true
        rebuild()
        break
      case 'resync':
        void reload()
        break
    }
  }

  let debounce: ReturnType<typeof setTimeout> | undefined
  watch(
    filter,
    () => {
      clearTimeout(debounce)
      debounce = setTimeout(() => {
        matcher = compileFilter(filter)
        void reload()
      }, 150)
    },
    { deep: true },
  )
  watch(sort, rebuild, { deep: true })
  watch(
    () => settings.s.newestFirst,
    (newest) => (sort.value = { key: 'id', dir: newest ? -1 : 1 }),
  )

  let stop: (() => void) | null = null
  function start() {
    if (stop) return
    stop = connectEvents(onEvent, (c) => (connected.value = c))
    void reload()
  }

  function toggleSort(key: SortKey) {
    sort.value =
      sort.value.key === key
        ? { key, dir: sort.value.dir === 1 ? -1 : 1 }
        : { key, dir: key === 'id' ? (settings.s.newestFirst ? -1 : 1) : 1 }
  }

  const get = (id: number) => byId.get(id)

  return {
    rows,
    filter,
    sort,
    loading,
    exhausted,
    connected,
    selectedId,
    total,
    error,
    start,
    reload,
    loadMore,
    toggleSort,
    get,
  }
})
