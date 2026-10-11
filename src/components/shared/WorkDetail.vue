<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { closeDetail, detail, watchLinks } from '../../lib/detail'
import { NEWS_NOTE, bg, dday, platformLabel, when } from '../../lib/home'
import { TODAY, iso, md } from '../../lib/date'
import NewsBadge from './NewsBadge.vue'

// 브라우저 기본 <dialog>: Esc로 닫기, 포커스 가두기, 뒤 배경 막기를 그대로 쓴다
const dlg = ref<HTMLDialogElement>()
// 열 때마다 새 객체가 들어오므로 작품이 바뀔 때마다 확인한다 (어떤 식으로 닫혔든 다음 클릭에 다시 열린다)
watch(detail, async (d) => {
  await nextTick()
  if (d && !dlg.value?.open) dlg.value?.showModal()
  if (!d && dlg.value?.open) dlg.value.close()
})

const tag = computed(() => {
  const d = detail.value!
  if (d.rank) return d.rank
  if (d.platform === '극장') return d.date && d.date <= iso(TODAY) ? '상영중' : dday(d)
  return d.date || d.dateText ? dday(d) : ''
})
const meta = computed(() => {
  const d = detail.value!
  const date = d.platform === '극장' ? (d.date ? `${md(d.date)} 개봉` : '') : d.date || d.dateText ? when(d) : ''
  return [platformLabel(d), d.genre ?? d.type, date].filter(Boolean).join(' · ')
})
const shortDate = (s: string) => md(s.slice(0, 10))
</script>

<template>
  <dialog ref="dlg" class="detail" aria-labelledby="detail-title" @close="closeDetail" @click.self="dlg?.close()">
    <article v-if="detail" class="sheet">
      <div class="art" :style="bg(detail.backdrop ?? detail.poster)">
        <button type="button" class="close" aria-label="닫기" @click="dlg?.close()">✕</button>
      </div>
      <div class="body">
        <div class="row-chip">
          <span v-if="tag" class="tag">{{ tag }}</span>
          <NewsBadge :w="detail" />
        </div>
        <h2 id="detail-title">{{ detail.title }}</h2>
        <p class="meta">{{ meta }}</p>
        <p v-if="detail.overview" class="overview">{{ detail.overview }}</p>
        <p v-else-if="detail.loading" class="muted">불러오는 중…</p>

        <div class="actions">
          <a v-for="l in watchLinks(detail)" :key="l.url" :href="l.url" target="_blank" rel="noopener" class="act primary">{{ l.label }} ↗</a>        </div>

        <section v-if="detail.sources.length" class="sources" aria-labelledby="detail-src">
          <h3 id="detail-src">출처 기사 {{ detail.sources.length }}건</h3>
          <p class="muted small">{{ NEWS_NOTE }}</p>
          <ul>
            <li v-for="s in detail.sources" :key="s.link">
              <a :href="s.link" target="_blank" rel="noopener">{{ s.title }}</a>
              <span class="muted small">{{ shortDate(s.date) }}</span>
            </li>
          </ul>
        </section>
      </div>
    </article>
  </dialog>
</template>

<style scoped>
.detail { padding: 0; border: 0; border-radius: 16px; background: var(--surf); color: var(--text); width: min(640px, calc(100% - 32px)); max-height: 90vh; overflow: auto; }
.detail::backdrop { background: rgba(0, 0, 0, 0.65); }
/* 열릴 때: 배경은 서서히 어두워지고 창은 살짝 떠오른다 (모바일은 아래에서 올라온다) */
.detail[open] { animation: open 0.32s var(--ease); }
.detail[open]::backdrop { animation: dim 0.32s var(--ease); }
@keyframes open { from { opacity: 0; transform: translateY(14px) scale(0.985); } }
@keyframes dim { from { opacity: 0; } }
.close { transition: background-color 0.2s var(--ease); }
.close:hover { background: rgba(14, 14, 16, 0.9); }
.art { position: relative; aspect-ratio: 16/9; background: var(--stripe-lg); }
.close { position: absolute; top: 12px; right: 12px; width: 44px; height: 44px; border: 0; border-radius: 22px; background: rgba(14, 14, 16, 0.7); font-size: 16px; }
.body { padding: 20px 24px 28px; display: flex; flex-direction: column; gap: 10px; }
h2 { margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px; line-height: 1.25; }
h3 { margin: 0; font-size: 16px; font-weight: 700; }
.meta { font-size: 14px; color: var(--mute); }
.overview { font-size: 15px; line-height: 1.65; color: var(--sub); }
.small { font-size: 12px; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; padding-top: 6px; }
.act { display: inline-flex; align-items: center; min-height: 44px; padding: 0 16px; border-radius: 10px; border: 1px solid var(--line-strong); text-decoration: none; font-size: 14px; font-weight: 700; }
.act.primary { background: var(--accent); border-color: var(--accent); color: var(--bg); }
.act.primary:hover { color: var(--bg); filter: brightness(1.08); }
.sources { display: flex; flex-direction: column; gap: 6px; padding-top: 14px; border-top: 1px solid var(--line-soft); margin-top: 8px; }
.sources ul { display: flex; flex-direction: column; }
.sources li { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--line-soft); }
.sources li a { font-size: 14px; text-decoration: none; line-height: 1.45; }
.sources li span { flex: 0 0 auto; }
@media (max-width: 767px) {
  .detail { width: 100%; max-width: 100%; max-height: 92vh; margin: auto 0 0; border-radius: 16px 16px 0 0; }
  .detail[open] { animation-name: sheet; }
  @keyframes sheet { from { transform: translateY(40px); opacity: 0.6; } }
  .body { padding: 16px 20px 28px; }
  h2 { font-size: 22px; }
}
</style>
