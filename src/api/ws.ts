import type { WsEvent } from './client'

/** Auto-reconnecting WebSocket for live events (exponential backoff, max 5 s). */
export function connectEvents(
  onEvent: (e: WsEvent) => void,
  onStatus: (connected: boolean) => void,
): () => void {
  let ws: WebSocket | null = null
  let retry = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let closed = false

  const open = () => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    ws = new WebSocket(`${proto}://${location.host}/api/ws`)
    ws.onopen = () => {
      if (retry > 0) onEvent({ type: 'resync' }) // we may have missed events
      retry = 0
      onStatus(true)
    }
    ws.onmessage = (m) => {
      try {
        onEvent(JSON.parse(m.data as string) as WsEvent)
      } catch (e) {
        console.error('bad ws message', e)
      }
    }
    ws.onclose = () => {
      onStatus(false)
      if (closed) return
      const delay = Math.min(5000, 250 * 2 ** retry++)
      timer = setTimeout(open, delay)
    }
  }
  open()

  return () => {
    closed = true
    clearTimeout(timer)
    ws?.close()
  }
}
