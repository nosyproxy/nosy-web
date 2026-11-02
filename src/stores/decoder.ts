import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { hexDecode, runOp, smartChain, toBytes } from '@/lib/transform'

export type StepView = 'auto' | 'text' | 'hex'
export interface Step {
  key: number
  op: string
  view: StepView
}
export interface StepResult {
  bytes?: Uint8Array
  error?: string
  skipped?: boolean
}

const KEY = 'nosy:decoder'
const MAX_PERSIST = 256 * 1024

export const useDecoder = defineStore('decoder', () => {
  let saved: { input?: string; hex?: boolean; steps?: string[] } = {}
  try {
    saved = JSON.parse(localStorage.getItem(KEY) ?? '{}')
  } catch {
    /* ignore */
  }
  let nextKey = 1
  const mk = (op: string): Step => ({ key: nextKey++, op, view: 'auto' })

  const input = ref(saved.input ?? '')
  const inputHex = ref(!!saved.hex)
  const steps = ref<Step[]>((saved.steps ?? []).map(mk))
  const results = shallowRef<StepResult[]>([])
  const inputError = ref<string | null>(null)
  const busy = ref(false)

  const inputBytes = computed<Uint8Array | null>(() => {
    if (!inputHex.value) return toBytes(input.value)
    try {
      return hexDecode(toBytes(input.value))
    } catch {
      return null
    }
  })

  let version = 0
  async function recompute(): Promise<StepResult[]> {
    const v = ++version
    const out: StepResult[] = []
    let cur = inputBytes.value
    inputError.value = cur ? null : 'invalid hex'
    let failed = !cur
    for (const step of steps.value) {
      if (failed || !cur) {
        out.push({ skipped: true })
        continue
      }
      try {
        cur = await runOp(step.op, cur)
        out.push({ bytes: cur })
      } catch (e) {
        out.push({ error: e instanceof Error ? e.message : String(e) })
        failed = true
      }
    }
    if (v === version) results.value = out
    return out
  }
  watch([inputBytes, steps], recompute, { deep: true, immediate: true })

  let saveTimer: ReturnType<typeof setTimeout> | undefined
  watch(
    [input, inputHex, steps],
    () => {
      clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        const data = {
          input: input.value.length <= MAX_PERSIST ? input.value : '',
          hex: inputHex.value,
          steps: steps.value.map((s) => s.op),
        }
        localStorage.setItem(KEY, JSON.stringify(data))
      }, 300)
    },
    { deep: true },
  )

  function addStep(op: string) {
    steps.value.push(mk(op))
  }
  function removeStep(i: number) {
    steps.value.splice(i, 1)
  }
  function clear() {
    input.value = ''
    steps.value = []
  }

  /** Append steps that peel whatever encodings remain on the last output. Returns how many were added. */
  async function smart(): Promise<number> {
    busy.value = true
    try {
      const res = await recompute()
      const last = [...res].reverse().find((r) => r.bytes)?.bytes
      const from = res.length === 0 || res.every((r) => r.bytes) ? (last ?? inputBytes.value) : null
      if (!from) return 0
      const chain = await smartChain(from)
      steps.value.push(...chain.map(mk))
      return chain.length
    } finally {
      busy.value = false
    }
  }

  /** Load text (e.g. a selection from a viewer) and auto-decode it. */
  async function open(text: string) {
    input.value = text
    inputHex.value = false
    steps.value = []
    return smart()
  }

  /** Make step `i`'s output the new input. */
  function promote(i: number) {
    const r = results.value[i]
    if (!r?.bytes) return
    const text = new TextDecoder('utf-8', { fatal: false }).decode(r.bytes)
    const lossless = new TextEncoder().encode(text).length === r.bytes.length
    inputHex.value = !lossless
    input.value = lossless ? text : Array.from(r.bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    steps.value = steps.value.slice(i + 1)
  }

  return {
    input,
    inputHex,
    inputBytes,
    inputError,
    steps,
    results,
    busy,
    addStep,
    removeStep,
    clear,
    smart,
    open,
    promote,
  }
})
