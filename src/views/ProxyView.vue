<script setup lang="ts">
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api, type FlowSummary } from '@/api/client'
import FilterBar from '@/components/FilterBar.vue'
import FlowTable from '@/components/FlowTable.vue'
import MessageViewer from '@/components/MessageViewer.vue'
import SplitPane from '@/components/SplitPane.vue'
import ContextMenu, { type MenuItem } from '@/components/ContextMenu.vue'
import OnboardingCard from '@/components/OnboardingCard.vue'
import { Highlighter, Link, Repeat, SquareArrowOutUpRight, StickyNote, Terminal, Trash2 } from '@lucide/vue'
import { useSettings } from '@/stores/settings'
import { t } from '@/i18n'
import { useFlows } from '@/stores/flows'
import { useRepeater } from '@/stores/repeater'
import { useUi } from '@/stores/ui'
import { toCurl } from '@/lib/curl'
import { HIGHLIGHT_SWATCH, formatDuration } from '@/lib/format'

const flows = useFlows()
const repeater = useRepeater()
const ui = useUi()
const router = useRouter()

const reqData = shallowRef<Uint8Array | null>(null)
const respData = shallowRef<Uint8Array | null>(null)
const loadingDetail = ref(false)
const settings = useSettings()
const decode = ref(settings.s.decodeBodies)
watch(
  () => settings.s.decodeBodies,
  (d) => (decode.value = d),
)

const selected = computed(() => (flows.selectedId != null ? flows.get(flows.selectedId) : undefined))
// Reload the body once the response arrives (status changes from null).
const selectedKey = computed(() =>
  selected.value ? `${selected.value.id}:${selected.value.status}:${selected.value.error}` : '',
)

let ctl: AbortController | null = null
async function loadDetail() {
  ctl?.abort()
  const f = selected.value
  if (!f) {
    reqData.value = respData.value = null
    return
  }
  const c = (ctl = new AbortController())
  loadingDetail.value = true
  try {
    const [rq, rs] = await Promise.all([
      api.flowRequest(f.id, decode.value, c.signal),
      f.status != null ? api.flowResponse(f.id, decode.value, c.signal) : Promise.resolve(null),
    ])
    if (c !== ctl) return
    reqData.value = rq
    respData.value = rs
  } catch (e) {
    if ((e as Error).name !== 'AbortError') ui.error(e)
  } finally {
    if (c === ctl) loadingDetail.value = false
  }
}
watch([selectedKey, decode], loadDetail)

// ------------------------------------------------------------ actions

async function sendToRepeater(f: FlowSummary) {
  try {
    const tab = await api.toRepeater(f.id)
    repeater.adopt(tab)
    ui.toast(t('toast.sentToRepeater', { id: f.id, name: tab.name }))
  } catch (e) {
    ui.error(e)
  }
}

const filtered = computed(() => {
  const f = flows.filter
  return !!(f.q || f.host || f.methods.length || f.status.length || f.hideStatic)
})

const urlOf = (f: FlowSummary) =>
  `${f.scheme}://${f.host}${f.port === (f.scheme === 'https' ? 443 : 80) ? '' : `:${f.port}`}${f.path}`

async function copy(text: string, what: string) {
  await navigator.clipboard.writeText(text)
  ui.toast(t('common.copied', { what }))
}

async function copyCurl(f: FlowSummary) {
  const raw = await api.flowRequest(f.id, false)
  await copy(
    toCurl(raw, {
      host: f.host,
      port: f.port,
      tls: f.scheme === 'https',
      http2: f.http_version === 'HTTP/2',
    }),
    'cURL',
  )
}

async function remove(f: FlowSummary) {
  await api.deleteFlows([f.id]).catch(ui.error)
}

async function clearAll() {
  if (!settings.s.confirmClear || confirm(t('filter.clearConfirm'))) await api.clearFlows().catch(ui.error)
}

const menu = ref<{ x: number; y: number; items: MenuItem[] } | null>(null)
function openMenu(e: MouseEvent, f: FlowSummary) {
  flows.selectedId = f.id
  menu.value = {
    x: e.clientX,
    y: e.clientY,
    items: [
      { label: t('menu.toRepeater'), shortcut: 'Ctrl+R', icon: Repeat, action: () => sendToRepeater(f) },
      {
        label: t('menu.toRepeaterOpen'),
        icon: SquareArrowOutUpRight,
        action: () => sendToRepeater(f).then(() => router.push('/repeater')),
      },
      { separator: true, label: '' },
      { label: t('menu.copyUrl'), icon: Link, action: () => copy(urlOf(f), 'URL') },
      { label: t('menu.copyCurl'), icon: Terminal, action: () => copyCurl(f) },
      { separator: true, label: '' },
      {
        label: t('menu.highlight'),
        icon: Highlighter,
        children: [
          ...Object.entries(HIGHLIGHT_SWATCH).map(([name, cls]) => ({
            label: name,
            swatch: cls,
            action: () => api.patchFlow(f.id, { highlight: name }).catch(ui.error),
          })),
          {
            label: t('menu.highlightNone'),
            action: () => api.patchFlow(f.id, { highlight: '' }).catch(ui.error),
          },
        ],
      },
      {
        label: t('menu.note'),
        icon: StickyNote,
        action: () => {
          const note = prompt(t('menu.noteTitle'), f.note ?? '')
          if (note !== null) api.patchFlow(f.id, { note }).catch(ui.error)
        },
      },
      { separator: true, label: '' },
      { label: t('menu.delete'), shortcut: 'Del', icon: Trash2, danger: true, action: () => remove(f) },
    ],
  }
}

// ------------------------------------------------------------ keyboard

const active = ref(true)
onActivated(() => (active.value = true))
onDeactivated(() => (active.value = false))

function onKey(e: KeyboardEvent) {
  if (!active.value) return
  const el = e.target as HTMLElement
  const typing = el.closest('input, textarea, .cm-editor')
  if (e.key === '/' && !typing) {
    e.preventDefault()
    document.querySelector<HTMLInputElement>('[data-filter-input]')?.focus()
    return
  }
  const f = selected.value
  if (!f || typing) return
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') {
    e.preventDefault()
    void sendToRepeater(f)
  } else if (e.key === 'Delete') {
    e.preventDefault()
    void remove(f)
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="flex h-full flex-col">
    <FilterBar v-model="flows.filter" :total="flows.total" :loading="flows.loading" @clear="clearAll" />
    <div
      v-if="flows.error"
      role="alert"
      class="flex h-7 shrink-0 items-center gap-2 border-b border-line bg-err/10 px-3 text-[0.6875rem] text-err"
    >
      <span class="truncate">{{ t('table.loadFailed', { msg: flows.error }) }}</span>
      <button class="ml-auto underline hover:text-fg" @click="flows.reload">{{ t('table.retry') }}</button>
    </div>
    <div class="min-h-0 flex-1">
      <SplitPane direction="vertical" :initial="45" storage-key="proxy-v">
        <template #a>
          <FlowTable
            :rows="flows.rows"
            :selected-id="flows.selectedId"
            :sort="flows.sort"
            @select="flows.selectedId = $event"
            @sort="flows.toggleSort"
            @menu="openMenu"
            @near-end="flows.loadMore"
          >
            <template #empty>
              <OnboardingCard v-if="!filtered" />
              <div v-else class="p-8 text-center font-sans text-dim">{{ t('table.noMatches') }}</div>
            </template>
          </FlowTable>
        </template>
        <template #b>
          <div class="flex h-full flex-col">
            <div
              v-if="selected?.error || selected?.truncated"
              class="flex shrink-0 items-center gap-2 border-b border-line px-3 py-1.5 text-[0.6875rem]"
              :class="selected.error ? 'bg-err/10 text-err' : 'bg-warn/10 text-warn'"
            >
              <template v-if="selected.error">{{
                t('viewer.errorPrefix', { msg: selected.error })
              }}</template>
              <template v-else>{{ t('viewer.truncated') }}</template>
              <span class="ml-auto font-mono text-dim">{{ formatDuration(selected.duration_us) }}</span>
            </div>
            <div class="min-h-0 flex-1">
              <SplitPane direction="horizontal" storage-key="proxy-h">
                <template #a>
                  <MessageViewer
                    v-model:decode="decode"
                    :title="t('viewer.request')"
                    :data="reqData"
                    :loading="loadingDetail"
                    storage-key="proxy-req"
                    decodable
                  />
                </template>
                <template #b>
                  <MessageViewer
                    v-model:decode="decode"
                    :title="t('viewer.response')"
                    :data="respData"
                    :loading="loadingDetail"
                    storage-key="proxy-resp"
                    :base-url="selected ? urlOf(selected) : undefined"
                    :empty="
                      selected
                        ? selected.error
                          ? t('viewer.noResponse')
                          : t('viewer.waiting')
                        : t('viewer.selectRequest')
                    "
                    decodable
                  />
                </template>
              </SplitPane>
            </div>
          </div>
        </template>
      </SplitPane>
    </div>
    <ContextMenu v-if="menu" v-bind="menu" @close="menu = null" />
  </div>
</template>
