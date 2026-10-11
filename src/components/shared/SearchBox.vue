<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { HomeData } from '../../data/mock'
import { dday, platformLabel, search, type Hit } from '../../lib/home'
import { openDetail } from '../../lib/detail'
import { vBg } from '../../lib/lazy'

// compact: 모바일. 돋보기 버튼을 누르면 헤더 위에 검색줄이 열린다
const p = defineProps<{ data: HomeData; compact?: boolean }>()

const q = ref('')
const focused = ref(false)
const active = ref(0)
const opened = ref(false) // compact에서 검색줄이 열렸는지
const input = ref<HTMLInputElement>()

const hits = computed(() => search(p.data, q.value))
const show = computed(() => focused.value && q.value.trim().length > 0)
const sub = (h: Hit) => {
  const when = h.kind === '공개 예정' || h.kind === '극장 개봉예정' ? dday(h.w) : ''
  return [h.kind, h.w.platform === '극장' ? '' : platformLabel(h.w), when].filter(Boolean).join(' · ')
}

function pick(h?: Hit) {
  if (!h) return
  openDetail(h.w)
  q.value = ''
  input.value?.blur()
  opened.value = false
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') active.value = Math.min(active.value + 1, hits.value.length - 1)
  else if (e.key === 'ArrowUp') active.value = Math.max(active.value - 1, 0)
  else if (e.key === 'Enter') pick(hits.value[active.value])
  else if (e.key === 'Escape') {
    if (q.value) q.value = ''
    else close()
    return
  } else return
  e.preventDefault()
}
async function open() {
  opened.value = true
  await nextTick()
  input.value?.focus()
}
function close() {
  q.value = ''
  opened.value = false
  input.value?.blur()
}
</script>

<template>
  <div class="search" :class="{ compact, opened }">
    <button v-if="compact && !opened" type="button" class="icon-btn open" aria-label="작품 검색" @click="open">
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2" /><path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
    </button>
    <div v-if="!compact || opened" class="field">
      <label for="q" class="sr-only">작품 검색</label>
      <input
        id="q" ref="input" v-model="q" type="search" placeholder="작품 검색" autocomplete="off"
        role="combobox" aria-autocomplete="list" aria-controls="q-list" :aria-expanded="show"
        :aria-activedescendant="show && hits.length ? `q-${active}` : undefined"
        @focus="focused = true" @blur="focused = false" @input="active = 0" @keydown="onKey"
      >
      <button v-if="compact" type="button" class="text-btn sm" @click="close">닫기</button>
      <ul v-show="show" id="q-list" role="listbox" class="results" aria-label="검색 결과">
        <!-- mousedown.prevent: 클릭할 때 입력창 blur로 목록이 먼저 닫히지 않게 -->
        <li
          v-for="(h, i) in hits" :id="`q-${i}`" :key="h.w.id + h.kind" role="option" :aria-selected="i === active"
          @mousedown.prevent @mouseenter="active = i" @click="pick(h)"
        >
          <span class="ph" v-bg="h.w.poster"></span>
          <span class="txt">
            <b>{{ h.w.title }}</b>
            <small>{{ sub(h) }}</small>
          </span>
        </li>
        <li v-if="!hits.length" class="none" role="option" aria-disabled="true">"{{ q }}"에 맞는 작품이 없어요</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.search { position: relative; flex: 0 1 260px; min-width: 0; }
.field { position: relative; display: flex; align-items: center; gap: 8px; }
input { width: 100%; height: 44px; padding: 0 16px; border-radius: 10px; border: 1px solid var(--line); background: var(--surf); color: var(--text); font: inherit; font-size: 14px; }
input::placeholder { color: var(--mute); }
input:focus { border-color: var(--line-strong); }
.results { position: absolute; top: calc(100% + 6px); left: 0; right: 0; min-width: 300px; z-index: 20; max-height: 420px; overflow: auto; padding: 6px; border: 1px solid var(--line); border-radius: 12px; background: var(--surf); box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5); animation: drop 0.18s var(--ease); }
.compact .results { left: 0; right: 0; min-width: 0; }
@keyframes drop { from { opacity: 0; transform: translateY(-4px); } }
li { display: flex; align-items: center; gap: 12px; min-height: 44px; padding: 8px; border-radius: 8px; cursor: pointer; }
li[aria-selected='true'] { background: var(--surf2); }
li .ph { flex: 0 0 32px; aspect-ratio: 2/3; border-radius: 5px; }
.txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.txt b { font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.txt small { font-size: 12px; color: var(--mute); }
.none { cursor: default; color: var(--mute); font-size: 13px; }
/* 모바일: 열리면 헤더 전체를 덮는 검색줄 */
.compact { flex: 0 0 auto; }
.compact.opened { position: absolute; inset: 0; z-index: 6; display: flex; align-items: center; padding: 0 20px; background: var(--bg); }
.compact.opened .field { flex: 1; }
.text-btn.sm { flex: 0 0 auto; padding: 0 12px; font-size: 13px; }
</style>
