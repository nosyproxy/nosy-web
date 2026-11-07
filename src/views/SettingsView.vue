<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  Archive,
  Check,
  LoaderCircle,
  Download,
  Keyboard,
  Languages,
  Monitor,
  Moon,
  Palette,
  Repeat,
  RotateCcw,
  Server,
  ShieldCheck,
  Sun,
  TableProperties,
  Eye,
} from '@lucide/vue'
import SegmentedControl from '@/components/SegmentedControl.vue'
import ToggleSwitch from '@/components/ToggleSwitch.vue'
import { ACCENTS, useSettings, type Accent, type Density, type Theme } from '@/stores/settings'
import { useInfo } from '@/stores/info'
import { useUi } from '@/stores/ui'
import { api, type ProjectStats } from '@/api/client'
import { formatBytes } from '@/lib/format'
import { LOCALES, t, type Locale, type MessageKey } from '@/i18n'

const settings = useSettings()
const s = settings.s
const infoStore = useInfo()
onMounted(() => infoStore.load())
const info = computed(() => infoStore.info)
const uiVersion = __UI_VERSION__

const ui = useUi()
const stats = ref<ProjectStats | null>(null)
const compacting = ref(false)
const loadStats = () =>
  api
    .projectStats()
    .then((v) => (stats.value = v))
    .catch(() => {})
onMounted(loadStats)
async function compact() {
  compacting.value = true
  const before = stats.value?.file_bytes ?? 0
  try {
    await api.compact()
    await loadStats()
    const after = stats.value?.file_bytes ?? 0
    ui.toast(t('settings.compacted', { saved: formatBytes(Math.max(0, before - after)) }))
  } catch (e) {
    ui.error(e)
  } finally {
    compacting.value = false
  }
}

const sections = computed(() => [
  { id: 'general', label: t('settings.general'), icon: Languages },
  { id: 'appearance', label: t('settings.appearance'), icon: Palette },
  { id: 'history', label: t('settings.history'), icon: TableProperties },
  { id: 'viewer', label: t('settings.viewer'), icon: Eye },
  { id: 'repeater', label: t('settings.repeater'), icon: Repeat },
  { id: 'certificate', label: t('settings.certificate'), icon: ShieldCheck },
  { id: 'shortcuts', label: t('settings.shortcuts'), icon: Keyboard },
  { id: 'server', label: t('settings.about'), icon: Server },
])

const current = ref('general')
const scroller = ref<HTMLElement | null>(null)
function go(id: string) {
  current.value = id
  document.getElementById(`s-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
function onScroll() {
  const el = scroller.value
  if (!el) return
  const top = el.getBoundingClientRect().top + 80
  for (const sec of [...sections.value].reverse()) {
    const node = document.getElementById(`s-${sec.id}`)
    if (node && node.getBoundingClientRect().top <= top) {
      current.value = sec.id
      return
    }
  }
}

const themeOptions = computed(() => [
  { value: 'dark' as Theme, label: t('settings.themeDark'), icon: Moon },
  { value: 'light' as Theme, label: t('settings.themeLight'), icon: Sun },
  { value: 'system' as Theme, label: t('settings.themeSystem'), icon: Monitor },
])
const densityOptions = computed(() => [
  { value: 'compact' as Density, label: t('settings.densityCompact') },
  { value: 'normal' as Density, label: t('settings.densityNormal') },
  { value: 'comfortable' as Density, label: t('settings.densityComfortable') },
])
const timeOptions = computed(() => [
  { value: '24h' as const, label: t('settings.time24') },
  { value: '12h' as const, label: t('settings.time12') },
])
const localeOptions = LOCALES.map((l) => ({ value: l.value as Locale, label: l.label }))

const ACCENT_COLORS: Record<Accent, string> = {
  orange: '#f97316',
  blue: '#3b82f6',
  green: '#22c55e',
  purple: '#a855f7',
  pink: '#ec4899',
  red: '#ef4444',
}

const shortcuts: { keys: string[]; label: MessageKey }[] = [
  { keys: ['Ctrl', 'R'], label: 'shortcut.sendToRepeater' },
  { keys: ['Del'], label: 'shortcut.delete' },
  { keys: ['/'], label: 'shortcut.focusFilter' },
  { keys: ['↑', '↓', 'PgUp', 'PgDn'], label: 'shortcut.navigate' },
  { keys: ['Ctrl', 'Enter'], label: 'shortcut.send' },
  { keys: ['Esc'], label: 'shortcut.cancel' },
  { keys: ['Ctrl', 'F'], label: 'shortcut.search' },
  { keys: ['Ctrl', 'U'], label: 'shortcut.urlEncode' },
  { keys: ['Ctrl', 'Shift', 'U'], label: 'shortcut.urlDecode' },
  { keys: ['Ctrl', 'B'], label: 'shortcut.b64Encode' },
  { keys: ['Ctrl', 'Shift', 'B'], label: 'shortcut.b64Decode' },
  { keys: ['shortcut.doubleClick'], label: 'shortcut.rename' },
  { keys: ['shortcut.middleClick'], label: 'shortcut.closeTab' },
]
const keyLabel = (k: string) => (k.startsWith('shortcut.') ? t(k as MessageKey) : k)

function reset() {
  if (confirm(t('settings.resetConfirm'))) settings.reset()
}
</script>

<template>
  <div class="flex h-full">
    <aside class="w-60 shrink-0 border-r border-line bg-panel p-3">
      <h1 class="px-2 pt-1 pb-3 text-base font-semibold">{{ t('settings.title') }}</h1>
      <nav class="flex flex-col gap-0.5">
        <button
          v-for="sec in sections"
          :key="sec.id"
          class="flex h-8 items-center gap-2.5 rounded-md px-2 text-left text-[0.8125rem] transition-colors"
          :class="current === sec.id ? 'bg-accent/12 text-accent' : 'text-dim hover:bg-hover hover:text-fg'"
          @click="go(sec.id)"
        >
          <component :is="sec.icon" class="size-4" />
          {{ sec.label }}
        </button>
      </nav>
      <button class="btn mt-6 w-full" @click="reset">
        <RotateCcw class="size-3.5" />{{ t('settings.reset') }}
      </button>
      <p class="mt-3 px-1 text-[0.6875rem] leading-relaxed text-faint">{{ t('settings.saved') }}</p>
    </aside>

    <div ref="scroller" class="min-w-0 flex-1 overflow-auto" @scroll.passive="onScroll">
      <div class="mx-auto max-w-3xl space-y-6 p-8 pb-24">
        <!-- General -->
        <section :id="'s-general'" class="card scroll-mt-6 p-5">
          <h2 class="mb-3 flex items-center gap-2 font-semibold">
            <Languages class="size-4 text-accent" />{{ t('settings.general') }}
          </h2>
          <div class="divide-y divide-line">
            <div class="flex items-center justify-between gap-6 py-2.5">
              <div>
                <div>{{ t('settings.language') }}</div>
                <div class="text-xs text-dim">{{ t('settings.languageHint') }}</div>
              </div>
              <SegmentedControl v-model="s.locale" :options="localeOptions" :label="t('settings.language')" />
            </div>
            <div class="flex items-center justify-between gap-6 py-2.5">
              <div>{{ t('settings.timeFormat') }}</div>
              <SegmentedControl
                v-model="s.timeFormat"
                :options="timeOptions"
                :label="t('settings.timeFormat')"
              />
            </div>
            <ToggleSwitch v-model="s.confirmClear" :label="t('settings.confirmClear')" />
          </div>
        </section>

        <!-- Appearance -->
        <section :id="'s-appearance'" class="card scroll-mt-6 p-5">
          <h2 class="mb-3 flex items-center gap-2 font-semibold">
            <Palette class="size-4 text-accent" />{{ t('settings.appearance') }}
          </h2>
          <div class="divide-y divide-line">
            <div class="flex items-center justify-between gap-6 py-2.5">
              <div>{{ t('settings.theme') }}</div>
              <SegmentedControl v-model="s.theme" :options="themeOptions" :label="t('settings.theme')" />
            </div>
            <div class="flex items-center justify-between gap-6 py-2.5">
              <div>{{ t('settings.accent') }}</div>
              <div class="flex gap-2" role="radiogroup" :aria-label="t('settings.accent')">
                <button
                  v-for="a in ACCENTS"
                  :key="a"
                  role="radio"
                  :aria-checked="s.accent === a"
                  :aria-label="a"
                  :title="a"
                  class="grid size-7 place-items-center rounded-full ring-offset-2 ring-offset-panel transition"
                  :class="s.accent === a ? 'ring-2 ring-fg' : 'hover:scale-110'"
                  :style="{ backgroundColor: ACCENT_COLORS[a] }"
                  @click="s.accent = a"
                >
                  <Check v-if="s.accent === a" class="size-4 text-white" />
                </button>
              </div>
            </div>
            <div class="flex items-center justify-between gap-6 py-2.5">
              <label for="ui-scale">{{ t('settings.uiScale') }}</label>
              <div class="flex items-center gap-3">
                <input
                  id="ui-scale"
                  v-model.number="s.uiScale"
                  type="range"
                  min="0.8"
                  max="1.3"
                  step="0.05"
                  class="w-48 accent-accent"
                />
                <span class="w-12 text-right font-mono text-xs text-dim"
                  >{{ Math.round(s.uiScale * 100) }}%</span
                >
              </div>
            </div>
            <div class="flex items-center justify-between gap-6 py-2.5">
              <label for="editor-font">{{ t('settings.editorFont') }}</label>
              <div class="flex items-center gap-3">
                <input
                  id="editor-font"
                  v-model.number="s.editorFontSize"
                  type="range"
                  min="10"
                  max="20"
                  step="1"
                  class="w-48 accent-accent"
                />
                <span class="w-12 text-right font-mono text-xs text-dim">{{ s.editorFontSize }}px</span>
              </div>
            </div>
            <div class="flex items-center justify-between gap-6 py-2.5">
              <div>{{ t('settings.density') }}</div>
              <SegmentedControl
                v-model="s.density"
                :options="densityOptions"
                :label="t('settings.density')"
              />
            </div>
          </div>
        </section>

        <!-- History -->
        <section :id="'s-history'" class="card scroll-mt-6 p-5">
          <h2 class="mb-3 flex items-center gap-2 font-semibold">
            <TableProperties class="size-4 text-accent" />{{ t('settings.history') }}
          </h2>
          <div class="divide-y divide-line">
            <ToggleSwitch v-model="s.newestFirst" :label="t('settings.newestFirst')" />
            <ToggleSwitch v-model="s.decodeBodies" :label="t('settings.decode')" />
          </div>
        </section>

        <!-- Viewer -->
        <section :id="'s-viewer'" class="card scroll-mt-6 p-5">
          <h2 class="mb-3 flex items-center gap-2 font-semibold">
            <Eye class="size-4 text-accent" />{{ t('settings.viewer') }}
          </h2>
          <div class="divide-y divide-line">
            <ToggleSwitch v-model="s.wrap" :label="t('settings.wrap')" />
            <ToggleSwitch v-model="s.lineNumbers" :label="t('settings.lineNumbers')" />
            <ToggleSwitch
              v-model="s.renderExternal"
              :label="t('settings.renderExternal')"
              :hint="t('settings.renderExternalHint')"
            />
          </div>
        </section>

        <!-- Repeater -->
        <section :id="'s-repeater'" class="card scroll-mt-6 p-5">
          <h2 class="mb-3 flex items-center gap-2 font-semibold">
            <Repeat class="size-4 text-accent" />{{ t('settings.repeater') }}
          </h2>
          <div class="divide-y divide-line">
            <ToggleSwitch
              v-model="s.updateContentLength"
              :label="t('repeater.updateCl')"
              :hint="t('repeater.updateClHint')"
            />
            <div class="flex items-center justify-between gap-6 py-2.5">
              <label for="timeout">{{ t('settings.timeout') }}</label>
              <div class="flex items-center gap-3">
                <input
                  id="timeout"
                  v-model.number="s.timeout"
                  type="range"
                  min="1"
                  max="120"
                  step="1"
                  class="w-48 accent-accent"
                />
                <span class="w-12 text-right font-mono text-xs text-dim">{{
                  t('settings.seconds', { n: s.timeout })
                }}</span>
              </div>
            </div>
          </div>
        </section>

        <!-- Certificate -->
        <section :id="'s-certificate'" class="card scroll-mt-6 p-5">
          <h2 class="mb-3 flex items-center gap-2 font-semibold">
            <ShieldCheck class="size-4 text-accent" />{{ t('settings.certificate') }}
          </h2>
          <p class="mb-4 text-dim">{{ t('settings.caIntro') }}</p>
          <div class="flex gap-2">
            <a class="btn btn-primary" href="/api/ca.crt" download
              ><Download class="size-3.5" />{{ t('settings.downloadPem') }}</a
            >
            <a class="btn" href="/api/ca.der" download
              ><Download class="size-3.5" />{{ t('settings.downloadDer') }}</a
            >
          </div>
          <dl class="mt-5 space-y-3 text-xs">
            <div>
              <dt class="font-semibold">Firefox</dt>
              <dd class="text-dim">{{ t('settings.caFirefox') }}</dd>
            </div>
            <div>
              <dt class="font-semibold">Chrome / Chromium</dt>
              <dd class="text-dim">{{ t('settings.caChrome') }}</dd>
            </div>
            <div>
              <dt class="font-semibold">Linux</dt>
              <dd class="text-dim">{{ t('settings.caLinux') }}</dd>
            </div>
            <div>
              <dt class="font-semibold">curl</dt>
              <dd>
                <code class="text-dim"
                  >curl -x http://{{ info?.proxy_addr }} --cacert nosy-ca.crt https://example.com</code
                >
              </dd>
            </div>
          </dl>
          <p class="mt-4 text-xs text-dim">{{ t('settings.caMagic') }}</p>
        </section>

        <!-- Shortcuts -->
        <section :id="'s-shortcuts'" class="card scroll-mt-6 p-5">
          <h2 class="mb-3 flex items-center gap-2 font-semibold">
            <Keyboard class="size-4 text-accent" />{{ t('settings.shortcuts') }}
          </h2>
          <table class="w-full text-[0.8125rem]">
            <tbody class="divide-y divide-line">
              <tr v-for="sc in shortcuts" :key="sc.label">
                <td class="py-2 text-dim">{{ t(sc.label) }}</td>
                <td class="py-2 text-right whitespace-nowrap">
                  <template v-for="(k, i) in sc.keys" :key="k">
                    <span
                      v-if="i > 0 && sc.keys.length === 2 && !sc.keys.includes('↑')"
                      class="mx-1 text-faint"
                      >+</span
                    >
                    <span v-else-if="i > 0" class="mx-0.5"></span>
                    <kbd>{{ keyLabel(k) }}</kbd>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <!-- Server -->
        <section :id="'s-server'" class="card scroll-mt-6 p-5">
          <h2 class="mb-3 flex items-center gap-2 font-semibold">
            <Server class="size-4 text-accent" />{{ t('settings.about') }}
          </h2>
          <dl v-if="info" class="grid grid-cols-[13rem_1fr] gap-x-4 gap-y-2.5 text-xs">
            <dt class="text-dim">{{ t('settings.version') }}</dt>
            <dd class="font-mono">{{ info.version }} · UI {{ uiVersion }}</dd>
            <dt class="text-dim">{{ t('settings.proxyListener') }}</dt>
            <dd class="font-mono">http://{{ info.proxy_addr }}</dd>
            <dt class="text-dim">{{ t('settings.webUi') }}</dt>
            <dd class="font-mono">http://{{ info.ui_addr }}</dd>
            <dt class="text-dim">{{ t('settings.project') }}</dt>
            <dd class="font-mono break-all">{{ info.project_path }}</dd>
            <dt class="text-dim">{{ t('settings.caPath') }}</dt>
            <dd class="font-mono break-all">{{ info.ca_path }}</dd>
            <dt class="text-dim">{{ t('settings.verifyUpstream') }}</dt>
            <dd>{{ info.verify_upstream ? t('common.on') : t('settings.verifyOff') }}</dd>
            <dt class="text-dim">{{ t('settings.maxBody') }}</dt>
            <dd class="font-mono">{{ formatBytes(info.max_capture_bytes) }}</dd>
            <dt class="text-dim">{{ t('settings.auth') }}</dt>
            <dd>{{ info.auth ? t('settings.authOn') : t('settings.authOff') }}</dd>
            <template v-if="stats">
              <dt class="text-dim">{{ t('settings.projectSize') }}</dt>
              <dd class="flex items-center gap-3">
                <span class="font-mono">{{ formatBytes(stats.file_bytes) }}</span>
                <span class="text-faint">{{ t('settings.flowCount', { n: stats.flows }) }}</span>
                <button class="btn !h-6 !px-2 text-[0.6875rem]" :disabled="compacting" @click="compact">
                  <LoaderCircle v-if="compacting" class="size-3 animate-spin" />
                  <Archive v-else class="size-3" />
                  {{ t('settings.compact') }}
                </button>
              </dd>
              <dt class="text-dim">{{ t('settings.searchIndex') }}</dt>
              <dd>
                <template v-if="!info.search_index">{{ t('common.off') }}</template>
                <template v-else-if="stats.index_pending">{{
                  t('settings.indexing', { done: stats.indexed, left: stats.index_pending })
                }}</template>
                <template v-else>{{ t('settings.indexed', { n: stats.indexed }) }}</template>
              </dd>
              <template v-if="stats.dropped_events || stats.dropped_bodies">
                <dt class="text-dim">{{ t('settings.dropped') }}</dt>
                <dd class="text-warn">
                  {{
                    t('settings.droppedValue', { events: stats.dropped_events, bodies: stats.dropped_bodies })
                  }}
                </dd>
              </template>
            </template>
          </dl>
          <p class="mt-4 text-xs text-faint">{{ t('settings.cliHint') }}</p>
        </section>
      </div>
    </div>
  </div>
</template>
