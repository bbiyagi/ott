<script setup lang="ts">
import { NEWS_NOTE } from '../../lib/home'

// 기사에서 모은 날짜 표시. 누르면 그 기사로 간다 (plain: 이미 링크 안에 있을 때 글자만)
defineProps<{ w: { via?: string; source?: string }; sm?: boolean; onImage?: boolean; plain?: boolean }>()
</script>

<template>
  <template v-if="w.via === 'news'">
    <span v-if="plain || !w.source" class="news" :class="{ sm, 'on-image': onImage }" :title="NEWS_NOTE">{{ sm ? '기사' : '기사 기준' }}</span>
    <a v-else class="news" :class="{ 'on-image': onImage }" :href="w.source" target="_blank" rel="noopener" :title="`${NEWS_NOTE} · 눌러서 기사 보기`">기사 기준 ↗</a>
  </template>
</template>
