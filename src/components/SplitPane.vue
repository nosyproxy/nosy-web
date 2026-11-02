<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'

const props = withDefaults(
  defineProps<{
    direction?: 'horizontal' | 'vertical'
    initial?: number
    min?: number
    storageKey?: string
  }>(),
  { direction: 'horizontal', initial: 50, min: 10, storageKey: undefined },
)

const stored = props.storageKey ? Number(localStorage.getItem(`split:${props.storageKey}`)) : NaN
const ratio = ref(Number.isFinite(stored) && stored > 0 ? stored : props.initial)
const root = useTemplateRef<HTMLDivElement>('root')

function start(e: PointerEvent) {
  const el = root.value!
  const rect = el.getBoundingClientRect()
  const target = e.currentTarget as HTMLElement
  target.setPointerCapture(e.pointerId)
  const move = (ev: PointerEvent) => {
    const pct =
      props.direction === 'horizontal'
        ? ((ev.clientX - rect.left) / rect.width) * 100
        : ((ev.clientY - rect.top) / rect.height) * 100
    ratio.value = Math.min(100 - props.min, Math.max(props.min, pct))
  }
  const up = () => {
    target.removeEventListener('pointermove', move)
    target.removeEventListener('pointerup', up)
    if (props.storageKey) localStorage.setItem(`split:${props.storageKey}`, String(ratio.value))
  }
  target.addEventListener('pointermove', move)
  target.addEventListener('pointerup', up)
}
</script>

<template>
  <div
    ref="root"
    class="flex h-full min-h-0 w-full min-w-0"
    :class="direction === 'horizontal' ? 'flex-row' : 'flex-col'"
  >
    <div class="min-h-0 min-w-0 overflow-hidden" :style="{ flex: `0 0 ${ratio}%` }"><slot name="a" /></div>
    <div
      class="shrink-0 bg-line transition-colors hover:bg-accent"
      :class="
        direction === 'horizontal'
          ? 'w-px cursor-col-resize px-[2px] bg-clip-content'
          : 'h-px cursor-row-resize py-[2px] bg-clip-content'
      "
      role="separator"
      :aria-orientation="direction === 'horizontal' ? 'vertical' : 'horizontal'"
      @pointerdown.prevent="start"
    ></div>
    <div class="min-h-0 min-w-0 flex-1 overflow-hidden"><slot name="b" /></div>
  </div>
</template>
