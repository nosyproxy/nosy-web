import type { AppInfo } from './generated/AppInfo'
import type { FlowDetail } from './generated/FlowDetail'
import type { FlowPatch } from './generated/FlowPatch'
import type { FlowSummary } from './generated/FlowSummary'
import type { ProjectStats } from './generated/ProjectStats'
import type { NewRepeaterTab } from './generated/NewRepeaterTab'
import type { RepeaterEntry } from './generated/RepeaterEntry'
import type { RepeaterTab } from './generated/RepeaterTab'
import type { RepeaterTabPatch } from './generated/RepeaterTabPatch'
import type { SendRequest } from './generated/SendRequest'

export type { AppInfo, FlowDetail, FlowSummary, ProjectStats, RepeaterEntry, RepeaterTab, SendRequest }
export type { Target } from './generated/Target'
export type { WsEvent } from './generated/WsEvent'
export type { Header } from './generated/Header'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

const BASE = '/api'

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  if (init.body && typeof init.body === 'string') headers.set('content-type', 'application/json')
  const res = await fetch(BASE + path, { ...init, headers })
  if (!res.ok) {
    let msg = res.statusText
    try {
      const j = await res.json()
      if (j && typeof j.error === 'string') msg = j.error
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, msg)
  }
  return res
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  return (await request(path, init)).json() as Promise<T>
}

async function bytes(path: string, signal?: AbortSignal): Promise<Uint8Array> {
  return new Uint8Array(await (await request(path, { signal })).arrayBuffer())
}

const send = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
})

export interface FlowQuery {
  before_id?: number
  after_id?: number
  limit?: number
  q?: string
  host?: string
  methods?: string
  status?: string
  hide_static?: boolean
}

function qs(params: object): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '' && v !== false) p.set(k, String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const api = {
  info: () => json<AppInfo>('/info'),
  projectStats: () => json<ProjectStats>('/project/stats'),
  compact: () => request('/project/compact', { method: 'POST' }),

  flows: (q: FlowQuery, signal?: AbortSignal) => json<FlowSummary[]>(`/flows${qs(q)}`, { signal }),
  flow: (id: number, signal?: AbortSignal) => json<FlowDetail>(`/flows/${id}`, { signal }),
  patchFlow: (id: number, p: Partial<FlowPatch>) => json<FlowSummary>(`/flows/${id}`, send('PATCH', p)),
  deleteFlows: (ids: number[]) => request('/flows/delete', send('POST', { ids })),
  clearFlows: () => request('/flows', { method: 'DELETE' }),
  flowRequest: (id: number, decode: boolean, signal?: AbortSignal) =>
    bytes(`/flows/${id}/request${qs({ decode })}`, signal),
  flowResponse: (id: number, decode: boolean, signal?: AbortSignal) =>
    bytes(`/flows/${id}/response${qs({ decode })}`, signal),
  toRepeater: (id: number) => json<RepeaterTab>(`/flows/${id}/repeater`, send('POST')),

  tabs: () => json<RepeaterTab[]>('/repeater/tabs'),
  createTab: (t: NewRepeaterTab) => json<RepeaterTab>('/repeater/tabs', send('POST', t)),
  patchTab: (id: number, p: Partial<RepeaterTabPatch>) =>
    json<RepeaterTab>(`/repeater/tabs/${id}`, send('PATCH', p)),
  deleteTab: (id: number) => request(`/repeater/tabs/${id}`, { method: 'DELETE' }),
  sendRepeater: (id: number, r: SendRequest, signal?: AbortSignal) =>
    json<RepeaterEntry>(`/repeater/tabs/${id}/send`, { ...send('POST', r), signal }),
  history: (tabId: number) => json<RepeaterEntry[]>(`/repeater/tabs/${tabId}/history`),
  historyRequest: (id: number) => bytes(`/repeater/history/${id}/request`),
  historyResponse: (id: number, decode: boolean, signal?: AbortSignal) =>
    bytes(`/repeater/history/${id}/response${qs({ decode })}`, signal),
}
