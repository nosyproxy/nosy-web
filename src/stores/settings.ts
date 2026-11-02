import { defineStore } from 'pinia'
import { reactive, watch, watchEffect } from 'vue'
import { detectLocale, locale, type Locale } from '@/i18n'

export type Theme = 'dark' | 'light' | 'system'
export type Accent = 'orange' | 'blue' | 'green' | 'purple' | 'pink' | 'red'
export type Density = 'compact' | 'normal' | 'comfortable'

export interface Settings {
  locale: Locale
  theme: Theme
  accent: Accent
  /** Multiplier for the root font size (all rem-based sizes follow). */
  uiScale: number
  editorFontSize: number
  density: Density
  timeFormat: '24h' | '12h'
  newestFirst: boolean
  confirmClear: boolean
  decodeBodies: boolean
  wrap: boolean
  lineNumbers: boolean
  renderExternal: boolean
  updateContentLength: boolean
  /** Repeater timeout, seconds. */
  timeout: number
}

export const defaults = (): Settings => ({
  locale: detectLocale(),
  theme: 'dark',
  accent: 'orange',
  uiScale: 1,
  editorFontSize: 12,
  density: 'normal',
  timeFormat: '24h',
  newestFirst: true,
  confirmClear: true,
  decodeBodies: true,
  wrap: true,
  lineNumbers: false,
  renderExternal: false,
  updateContentLength: true,
  timeout: 30,
})

export const ACCENTS: Accent[] = ['orange', 'blue', 'green', 'purple', 'pink', 'red']
export const ROW_HEIGHT: Record<Density, number> = { compact: 20, normal: 24, comfortable: 30 }

const KEY = 'nosy:settings'

function load(): Settings {
  const base = defaults()
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>
    // Only accept known keys with matching types (forward/backward compatible).
    for (const k of Object.keys(base) as (keyof Settings)[]) {
      if (typeof saved[k] === typeof base[k]) (base as unknown as Record<string, unknown>)[k] = saved[k]
    }
  } catch {
    /* corrupted: use defaults */
  }
  return base
}

export const useSettings = defineStore('settings', () => {
  const s = reactive(load())

  watch(s, () => localStorage.setItem(KEY, JSON.stringify(s)), { deep: true })

  // Apply to the document.
  const media = window.matchMedia('(prefers-color-scheme: light)')
  const systemLight = reactive({ v: media.matches })
  media.addEventListener('change', (e) => (systemLight.v = e.matches))

  watchEffect(() => {
    const root = document.documentElement
    const theme = s.theme === 'system' ? (systemLight.v ? 'light' : 'dark') : s.theme
    root.dataset.theme = theme
    root.style.colorScheme = theme
    root.dataset.accent = s.accent
    root.style.setProperty('--ui-scale', String(s.uiScale))
    root.style.setProperty('--editor-font-size', `${s.editorFontSize}px`)
    root.lang = s.locale
    locale.value = s.locale
  })

  function reset() {
    Object.assign(s, defaults())
  }

  return { s, reset }
})
