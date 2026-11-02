<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { hexRow } from '@/lib/hex'

const props = defineProps<{ data: Uint8Array }>()
const scroller = useTemplateRef<HTMLDivElement>('scroller')
const ROW = 20

const virtualizer = useVirtualizer(
  computed(() => ({
    count: Math.ceil(props.data.length / 16),
    getScrollElement: () => scroller.value ?? null,
    estimateSize: () => ROW,
    overscan: 30,
  })),
)
</script>

<template>
  <div ref="scroller" class="h-full overflow-auto font-mono text-xs">
    <div :style="{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }">
      <div
        v-for="row in virtualizer.getVirtualItems()"
        :key="row.index"
        class="absolute left-0 flex w-full gap-4 whitespace-pre px-3"
        :style="{ top: `${row.start}px`, height: `${ROW}px`, lineHeight: `${ROW}px` }"
      >
        <template v-for="r in [hexRow(data, row.index)]" :key="r.offset">
          <span class="text-dim">{{ r.offset }}</span>
          <span>{{ r.hex }}</span>
          <span class="text-sky-300">{{ r.ascii }}</span>
        </template>
      </div>
    </div>
  </div>
</template>
