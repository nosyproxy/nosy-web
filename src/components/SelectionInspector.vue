<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ScanSearch, WandSparkles } from '@lucide/vue'
import { inspect } from '@/lib/transform'
import { useDecoder } from '@/stores/decoder'
import { useUi } from '@/stores/ui'
import { t } from '@/i18n'

const props = defineProps<{ text: string }>()
const decoder = useDecoder()
const ui = useUi()
const router = useRouter()

// Cheap: only short, synchronous decoders run on every selection change.
const rows = computed(() => (props.text.length <= 64 * 1024 ? inspect(props.text) : []))

async function copy(v: string) {
  await navigator.clipboard.writeText(v)
  ui.toast(t('common.copied', { what: `${v.length} ch` }))
}
async function toDecoder() {
  await decoder.open(props.text)
  await router.push('/decoder')
}
</script>

<template>
  <div
    class="flex max-h-[40%] shrink-0 flex-col border-t border-line bg-raised"
    role="region"
    :aria-label="t('inspector.title')"
  >
    <div class="flex h-8 shrink-0 items-center gap-2 px-3 text-[0.6875rem] text-dim">
      <ScanSearch class="size-3.5 text-accent" />
      <span class="font-semibold tracking-wider uppercase">{{ t('inspector.title') }}</span>
      <span class="font-mono text-faint">{{ t('inspector.chars', { n: text.length }) }}</span>
      <button class="chip ml-auto flex items-center gap-1" @click="toDecoder">
        <WandSparkles class="size-3.5" />{{ t('inspector.toDecoder') }}
      </button>
    </div>
    <div class="min-h-0 overflow-auto px-3 pb-2">
      <p v-if="!rows.length" class="pb-1 text-xs text-faint">{{ t('inspector.none') }}</p>
      <button
        v-for="r in rows"
        :key="r.op"
        class="group flex w-full items-start gap-3 rounded-md px-2 py-1.5 text-left hover:bg-hover"
        :title="t('inspector.clickToCopy')"
        @click="copy(r.value)"
      >
        <span class="w-16 shrink-0 pt-px text-[0.6875rem] font-semibold text-accent">{{ r.label }}</span>
        <span class="line-clamp-4 min-w-0 flex-1 font-mono text-xs break-all whitespace-pre-wrap">{{
          r.value
        }}</span>
      </button>
    </div>
  </div>
</template>
