import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface Toast {
  id: number
  text: string
  kind: 'info' | 'error'
}

export const useUi = defineStore('ui', () => {
  const toasts = ref<Toast[]>([])
  let next = 1
  function toast(text: string, kind: Toast['kind'] = 'info', ms = 2500) {
    const id = next++
    toasts.value.push({ id, text, kind })
    setTimeout(() => (toasts.value = toasts.value.filter((t) => t.id !== id)), ms)
  }
  const error = (e: unknown) => toast(e instanceof Error ? e.message : String(e), 'error', 5000)
  return { toasts, toast, error }
})
