import { computed, ref } from 'vue'
import { en, type MessageKey } from './en'
import { ru } from './ru'

export type Locale = 'en' | 'ru'
export type { MessageKey }

const dictionaries: Record<Locale, Record<MessageKey, string>> = { en, ru }

export const LOCALES: { value: Locale; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Русский' },
]

export const detectLocale = (): Locale => (navigator.language?.toLowerCase().startsWith('ru') ? 'ru' : 'en')

/** Current locale; the settings store keeps it in sync with the user's choice. */
export const locale = ref<Locale>(detectLocale())

const messages = computed(() => dictionaries[locale.value])

/**
 * Translate `key`, replacing `{name}` placeholders. Reactive: components that call
 * `t()` during render re-render when the locale changes.
 */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const msg = messages.value[key] ?? en[key] ?? key
  return params ? msg.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`)) : msg
}
