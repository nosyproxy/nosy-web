<script setup lang="ts">
import { computed, useTemplateRef, watch } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { ArrowDown, ArrowUp, Lock, StickyNote } from '@lucide/vue'
import type { FlowSummary } from '@/api/client'
import type { SortKey } from '@/stores/flows'
import { ROW_HEIGHT, useSettings } from '@/stores/settings'
import {
  HIGHLIGHTS,
  formatBytes,
  formatDuration,
  formatTime,
  methodClass,
  mimeLabel,
  statusClass,
} from '@/lib/format'
import { t, type MessageKey } from '@/i18n'

const props = defineProps<{
  rows: FlowSummary[]
  selectedId: number | null
  sort: { key: SortKey; dir: 1 | -1 }
}>()
const emit = defineEmits<{
  select: [id: number]
  sort: [key: SortKey]
  menu: [e: MouseEvent, flow: FlowSummary]
  nearEnd: []
}>()

const settings = useSettings()
const rowHeight = computed(() => Math.round(ROW_HEIGHT[settings.s.density] * settings.s.uiScale))
const scroller = useTemplateRef<HTMLDivElement>('scroller')
const virtualizer = useVirtualizer(
  computed(() => ({
    count: props.rows.length,
    getScrollElement: () => scroller.value ?? null,
    estimateSize: () => rowHeight.value,
    overscan: 20,
    getItemKey: (i: number) => props.rows[i]!.id,
  })),
)
watch(rowHeight, () => virtualizer.value.measure())
const items = computed(() => virtualizer.value.getVirtualItems())

watch(items, (vis) => {
  const last = vis[vis.length - 1]
  if (last && last.index > props.rows.length - 50) emit('nearEnd')
})

const columns: { key: SortKey; label: MessageKey | '#'; cls: string; sortable: boolean }[] = [
  { key: 'id', label: '#', cls: 'justify-end', sortable: true },
  { key: 'host', label: 'table.host', cls: '', sortable: true },
  { key: 'method', label: 'table.method', cls: '', sortable: true },
  { key: 'path', label: 'table.url', cls: '', sortable: true },
  { key: 'status', label: 'table.status', cls: 'justify-end', sortable: true },
  { key: 'resp_size', label: 'table.length', cls: 'justify-end', sortable: true },
  { key: 'content_type', label: 'table.mime', cls: '', sortable: true },
  { key: 'duration_us', label: 'table.time', cls: 'justify-end', sortable: true },
  { key: 'id', label: 'table.start', cls: 'justify-end', sortable: false },
]
const grid =
  'grid-cols-[3.75rem_minmax(9rem,14rem)_4.5rem_minmax(12rem,1fr)_3.75rem_4.75rem_4.25rem_4.75rem_5.5rem]'

function move(delta: number) {
  if (!props.rows.length) return
  const i = props.rows.findIndex((r) => r.id === props.selectedId)
  const next = Math.min(props.rows.length - 1, Math.max(0, i < 0 ? 0 : i + delta))
  emit('select', props.rows[next]!.id)
  virtualizer.value.scrollToIndex(next, { align: 'auto' })
}

function onKey(e: KeyboardEvent) {
  const page = Math.floor((scroller.value?.clientHeight ?? 240) / rowHeight.value)
  const map: Record<string, number> = {
    ArrowDown: 1,
    ArrowUp: -1,
    PageDown: page,
    PageUp: -page,
    Home: -Infinity,
    End: Infinity,
  }
  if (e.key in map) {
    e.preventDefault()
    move(map[e.key]!)
  }
}

const defaultPort = (f: FlowSummary) => f.port === (f.scheme === 'https' ? 443 : 80)
const time = (ms: number) => formatTime(ms, settings.s.locale, settings.s.timeFormat === '12h')
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-panel text-xs">
    <div
      role="row"
      class="grid h-8 shrink-0 items-stretch border-b border-line bg-raised text-[0.6875rem] font-medium text-dim select-none"
      :class="grid"
    >
      <button
        v-for="(c, i) in columns"
        :key="i"
        role="columnheader"
        class="flex items-center gap-1 truncate px-2 transition-colors"
        :class="[
          c.cls,
          c.sortable ? 'hover:text-fg' : 'cursor-default',
          c.sortable && sort.key === c.key ? 'text-fg' : '',
        ]"
        :aria-sort="
          c.sortable && sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined
        "
        @click="c.sortable && emit('sort', c.key)"
      >
        {{ c.label === '#' ? '#' : t(c.label) }}
        <template v-if="c.sortable && sort.key === c.key">
          <ArrowUp v-if="sort.dir === 1" class="size-3 text-accent" />
          <ArrowDown v-else class="size-3 text-accent" />
        </template>
      </button>
    </div>
    <div
      ref="scroller"
      class="relative min-h-0 flex-1 overflow-auto outline-none"
      tabindex="0"
      role="grid"
      :aria-label="t('table.label')"
      @keydown="onKey"
    >
      <slot v-if="!rows.length" name="empty" />
      <div :style="{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }">
        <div
          v-for="item in items"
          :key="item.key as number"
          role="row"
          :aria-selected="rows[item.index]!.id === selectedId"
          class="absolute left-0 grid w-full cursor-default items-center border-b border-line/40 font-mono"
          :class="[
            grid,
            rows[item.index]!.id === selectedId
              ? 'bg-accent/15 shadow-[inset_2px_0_0_var(--color-accent)]'
              : (rows[item.index]!.highlight && HIGHLIGHTS[rows[item.index]!.highlight!]) || 'hover:bg-hover',
          ]"
          :style="{ top: `${item.start}px`, height: `${rowHeight}px` }"
          @mousedown="emit('select', rows[item.index]!.id)"
          @contextmenu.prevent="emit('menu', $event, rows[item.index]!)"
        >
          <template v-for="f in [rows[item.index]!]" :key="f.id">
            <span class="truncate px-2 text-right text-faint">{{ f.id }}</span>
            <span
              class="flex items-center gap-1.5 truncate px-2"
              :title="`${f.scheme}://${f.host}:${f.port}`"
            >
              <Lock v-if="f.scheme === 'https'" class="size-3 shrink-0 text-ok" aria-label="TLS" />
              <span v-else class="w-3 shrink-0"></span>
              <span class="truncate"
                >{{ f.host }}<span v-if="!defaultPort(f)" class="text-dim">:{{ f.port }}</span></span
              >
            </span>
            <span class="truncate px-2 font-semibold" :class="methodClass(f.method)">{{ f.method }}</span>
            <span class="flex items-center gap-1.5 truncate px-2" :title="f.path">
              <span class="truncate">{{ f.path }}</span>
              <span
                v-if="f.note"
                class="flex shrink-0 items-center gap-1 font-sans text-[0.6875rem] text-warn"
              >
                <StickyNote class="size-3" />{{ f.note }}
              </span>
            </span>
            <span
              class="truncate px-2 text-right font-semibold"
              :class="f.error ? 'text-err' : statusClass(f.status)"
              :title="f.error ?? ''"
            >
              {{ f.status ?? (f.error ? 'ERR' : '…') }}
            </span>
            <span class="truncate px-2 text-right text-dim">{{ formatBytes(f.resp_size) }}</span>
            <span class="truncate px-2 font-sans text-dim">{{ mimeLabel(f.content_type) }}</span>
            <span class="truncate px-2 text-right text-dim">{{ formatDuration(f.duration_us) }}</span>
            <span class="truncate px-2 text-right text-faint">{{ time(f.ts_start) }}</span>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
