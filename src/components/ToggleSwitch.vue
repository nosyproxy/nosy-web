<script setup lang="ts">
const model = defineModel<boolean>({ required: true })
defineProps<{ label: string; hint?: string }>()
</script>

<template>
  <label class="flex cursor-pointer items-start justify-between gap-6 py-2.5">
    <span class="min-w-0">
      <span class="block text-[0.8125rem] text-fg">{{ label }}</span>
      <span v-if="hint" class="mt-0.5 block text-xs text-dim">{{ hint }}</span>
    </span>
    <button
      type="button"
      role="switch"
      :aria-checked="model"
      :aria-label="label"
      class="relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors"
      :class="model ? 'bg-accent' : 'bg-line'"
      @click="model = !model"
    >
      <span
        class="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform"
        :class="model && 'translate-x-4'"
      ></span>
    </button>
  </label>
</template>
