import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import { api, type RepeaterEntry, type RepeaterTab, type Target } from '@/api/client'
import { requestForEditor } from '@/lib/http'
import { useUi } from './ui'
import { useSettings } from './settings'

export interface TabState {
  history: RepeaterEntry[]
  /** Index into history of the exchange being shown (-1 = none). */
  index: number
  response: Uint8Array | null
  sending: boolean
  abort: AbortController | null
  historyLoaded: boolean
}

const DEFAULT_REQUEST = 'GET / HTTP/1.1\r\nHost: example.com\r\nUser-Agent: nosy\r\nAccept: */*\r\n\r\n'

export const useRepeater = defineStore('repeater', () => {
  const ui = useUi()
  const tabs = ref<RepeaterTab[]>([])
  const activeId = ref<number | null>(null)
  const states = reactive(new Map<number, TabState>())
  const settings = useSettings()
  const decode = ref(settings.s.decodeBodies)
  let loaded = false
  const saveTimers = new Map<number, ReturnType<typeof setTimeout>>()

  function state(id: number): TabState {
    let s = states.get(id)
    if (!s) {
      s = { history: [], index: -1, response: null, sending: false, abort: null, historyLoaded: false }
      states.set(id, s)
    }
    return s
  }

  async function load() {
    if (loaded) return
    loaded = true
    try {
      tabs.value = await api.tabs()
      if (!tabs.value.length) await create()
      if (activeId.value == null || !tabs.value.some((t) => t.id === activeId.value))
        activeId.value = tabs.value[0]?.id ?? null
      if (activeId.value != null) await activate(activeId.value)
    } catch (e) {
      loaded = false
      ui.error(e)
    }
  }

  async function activate(id: number) {
    activeId.value = id
    const s = state(id)
    if (s.historyLoaded) return
    s.historyLoaded = true
    s.history = await api.history(id)
    if (s.history.length) await show(id, s.history.length - 1, false)
  }

  async function create(
    raw = DEFAULT_REQUEST,
    target: Target = { host: 'example.com', port: 443, tls: true, http2: false },
  ) {
    const tab = await api.createTab({ name: null, target, raw_request: raw, body_b64: null })
    tabs.value.push(tab)
    await activate(tab.id)
    return tab
  }

  /** Called after "Send to Repeater" from the proxy view. */
  function adopt(tab: RepeaterTab) {
    if (loaded && !tabs.value.some((t) => t.id === tab.id)) tabs.value.push(tab)
    activeId.value = tab.id
  }

  async function close(id: number) {
    const i = tabs.value.findIndex((t) => t.id === id)
    if (i < 0) return
    state(id).abort?.abort()
    await api.deleteTab(id)
    tabs.value.splice(i, 1)
    states.delete(id)
    if (activeId.value === id) {
      const next = tabs.value[Math.min(i, tabs.value.length - 1)]
      activeId.value = null
      if (next) await activate(next.id)
    }
    if (!tabs.value.length) await create()
  }

  async function rename(id: number, name: string) {
    const tab = tabs.value.find((t) => t.id === id)
    if (!tab || !name.trim()) return
    tab.name = name.trim()
    await api.patchTab(id, { name: tab.name })
  }

  async function move(from: number, to: number) {
    if (from === to) return
    const [t] = tabs.value.splice(from, 1)
    if (!t) return
    tabs.value.splice(to, 0, t)
    await Promise.all(
      tabs.value.map((tab, i) =>
        tab.position !== i ? ((tab.position = i), api.patchTab(tab.id, { position: i })) : null,
      ),
    )
  }

  function scheduleSave(tab: RepeaterTab) {
    clearTimeout(saveTimers.get(tab.id))
    saveTimers.set(
      tab.id,
      setTimeout(() => {
        api
          .patchTab(tab.id, { raw_request: tab.raw_request, target: tab.target, body_b64: tab.body_b64 ?? '' })
          .catch(ui.error)
      }, 500),
    )
  }

  function setDraft(id: number, raw: string) {
    const tab = tabs.value.find((t) => t.id === id)
    if (!tab || tab.raw_request === raw) return
    tab.raw_request = raw
    scheduleSave(tab)
  }

  /** Set (base64) or remove (null) the binary body that replaces the editor body. */
  function setBinaryBody(id: number, b64: string | null) {
    const tab = tabs.value.find((t) => t.id === id)
    if (!tab || (tab.body_b64 ?? null) === b64) return
    tab.body_b64 = b64
    scheduleSave(tab)
  }

  function setTarget(id: number, target: Target) {
    const tab = tabs.value.find((t) => t.id === id)
    if (!tab) return
    tab.target = target
    scheduleSave(tab)
  }

  async function send(id: number) {
    const tab = tabs.value.find((t) => t.id === id)
    if (!tab) return
    const s = state(id)
    s.abort?.abort()
    const ctl = (s.abort = new AbortController())
    s.sending = true
    clearTimeout(saveTimers.get(id))
    try {
      const entry = await api.sendRepeater(
        id,
        {
          target: tab.target,
          raw_request: tab.raw_request,
          body_b64: tab.body_b64,
          update_content_length: settings.s.updateContentLength,
          timeout_ms: Math.max(1, settings.s.timeout) * 1000,
        },
        ctl.signal,
      )
      s.history.push(entry)
      await show(id, s.history.length - 1, false)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') ui.error(e)
    } finally {
      if (s.abort === ctl) {
        s.sending = false
        s.abort = null
      }
    }
  }

  function cancel(id: number) {
    const s = state(id)
    s.abort?.abort()
    s.sending = false
    s.abort = null
  }

  /** Show history entry `index`; optionally restore its request into the editor. */
  async function show(id: number, index: number, restoreRequest: boolean) {
    const s = state(id)
    const entry = s.history[index]
    if (!entry) return
    s.index = index
    s.response = entry.error ? null : await api.historyResponse(entry.id, decode.value)
    if (restoreRequest) {
      const { raw, bodyB64 } = requestForEditor(await api.historyRequest(entry.id))
      setDraft(id, raw)
      setBinaryBody(id, bodyB64)
      setTarget(id, entry.target)
    }
  }

  async function refreshResponse(id: number) {
    const s = state(id)
    if (s.index >= 0) await show(id, s.index, false)
  }

  return {
    tabs,
    activeId,
    states,
    decode,
    load,
    activate,
    create,
    adopt,
    close,
    rename,
    move,
    setDraft,
    setBinaryBody,
    setTarget,
    send,
    cancel,
    show,
    state,
    refreshResponse,
  }
})
