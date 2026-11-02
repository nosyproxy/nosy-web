<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue'
import { Binary, Check, Code, Copy, Eye, FileText, List, PackageOpen, WrapText } from '@lucide/vue'
import CodeView, { type Lang } from './CodeView.vue'
import HexView from './HexView.vue'
import RenderView from './RenderView.vue'
import SelectionInspector from './SelectionInspector.vue'
import { bodyKind, decodeBody, decodeText, header, isHtml, isImage, parseMessage } from '@/lib/http'
import { prettify } from '@/lib/pretty'
import { formatBytes } from '@/lib/format'
import { useSettings } from '@/stores/settings'
import { t } from '@/i18n'

type Tab = 'raw' | 'headers' | 'pretty' | 'render' | 'hex'

const props = withDefaults(
  defineProps<{
    data: Uint8Array | null
    title: string
    loading?: boolean
    empty?: string
    /** Show the decode (decompress) toggle; `decode` tells whether data is decoded. */
    decodable?: boolean
    storageKey?: string
    /** URL of the request, used as <base> when rendering HTML with external resources. */
    baseUrl?: string
  }>(),
  { loading: false, empty: undefined, decodable: false, storageKey: 'viewer', baseUrl: undefined },
)
const decode = defineModel<boolean>('decode', { default: true })
const settings = useSettings()

const MAX_TEXT = 4 * 1024 * 1024

const tab = ref<Tab>((localStorage.getItem(`tab:${props.storageKey}`) as Tab) || 'raw')
watch(tab, (v) => localStorage.setItem(`tab:${props.storageKey}`, v))
const showAll = ref(false)
const selection = ref('')
watch(
  () => props.data,
  () => {
    showAll.value = false
    selection.value = ''
  },
)
watch(tab, () => (selection.value = ''))

const parsed = computed(() => (props.data ? parseMessage(props.data) : null))
const contentType = computed(() => (parsed.value ? header(parsed.value.headers, 'content-type') : undefined))
const contentEncoding = computed(() =>
  parsed.value ? header(parsed.value.headers, 'content-encoding') : undefined,
)
const kind = computed(() => (parsed.value ? bodyKind(parsed.value.body, contentType.value) : 'text'))
const canRender = computed(
  () =>
    !!parsed.value?.body.length &&
    (isImage(contentType.value) || isHtml(contentType.value) || kind.value === 'html'),
)
/** The stored tab may not apply to this message (e.g. Render on JSON). */
const active = computed<Tab>(() => (tab.value === 'render' && !canRender.value ? 'pretty' : tab.value))

const tabs = computed(() => {
  const list: { id: Tab; label: string; icon: Component }[] = [
    { id: 'raw', label: t('viewer.raw'), icon: FileText },
    { id: 'headers', label: t('viewer.headers'), icon: List },
    { id: 'pretty', label: t('viewer.pretty'), icon: Code },
  ]
  if (canRender.value) list.push({ id: 'render', label: t('viewer.render'), icon: Eye })
  list.push({ id: 'hex', label: t('viewer.hex'), icon: Binary })
  return list
})

const tooBig = computed(() => !!props.data && props.data.length > MAX_TEXT && !showAll.value)
const rawText = computed(() => {
  if (active.value !== 'raw' || !props.data) return ''
  return decodeText(tooBig.value ? props.data.subarray(0, MAX_TEXT) : props.data)
})

const pretty = computed<{ text: string; lang: Lang } | null>(() => {
  if (active.value !== 'pretty' || !parsed.value || kind.value === 'binary') return null
  const body = parsed.value.body
  const text = decodeBody(
    body.length > MAX_TEXT && !showAll.value ? body.subarray(0, MAX_TEXT) : body,
    contentType.value,
  )
  const lang: Lang =
    kind.value === 'json' ? 'json' : kind.value === 'html' || kind.value === 'xml' ? 'html' : 'none'
  return { text: prettify(text, kind.value), lang }
})

const copied = ref(false)
async function copy() {
  if (!props.data) return
  await navigator.clipboard.writeText(decodeText(props.data))
  copied.value = true
  setTimeout(() => (copied.value = false), 1200)
}
</script>

<template>
  <section class="flex h-full min-h-0 flex-col bg-panel" :aria-label="title">
    <header class="flex h-9 shrink-0 items-center gap-2 border-b border-line pr-1.5 pl-3">
      <h2 class="panel-title mr-1">{{ title }}</h2>
      <div class="segmented" role="tablist">
        <button
          v-for="tb in tabs"
          :key="tb.id"
          role="tab"
          :aria-selected="active === tb.id"
          class="segment"
          :class="active === tb.id && 'segment-on'"
          @click="tab = tb.id"
        >
          <component :is="tb.icon" class="size-3.5" />
          <span class="hidden xl:inline">{{ tb.label }}</span>
        </button>
      </div>
      <div class="ml-auto flex items-center gap-0.5">
        <span v-if="data" class="mr-2 font-mono text-[0.6875rem] text-faint">{{
          formatBytes(data.length)
        }}</span>
        <button
          v-if="decodable"
          class="chip flex items-center gap-1"
          :class="decode && 'chip-on'"
          :aria-pressed="decode"
          :title="t('viewer.decodeHint')"
          @click="decode = !decode"
        >
          <PackageOpen class="size-3.5" />
          <span class="hidden 2xl:inline">{{ t('viewer.decode') }}</span>
        </button>
        <button
          class="btn-icon"
          :class="settings.s.wrap && 'text-accent'"
          :aria-pressed="settings.s.wrap"
          :title="t('viewer.wrap')"
          @click="settings.s.wrap = !settings.s.wrap"
        >
          <WrapText class="size-4" />
        </button>
        <button class="btn-icon" :disabled="!data" :title="t('viewer.copy')" @click="copy">
          <Check v-if="copied" class="size-4 text-ok" />
          <Copy v-else class="size-4" />
        </button>
      </div>
    </header>

    <div class="relative min-h-0 flex-1">
      <div v-if="loading && !data" class="p-4 text-dim">{{ t('common.loading') }}</div>
      <div v-else-if="!data" class="flex h-full items-center justify-center text-faint">
        {{ empty ?? t('viewer.selectRequest') }}
      </div>
      <div v-else class="flex h-full flex-col">
        <div
          v-if="tooBig && (active === 'raw' || active === 'pretty')"
          class="shrink-0 border-b border-line bg-warn/10 px-3 py-1 text-[0.6875rem] text-warn"
        >
          {{ t('viewer.showingFirst', { shown: formatBytes(MAX_TEXT), total: formatBytes(data.length) }) }}
          <button class="underline" @click="showAll = true">{{ t('viewer.showAll') }}</button>
        </div>
        <div class="min-h-0 flex-1">
          <CodeView
            v-if="active === 'raw'"
            :model-value="rawText"
            readonly
            language="http"
            :wrap="settings.s.wrap"
            @selection="selection = $event"
          />
          <div v-else-if="active === 'headers'" class="h-full overflow-auto">
            <table class="w-full border-collapse font-mono text-xs">
              <tbody>
                <tr class="border-b border-line">
                  <td colspan="2" class="px-3 py-2 font-semibold text-accent">{{ parsed?.startLine }}</td>
                </tr>
                <tr
                  v-for="([k, v], i) in parsed?.headers"
                  :key="i"
                  class="border-b border-line/60 hover:bg-hover"
                >
                  <td class="w-1/4 px-3 py-1.5 align-top whitespace-nowrap text-key">{{ k }}</td>
                  <td class="px-3 py-1.5 break-all">{{ v }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <template v-else-if="active === 'pretty'">
            <CodeView
              v-if="pretty"
              :model-value="pretty.text"
              readonly
              :language="pretty.lang"
              :wrap="settings.s.wrap"
              @selection="selection = $event"
            />
            <div v-else class="p-4 text-dim">{{ t('viewer.binary') }}</div>
          </template>
          <RenderView
            v-else-if="active === 'render' && parsed"
            :body="parsed.body"
            :content-type="contentType"
            :base-url="baseUrl"
            :encoded="!!contentEncoding && !/identity/i.test(contentEncoding) && (!decodable || !decode)"
          />
          <HexView v-else :data="data" />
        </div>
        <SelectionInspector v-if="selection && (active === 'raw' || active === 'pretty')" :text="selection" />
      </div>
    </div>
  </section>
</template>
