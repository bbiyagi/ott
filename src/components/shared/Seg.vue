<script setup lang="ts" generic="T extends string">
defineProps<{ options: [T, string][]; label: string; grid?: boolean }>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <div role="tablist" :aria-label="label" class="seg" :class="{ grid }" :style="grid ? { gridTemplateColumns: `repeat(${options.length}, 1fr)` } : undefined">
    <button v-for="[v, name] in options" :key="v" type="button" role="tab" :aria-selected="model === v" @click="model = v">{{ name }}</button>
  </div>
</template>
