import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, type AppInfo } from '@/api/client'

/** Static server info, fetched once. */
export const useInfo = defineStore('info', () => {
  const info = ref<AppInfo | null>(null)
  let pending: Promise<void> | null = null
  function load() {
    pending ??= api
      .info()
      .then((i) => void (info.value = i))
      .catch(() => void (pending = null))
    return pending
  }
  return { info, load }
})
