<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ShieldCheck, Globe } from '@lucide/vue'
import { decodeBody, isHtml, isImage, bodyKind } from '@/lib/http'
import { buildPreview } from '@/lib/render'
import { useSettings } from '@/stores/settings'
import { t } from '@/i18n'

const props = defineProps<{ body: Uint8Array; contentType?: string; baseUrl?: string; encoded: boolean }>()
const settings = useSettings()

const mode = computed<'image' | 'html' | null>(() => {
  if (isImage(props.contentType)) return 'image'
  if (isHtml(props.contentType) || bodyKind(props.body, props.contentType) === 'html') return 'html'
  return null
})

const srcdoc = computed(() =>
  mode.value === 'html'
    ? buildPreview(decodeBody(props.body, props.contentType), {
        external: settings.s.renderExternal,
        baseUrl: props.baseUrl,
      })
    : '',
)

// Images go through a blob: URL (SVG in <img> cannot run scripts).
const imageUrl = ref<string | null>(null)
const dims = ref('')
watch(
  () => [props.body, props.contentType, mode.value] as const,
  () => {
    if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
    imageUrl.value = null
    dims.value = ''
    if (mode.value === 'image' && props.body.length) {
      const type = props.contentType?.split(';')[0]?.trim() || 'application/octet-stream'
      imageUrl.value = URL.createObjectURL(new Blob([props.body as BlobPart], { type }))
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => imageUrl.value && URL.revokeObjectURL(imageUrl.value))

function onImage(e: Event) {
  const img = e.target as HTMLImageElement
  dims.value = `${img.naturalWidth} × ${img.naturalHeight}`
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div v-if="encoded" class="p-4 text-dim">{{ t('viewer.renderEncoded') }}</div>
    <div v-else-if="!body.length" class="p-4 text-dim">{{ t('viewer.emptyBody') }}</div>
    <template v-else-if="mode === 'html'">
      <div
        class="flex h-7 shrink-0 items-center gap-2 border-b border-line bg-raised px-3 text-[0.6875rem] text-dim"
      >
        <ShieldCheck class="size-3.5 text-ok" />
        <span>{{ t('viewer.renderSandboxed') }}</span>
        <span class="flex items-center gap-1" :class="settings.s.renderExternal ? 'text-warn' : ''">
          <Globe class="size-3.5" />
          {{ settings.s.renderExternal ? t('viewer.renderExternal') : t('viewer.renderNoExternal') }}
        </span>
      </div>
      <iframe
        class="min-h-0 w-full flex-1 border-0 bg-white"
        sandbox=""
        referrerpolicy="no-referrer"
        :srcdoc="srcdoc"
        :title="t('viewer.render')"
      ></iframe>
    </template>
    <div
      v-else-if="mode === 'image' && imageUrl"
      class="checker flex min-h-0 flex-1 flex-col items-center justify-center gap-2 overflow-auto p-4"
    >
      <img :src="imageUrl" alt="" class="max-h-full max-w-full object-contain" @load="onImage" />
      <span v-if="dims" class="rounded bg-panel/80 px-2 py-0.5 font-mono text-[0.6875rem] text-dim">{{
        dims
      }}</span>
    </div>
    <div v-else class="p-4 text-dim">{{ t('viewer.renderUnsupported') }}</div>
  </div>
</template>

<style scoped>
.checker {
  background-color: var(--color-panel);
  background-image:
    linear-gradient(45deg, var(--color-hover) 25%, transparent 25%),
    linear-gradient(-45deg, var(--color-hover) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--color-hover) 75%),
    linear-gradient(-45deg, transparent 75%, var(--color-hover) 75%);
  background-size: 16px 16px;
  background-position:
    0 0,
    0 8px,
    8px -8px,
    -8px 0;
}
</style>
