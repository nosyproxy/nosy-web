<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { CircleAlert, Info, Repeat, Settings, SquareCode, Waypoints } from '@lucide/vue'
import { useFlows } from './stores/flows'
import { useInfo } from './stores/info'
import { useSettings } from './stores/settings'
import { useUi } from './stores/ui'
import { t } from './i18n'

useSettings() // applies theme / locale / scale to <html>
const flows = useFlows()
const ui = useUi()
const info = useInfo()
onMounted(() => {
  flows.start()
  void info.load()
})

const nav = computed(() => [
  { to: '/proxy', label: t('nav.proxy'), icon: Waypoints },
  { to: '/repeater', label: t('nav.repeater'), icon: Repeat },
  { to: '/decoder', label: t('nav.decoder'), icon: SquareCode },
  { to: '/settings', label: t('nav.settings'), icon: Settings },
])

async function copyProxy() {
  if (!info.info) return
  await navigator.clipboard.writeText(info.info.proxy_addr)
  ui.toast(t('common.copied', { what: info.info.proxy_addr }))
}
</script>

<template>
  <div class="flex h-full flex-col">
    <header class="flex h-12 shrink-0 items-center gap-6 border-b border-line bg-panel px-4">
      <RouterLink
        to="/proxy"
        class="flex items-center gap-2.5 font-semibold tracking-tight"
        aria-label="Nosy"
      >
        <svg viewBox="0 0 24 24" class="size-6" aria-hidden="true">
          <rect width="24" height="24" rx="6" fill="var(--color-accent)" />
          <path
            d="M7.5 17.5v-11l9 11v-11"
            fill="none"
            stroke="var(--color-on-accent)"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span class="text-[0.9375rem]">nosy</span>
      </RouterLink>
      <nav class="segmented" :aria-label="t('nav.proxy')">
        <RouterLink
          v-for="n in nav"
          :key="n.to"
          :to="n.to"
          class="segment !h-7 !px-3"
          active-class="segment-on"
        >
          <component :is="n.icon" class="size-4" />
          {{ n.label }}
        </RouterLink>
      </nav>
      <div class="ml-auto flex items-center gap-2 text-[0.6875rem]">
        <button
          v-if="info.info"
          class="flex h-7 items-center gap-1.5 rounded-md border border-line px-2 font-mono text-dim transition-colors hover:text-fg"
          :title="t('status.copyProxy')"
          @click="copyProxy"
        >
          <Waypoints class="size-3.5" />{{ info.info.proxy_addr }}
        </button>
        <span
          class="flex h-7 items-center gap-1.5 rounded-md px-2 font-medium"
          :class="flows.connected ? 'bg-ok/10 text-ok' : 'bg-err/10 text-err'"
          role="status"
        >
          <span class="size-1.5 rounded-full bg-current" :class="!flows.connected && 'animate-pulse'"></span>
          {{ flows.connected ? t('status.live') : t('status.offline') }}
        </span>
      </div>
    </header>
    <main class="min-h-0 flex-1">
      <RouterView v-slot="{ Component }">
        <KeepAlive>
          <component :is="Component" />
        </KeepAlive>
      </RouterView>
    </main>
    <div
      class="pointer-events-none fixed right-4 bottom-4 z-50 flex flex-col items-end gap-2"
      aria-live="polite"
    >
      <TransitionGroup
        enter-from-class="translate-y-2 opacity-0"
        leave-to-class="opacity-0"
        enter-active-class="transition duration-200"
        leave-active-class="transition duration-200"
      >
        <div
          v-for="toast in ui.toasts"
          :key="toast.id"
          class="pointer-events-auto flex max-w-md items-center gap-2 rounded-lg border px-3 py-2 text-xs shadow-xl shadow-black/20"
          :class="toast.kind === 'error' ? 'border-err/40 bg-panel text-err' : 'border-line bg-panel text-fg'"
        >
          <CircleAlert v-if="toast.kind === 'error'" class="size-4 shrink-0" />
          <Info v-else class="size-4 shrink-0 text-accent" />
          {{ toast.text }}
        </div>
      </TransitionGroup>
    </div>
  </div>
</template>
