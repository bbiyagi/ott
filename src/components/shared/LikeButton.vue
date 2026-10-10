<script setup lang="ts">
import { computed } from 'vue'
import type { Work } from '../../data/mock'
import { liked, toggleLike, type HotMode } from '../../lib/home'

const p = defineProps<{ work: Work; mode: HotMode; glass?: boolean }>()
const on = computed(() => liked.has(p.work.id))
const label = computed(() => (p.mode === 'soon' ? (on.value ? '기대하는 중' : '기대돼요') : on.value ? '추천했어요' : '추천해요'))
const count = computed(() => ((p.work.likes ?? 0) + (on.value ? 1 : 0)).toLocaleString('ko-KR'))
</script>

<template>
  <button type="button" class="like" :class="{ glass }" :aria-pressed="on" @click="toggleLike(work.id)">
    <span>{{ label }}</span><span>{{ count }}</span>
  </button>
</template>
