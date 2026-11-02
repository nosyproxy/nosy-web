<script setup lang="ts">
import { computed } from 'vue'
import { FilterX, Search, Server, Trash2, X } from '@lucide/vue'
import { emptyFilter, type Filter } from '@/lib/filter'
import { t } from '@/i18n'

const filter = defineModel<Filter>({ required: true })
defineProps<{ total: number; loading: boolean }>()
const emit = defineEmits<{ clear: [] }>()

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']
const STATUSES = [
  { v: 2, label: '2xx', cls: 'text-ok' },
  { v: 3, label: '3xx', cls: 'text-warn' },
  { v: 4, label: '4xx', cls: 'text-caution' },
  { v: 5, label: '5xx', cls: 'text-err' },
  { v: 0, label: '—', cls: '' },
]

function toggle<T>(list: T[], v: T) {
  const i = list.indexOf(v)
  if (i >= 0) list.splice(i, 1)
  else list.push(v)
}

const active = computed(
  () =>
    !!(
      filter.value.q ||
      filter.value.host ||
      filter.value.methods.length ||
      filter.value.status.length ||
      filter.value.hideStatic
    ),
)
const reset = () => Object.assign(filter.value, emptyFilter())
</script>

<template>
  <div class="flex h-11 shrink-0 items-center gap-3 border-b border-line bg-panel px-3" role="search">
    <div class="relative">
      <Search class="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-faint" />
      <input
        v-model="filter.q"
        class="input w-64 pr-7 pl-7"
        :placeholder="`${t('filter.url')}  /`"
        :aria-label="t('filter.url')"
        data-filter-input
        spellcheck="false"
      />
      <button
        v-if="filter.q"
        class="absolute top-1/2 right-1.5 -translate-y-1/2 text-faint hover:text-fg"
        :aria-label="t('common.close')"
        @click="filter.q = ''"
      >
        <X class="size-3.5" />
      </button>
    </div>
    <div class="relative">
      <Server class="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-faint" />
      <input
        v-model="filter.host"
        class="input w-52 pl-7"
        :placeholder="t('filter.host')"
        :aria-label="t('filter.host')"
        spellcheck="false"
      />
    </div>

    <div class="segmented" role="group" :aria-label="t('filter.methods')">
      <button
        v-for="m in METHODS"
        :key="m"
        class="chip"
        :class="filter.methods.includes(m) && 'chip-on'"
        :aria-pressed="filter.methods.includes(m)"
        @click="toggle(filter.methods, m)"
      >
        {{ m }}
      </button>
    </div>
    <div class="segmented" role="group" :aria-label="t('filter.status')">
      <button
        v-for="s in STATUSES"
        :key="s.v"
        class="chip"
        :class="filter.status.includes(s.v) ? 'chip-on' : s.cls"
        :aria-pressed="filter.status.includes(s.v)"
        :title="s.v === 0 ? t('filter.none') : undefined"
        @click="toggle(filter.status, s.v)"
      >
        {{ s.label }}
      </button>
    </div>
    <button
      class="chip"
      :class="filter.hideStatic && 'chip-on'"
      :aria-pressed="filter.hideStatic"
      @click="filter.hideStatic = !filter.hideStatic"
    >
      {{ t('filter.hideStatic') }}
    </button>
    <button v-if="active" class="btn-icon" :title="t('filter.reset')" @click="reset">
      <FilterX class="size-4" />
    </button>

    <div class="ml-auto flex items-center gap-3 text-[0.6875rem] text-dim">
      <span v-if="loading" class="h-1.5 w-1.5 animate-pulse rounded-full bg-accent"></span>
      <span class="font-mono">{{ t('filter.shown', { n: total.toLocaleString() }) }}</span>
      <button class="btn btn-danger" @click="emit('clear')">
        <Trash2 class="size-3.5" />
        {{ t('filter.clearHistory') }}
      </button>
    </div>
  </div>
</template>
