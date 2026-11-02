<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { Download, Globe, Radio, ShieldCheck } from '@lucide/vue'
import { useInfo } from '@/stores/info'
import { t } from '@/i18n'

const store = useInfo()
onMounted(() => store.load())
const proxy = computed(() => store.info?.proxy_addr ?? '127.0.0.1:8080')
const curl = computed(
  () => `curl -x http://${proxy.value} --cacert ${store.info?.ca_path ?? 'ca.crt'} https://example.com`,
)
</script>

<template>
  <div class="absolute inset-0 overflow-auto">
    <div class="flex min-h-full items-center justify-center p-6">
      <div class="card w-full max-w-xl p-6 font-sans shadow-xl shadow-black/10">
        <div class="mb-5 flex items-center gap-3">
          <span class="grid size-9 place-items-center rounded-lg bg-accent/15 text-accent"
            ><Radio class="size-5"
          /></span>
          <div>
            <h2 class="text-base font-semibold">{{ t('onboard.title') }}</h2>
            <p class="flex items-center gap-1.5 text-xs text-dim">
              <span class="size-1.5 animate-pulse rounded-full bg-accent"></span>
              <code class="font-mono">http://{{ proxy }}</code>
            </p>
          </div>
        </div>
        <ol class="space-y-3 text-[0.8125rem]">
          <li class="flex gap-3">
            <span
              class="grid size-6 shrink-0 place-items-center rounded-full bg-raised font-mono text-xs text-dim"
              >1</span
            >
            <span class="pt-0.5"
              >{{ t('onboard.step1') }}
              <code class="rounded bg-raised px-1.5 py-0.5 font-mono text-accent">{{ proxy }}</code></span
            >
          </li>
          <li class="flex gap-3">
            <span
              class="grid size-6 shrink-0 place-items-center rounded-full bg-raised font-mono text-xs text-dim"
              >2</span
            >
            <span class="flex flex-1 flex-wrap items-center gap-2 pt-0.5">
              <ShieldCheck class="size-4 text-ok" /> {{ t('onboard.step2') }}
              <a class="btn btn-primary ml-auto" href="/api/ca.crt" download
                ><Download class="size-3.5" />{{ t('onboard.download') }}</a
              >
            </span>
          </li>
          <li class="flex gap-3">
            <span
              class="grid size-6 shrink-0 place-items-center rounded-full bg-raised font-mono text-xs text-dim"
              >3</span
            >
            <span class="flex items-center gap-2 pt-0.5"
              ><Globe class="size-4 text-info" /> {{ t('onboard.step3') }}</span
            >
          </li>
        </ol>
        <p class="mt-5 mb-1.5 text-xs text-dim">{{ t('onboard.tryCurl') }}</p>
        <pre class="overflow-x-auto rounded-lg bg-bg p-3 font-mono text-[0.6875rem] text-dim select-all">{{
          curl
        }}</pre>
      </div>
    </div>
  </div>
</template>
