import { defineStore } from 'pinia'
import { reactive, ref, shallowRef, watch } from 'vue'
import { api, type FlowSummary, type WsEvent } from '@/api/client'
import { connectEvents } from '@/api/ws'
import { compileFilter, emptyFilter, toQuery } from '@/lib/filter'
import { useSettings } from './settings'

export type SortKey =
  'id' | 'host' | 'method' | 'path' | 'status' | 'resp_size' | 'content_type' | 'duration_us'

const PAGE = 1000

export const useFlows = defineStore('flows', () => {
  // The index is deliberately non-reactive; `rows` is a shallowRef swapped once
  // per animation frame, so 1000s of updates/s cost one re-render per frame.
  const byId = new Map<number, FlowSummary>()
  const rows = shallowRef<FlowSummary[]>([])
  const filter = reactive(emptyFilter())
  const settings = useSettings()
  const sort = ref<{ key: SortKey; dir: 1 | -1 }>({ key: 'id', dir: settings.s.newestFirst ? -1 : 1 })
  const loading = ref(false)
  const exhausted = ref(false)
  const connected = ref(false)
  const selectedId = ref<number | null>(null)
  const total = ref(0)

  let matcher = compileFilter(filter)
  let oldestLoaded = Infinity
  let pending: FlowSummary[] = []
  let frame = 0
  let loadCtl: AbortController | null = null

  function compare(a: FlowSummary, b: FlowSummary): number {
    const { key, dir } = sort.value
    const av = a[key]
    const bv = b[key]
    if (av === bv) return (a.id - b.id) * dir
    if (av == null) return 1
    if (bv == null) return -1
    return (av < bv ? -1 : 1) * dir
  }

  function rebuild() {
    const arr = Array.from(byId.values())
    arr.sort(compare)
    rows.value = arr
    total.value = arr.length
  }

  async function reload() {
    loadCtl?.abort()
    const ctl = (loadCtl = new AbortController())
    loading.value = true
    try {
      const page = await api.flows({ ...toQuery(filter), limit: PAGE }, ctl.signal)
      byId.clear()
      pending = []
      for (const f of page) byId.set(f.id, f)
      oldestLoaded = page.length ? page[page.length - 1]!.id : Infinity
      exhausted.value = page.length < PAGE
      if (selectedId.value != null && !byId.has(selectedId.value)) selectedId.value = null
      rebuild()
    } catch (e) {
      if ((e as Error).name !== 'AbortError') console.error(e)
    } finally {
      if (loadCtl === ctl) loading.value = false
    }
  }

  async function loadMore() {
    if (loading.value || exhausted.value || !Number.isFinite(oldestLoaded)) return
    loading.value = true
    try {
      const page = await api.flows({ ...toQuery(filter), before_id: oldestLoaded, limit: PAGE })
      for (const f of page) byId.set(f.id, f)
      if (page.length) oldestLoaded = page[page.length - 1]!.id
      exhausted.value = page.length < PAGE
      rebuild()
    } finally {
      loading.value = false
    }
  }

  function flush() {
    frame = 0
    if (!pending.length) return
    for (const f of pending) {
      // Ignore updates for old flows outside the loaded window.
      const inWindow = exhausted.value || f.id >= oldestLoaded || !Number.isFinite(oldestLoaded)
      if (byId.has(f.id) || (inWindow && matcher(f))) byId.set(f.id, f)
    }
    pending = []
    rebuild()
  }

  function onEvent(e: WsEvent) {
    switch (e.type) {
      case 'flows':
        for (const f of e.flows) pending.push(f)
        if (!frame) frame = requestAnimationFrame(flush)
        break
      case 'deleted':
        for (const id of e.ids) byId.delete(id)
        if (selectedId.value != null && e.ids.includes(selectedId.value)) selectedId.value = null
        rebuild()
        break
      case 'cleared':
        byId.clear()
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
    start,
    reload,
    loadMore,
    toggleSort,
    get,
  }
})
