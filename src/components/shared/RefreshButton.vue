<script setup lang="ts">
import { computed } from 'vue'
import { isStale, refresh, refreshMsg, refreshing, updatedLabel } from '../../lib/home'

const p = defineProps<{ updatedAt?: string; compact?: boolean }>()
const stale = computed(() => isStale(p.updatedAt))
const text = computed(() => {
  if (refreshing.value) return p.compact ? '불러오는 중…' : '기사·작품 정보를 다시 불러오는 중… (1~2분)'
  if (refreshMsg.value) return refreshMsg.value
  // 하루 넘게 그대로면 예약 수집이 멈춘 것. 사용자도 알 수 있게 표시한다
  if (stale.value) return p.compact ? '오래된 정보' : `${updatedLabel(p.updatedAt)} · 하루 넘게 업데이트되지 않았어요`
  return updatedLabel(p.updatedAt)
})
</script>

<template>
  <div class="refresh" :class="{ compact }">
    <!-- 모바일(compact)은 진행 중·결과·오래됨일 때만 글자를 보인다 -->
    <span v-if="!compact || refreshing || refreshMsg || stale" class="status" :class="{ stale: stale && !refreshing && !refreshMsg }" role="status">{{ text }}</span>
    <button type="button" class="text-btn" :disabled="refreshing" :aria-busy="refreshing" @click="refresh">
      <span class="icon" :class="{ spin: refreshing }" aria-hidden="true">↻</span>{{ compact ? '' : ' 새로고침' }}
      <span v-if="compact" class="sr-only">새로고침</span>
    </button>
  </div>
</template>

<style scoped>
.refresh { display: flex; align-items: center; gap: 10px; min-width: 0; }
.status { font-size: 12px; color: var(--mute); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.status.stale { color: var(--accent); }
.text-btn { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; flex: 0 0 auto; }
.compact .text-btn { width: 44px; padding: 0; justify-content: center; }
.text-btn:disabled { cursor: progress; color: var(--mute); }
.icon { display: inline-block; font-size: 16px; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
</style>
