<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useTemplateRef, watch, type Component } from 'vue'
import { ChevronRight } from '@lucide/vue'

export interface MenuItem {
  label: string
  shortcut?: string
  action?: () => void
  children?: MenuItem[]
  danger?: boolean
  separator?: boolean
  swatch?: string
  icon?: Component
}

const props = defineProps<{ x: number; y: number; items: MenuItem[] }>()
const emit = defineEmits<{ close: [] }>()
const el = useTemplateRef<HTMLDivElement>('el')
const pos = ref({ x: props.x, y: props.y })
const openSub = ref<number | null>(null)

watch(
  () => [props.x, props.y],
  async () => {
    pos.value = { x: props.x, y: props.y }
    await nextTick()
    const r = el.value?.getBoundingClientRect()
    if (!r) return
    pos.value = {
      x: Math.min(props.x, window.innerWidth - r.width - 4),
      y: Math.min(props.y, window.innerHeight - r.height - 4),
    }
  },
  { immediate: true },
)

function run(item: MenuItem) {
  if (item.children) return
  emit('close')
  item.action?.()
}

const onDown = (e: MouseEvent) => {
  if (!el.value?.contains(e.target as Node)) emit('close')
}
const onKey = (e: KeyboardEvent) => e.key === 'Escape' && emit('close')
setTimeout(() => {
  window.addEventListener('mousedown', onDown)
  window.addEventListener('keydown', onKey)
  window.addEventListener('blur', () => emit('close'), { once: true })
})
onBeforeUnmount(() => {
  window.removeEventListener('mousedown', onDown)
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div
    ref="el"
    role="menu"
    class="fixed z-50 min-w-52 rounded-lg border border-line bg-panel p-1 text-xs shadow-2xl shadow-black/30"
    :style="{ left: `${pos.x}px`, top: `${pos.y}px` }"
  >
    <template v-for="(item, i) in items" :key="i">
      <div v-if="item.separator" class="mx-1 my-1 h-px bg-line"></div>
      <div
        v-else
        role="menuitem"
        class="relative flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 hover:bg-hover"
        :class="item.danger ? 'text-err' : ''"
        @mouseenter="openSub = item.children ? i : null"
        @click="run(item)"
      >
        <component :is="item.icon" v-if="item.icon" class="size-3.5 text-dim" />
        <span v-else-if="item.swatch" class="h-2.5 w-2.5 rounded-sm" :class="item.swatch"></span>
        <span v-else class="w-3.5"></span>
        <span class="flex-1">{{ item.label }}</span>
        <kbd v-if="item.shortcut" class="!text-[0.625rem]">{{ item.shortcut }}</kbd>
        <ChevronRight v-if="item.children" class="size-3.5 text-dim" />
        <div
          v-if="item.children && openSub === i"
          class="absolute top-0 left-full ml-1 min-w-36 rounded-lg border border-line bg-panel p-1 shadow-2xl shadow-black/30"
        >
          <div
            v-for="(c, j) in item.children"
            :key="j"
            role="menuitem"
            class="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-hover"
            @click.stop="run(c)"
          >
            <span v-if="c.swatch" class="h-2.5 w-2.5 rounded-sm" :class="c.swatch"></span>
            {{ c.label }}
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
