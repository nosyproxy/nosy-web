<script setup lang="ts">
import { computed, nextTick, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight, LoaderCircle, Lock, LockOpen, Plus, Send, Square, X } from '@lucide/vue'
import CodeView from '@/components/CodeView.vue'
import MessageViewer from '@/components/MessageViewer.vue'
import SplitPane from '@/components/SplitPane.vue'
import SelectionInspector from '@/components/SelectionInspector.vue'
import { useRepeater } from '@/stores/repeater'
import { useSettings } from '@/stores/settings'
import type { Target } from '@/api/client'
import { formatBytes, formatDuration, statusClass } from '@/lib/format'
import { t } from '@/i18n'

const rep = useRepeater()
const settings = useSettings()
onMounted(() => rep.load())

const tab = computed(() => rep.tabs.find((x) => x.id === rep.activeId))
const st = computed(() => (tab.value ? rep.state(tab.value.id) : null))
const entry = computed(() => (st.value && st.value.index >= 0 ? st.value.history[st.value.index] : undefined))

const editorSelection = ref('')
watch(
  () => rep.activeId,
  () => (editorSelection.value = ''),
)

const draft = computed({
  get: () => tab.value?.raw_request ?? '',
  set: (v: string) => tab.value && rep.setDraft(tab.value.id, v),
})

const baseUrl = computed(() => {
  const tg = tab.value?.target
  if (!tg) return undefined
  const path = draft.value.split(/\r?\n/, 1)[0]?.split(' ')[1] ?? '/'
  if (/^https?:\/\//.test(path)) return path
  const def = tg.tls ? 443 : 80
  return `${tg.tls ? 'https' : 'http'}://${tg.host}${tg.port === def ? '' : `:${tg.port}`}${path}`
})

function patchTarget(p: Partial<Target>) {
  if (!tab.value) return
  const next = { ...tab.value.target, ...p }
  if ('tls' in p && p.tls !== tab.value.target.tls) {
    if (next.port === 443 && !next.tls) next.port = 80
    else if (next.port === 80 && next.tls) next.port = 443
  }
  rep.setTarget(tab.value.id, next)
}

const send = () => tab.value && !st.value?.sending && rep.send(tab.value.id)
const cancel = () => tab.value && rep.cancel(tab.value.id)
const nav = (d: number) => {
  if (!tab.value || !st.value) return
  const i = st.value.index + d
  if (i >= 0 && i < st.value.history.length) void rep.show(tab.value.id, i, true)
}
watch(
  () => rep.decode,
  () => tab.value && rep.refreshResponse(tab.value.id),
)

// ------------------------------------------------------------ tabs: rename + drag reorder

const renaming = ref<number | null>(null)
const renameValue = ref('')
async function startRename(id: number, name: string) {
  renaming.value = id
  renameValue.value = name
  await nextTick()
  document.querySelector<HTMLInputElement>('[data-rename]')?.select()
}
function commitRename() {
  if (renaming.value != null) void rep.rename(renaming.value, renameValue.value)
  renaming.value = null
}

const dragFrom = ref<number | null>(null)
function drop(to: number) {
  if (dragFrom.value != null) void rep.move(dragFrom.value, to)
  dragFrom.value = null
}

// ------------------------------------------------------------ keyboard

const active = ref(true)
onActivated(() => (active.value = true))
onDeactivated(() => (active.value = false))
function onKey(e: KeyboardEvent) {
  if (!active.value) return
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    void send()
  } else if (e.key === 'Escape' && st.value?.sending) cancel()
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- tab strip -->
    <div
      class="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-line bg-bg px-2"
      role="tablist"
    >
      <div
        v-for="(tb, i) in rep.tabs"
        :key="tb.id"
        role="tab"
        :aria-selected="tb.id === rep.activeId"
        draggable="true"
        class="group flex h-7 max-w-52 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border pr-1 pl-2.5 text-xs transition-colors"
        :class="
          tb.id === rep.activeId
            ? 'border-line bg-panel text-fg shadow-sm'
            : 'border-transparent text-dim hover:bg-hover hover:text-fg'
        "
        @click="rep.activate(tb.id)"
        @dblclick="startRename(tb.id, tb.name)"
        @auxclick.middle="rep.close(tb.id)"
        @dragstart="dragFrom = i"
        @dragover.prevent
        @drop="drop(i)"
      >
        <LoaderCircle v-if="rep.state(tb.id).sending" class="size-3 animate-spin text-accent" />
        <input
          v-if="renaming === tb.id"
          v-model="renameValue"
          data-rename
          class="input !h-5 w-24"
          @keydown.enter="commitRename"
          @keydown.esc="renaming = null"
          @blur="commitRename"
          @click.stop
        />
        <span v-else class="truncate">{{ tb.name }}</span>
        <button
          class="grid size-5 place-items-center rounded text-faint opacity-0 group-hover:opacity-100 hover:bg-hover hover:text-fg"
          :class="tb.id === rep.activeId && 'opacity-100'"
          :aria-label="t('repeater.closeTab', { name: tb.name })"
          @click.stop="rep.close(tb.id)"
        >
          <X class="size-3" />
        </button>
      </div>
      <button class="btn-icon !size-7" :title="t('repeater.newTab')" @click="rep.create()">
        <Plus class="size-4" />
      </button>
    </div>

    <template v-if="tab && st">
      <!-- toolbar -->
      <div class="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel px-3">
        <button
          v-if="!st.sending"
          class="btn btn-primary !h-8 !px-4"
          :title="`${t('repeater.send')} (Ctrl+Enter)`"
          @click="send"
        >
          <Send class="size-3.5" />
          {{ t('repeater.send') }}
        </button>
        <button
          v-else
          class="btn btn-danger !h-8 !px-4"
          :title="`${t('repeater.cancel')} (Esc)`"
          @click="cancel"
        >
          <Square class="size-3.5" />
          {{ t('repeater.cancel') }}
        </button>

        <div class="flex items-center gap-0.5">
          <button
            class="btn-icon"
            :disabled="st.index <= 0"
            :aria-label="t('repeater.prev')"
            :title="t('repeater.prev')"
            @click="nav(-1)"
          >
            <ChevronLeft class="size-4" />
          </button>
          <span class="w-10 text-center font-mono text-[0.6875rem] text-faint">
            {{ st.history.length ? `${st.index + 1}/${st.history.length}` : '—' }}
          </span>
          <button
            class="btn-icon"
            :disabled="st.index >= st.history.length - 1"
            :aria-label="t('repeater.next')"
            :title="t('repeater.next')"
            @click="nav(1)"
          >
            <ChevronRight class="size-4" />
          </button>
        </div>

        <!-- target, styled like a URL field -->
        <div
          class="flex h-8 min-w-0 flex-1 items-center rounded-md border border-line bg-bg font-mono text-xs focus-within:border-accent"
          role="group"
          :aria-label="t('repeater.target')"
        >
          <button
            class="flex h-full items-center gap-1 rounded-l-md border-r border-line px-2.5 transition-colors hover:bg-hover"
            :class="tab.target.tls ? 'text-ok' : 'text-dim'"
            :title="tab.target.tls ? t('repeater.tlsOn') : t('repeater.tlsOff')"
            @click="patchTarget({ tls: !tab.target.tls })"
          >
            <Lock v-if="tab.target.tls" class="size-3.5" />
            <LockOpen v-else class="size-3.5" />
            {{ tab.target.tls ? 'https://' : 'http://' }}
          </button>
          <input
            class="h-full min-w-0 flex-1 bg-transparent px-2 outline-none"
            :value="tab.target.host"
            :aria-label="t('repeater.host')"
            spellcheck="false"
            @change="patchTarget({ host: ($event.target as HTMLInputElement).value.trim() })"
          />
          <span class="text-faint">:</span>
          <input
            class="h-full w-16 bg-transparent px-2 outline-none"
            type="number"
            min="1"
            max="65535"
            :value="tab.target.port"
            :aria-label="t('repeater.port')"
            @change="patchTarget({ port: Number(($event.target as HTMLInputElement).value) || 0 })"
          />
          <button
            class="mr-1 h-6 rounded px-2 font-sans text-[0.6875rem] font-semibold transition-colors"
            :class="tab.target.http2 ? 'bg-accent/15 text-accent' : 'text-faint hover:text-fg'"
            :aria-pressed="tab.target.http2"
            @click="patchTarget({ http2: !tab.target.http2 })"
          >
            HTTP/2
          </button>
        </div>

        <button
          class="chip shrink-0"
          :class="settings.s.updateContentLength && 'chip-on'"
          :aria-pressed="settings.s.updateContentLength"
          :title="t('repeater.updateClHint')"
          @click="settings.s.updateContentLength = !settings.s.updateContentLength"
        >
          Content-Length
        </button>
      </div>

      <div class="min-h-0 flex-1">
        <SplitPane direction="horizontal" storage-key="repeater-h">
          <template #a>
            <section class="flex h-full flex-col bg-panel" :aria-label="t('repeater.request')">
              <header class="flex h-9 shrink-0 items-center border-b border-line px-3">
                <h2 class="panel-title">{{ t('repeater.request') }}</h2>
                <span class="ml-auto text-[0.6875rem] text-faint">{{ t('repeater.hint') }}</span>
              </header>
              <div class="min-h-0 flex-1">
                <CodeView
                  :key="tab.id"
                  v-model="draft"
                  language="http"
                  :wrap="settings.s.wrap"
                  @submit="send"
                  @selection="editorSelection = $event"
                />
              </div>
              <SelectionInspector v-if="editorSelection" :text="editorSelection" />
            </section>
          </template>
          <template #b>
            <div class="flex h-full flex-col">
              <div class="min-h-0 flex-1">
                <MessageViewer
                  v-model:decode="rep.decode"
                  :title="t('viewer.response')"
                  :data="st.response"
                  :loading="st.sending"
                  storage-key="repeater-resp"
                  :base-url="baseUrl"
                  :empty="
                    st.sending
                      ? t('viewer.waiting')
                      : entry?.error
                        ? t('viewer.noResponse')
                        : t('repeater.empty')
                  "
                  decodable
                />
              </div>
              <footer
                class="flex h-8 shrink-0 items-center gap-2 border-t border-line bg-panel px-3 font-mono text-[0.6875rem] text-dim"
                role="status"
              >
                <template v-if="entry">
                  <span v-if="entry.error" class="truncate text-err" :title="entry.error">{{
                    entry.error
                  }}</span>
                  <template v-else>
                    <span
                      class="rounded px-1.5 py-0.5 font-semibold"
                      :class="[statusClass(entry.status), 'bg-current/10']"
                    >
                      {{ entry.status ?? '—' }}
                    </span>
                    <span>{{ entry.http_version }}</span>
                    <span class="text-faint">·</span>
                    <span>{{ formatBytes(entry.resp_size) }}</span>
                    <span class="text-faint">·</span>
                    <span>TTFB {{ formatDuration(entry.ttfb_us) }}</span>
                  </template>
                  <span class="ml-auto">{{
                    t('repeater.total', { t: formatDuration(entry.duration_us) })
                  }}</span>
                </template>
              </footer>
            </div>
          </template>
        </SplitPane>
      </div>
    </template>
  </div>
</template>
