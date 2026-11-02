<script setup lang="ts" generic="T extends string | number | boolean">
import type { Component } from 'vue'

const model = defineModel<T>({ required: true })
defineProps<{ options: { value: T; label: string; icon?: Component }[]; label: string }>()
</script>

<template>
  <div class="segmented" role="radiogroup" :aria-label="label">
    <button
      v-for="o in options"
      :key="String(o.value)"
      type="button"
      role="radio"
      :aria-checked="model === o.value"
      class="segment"
      :class="model === o.value && 'segment-on'"
      @click="model = o.value"
    >
      <component :is="o.icon" v-if="o.icon" class="size-3.5" />
      {{ o.label }}
    </button>
  </div>
</template>
