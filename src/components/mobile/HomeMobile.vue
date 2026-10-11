<script setup lang="ts">
import { computed, ref } from 'vue'
import { BRAND } from '../../brand'
import type { HomeData, Work } from '../../data/mock'
import { DOW, TODAY, dowCls, longDay, md } from '../../lib/date'
import { CATS, NEWS_NOTE, PLATFORMS, bg, dday, hotMeta, hotTag, hotWhy, isStale, platformLabel, platformTitle, refreshMsg, refreshing, useHot, useOtt, when } from '../../lib/home'
import { VIEWS, useCalendar } from '../../lib/calendar'
import { openDetail } from '../../lib/detail'
import { vBg } from '../../lib/lazy'
// 모바일은 탭으로 화면이 바뀌어서 스크롤 등장 대신 화면 전환 때 살짝 떠오르게만 한다 (.rise)
import Seg from '../shared/Seg.vue'
import NewsBadge from '../shared/NewsBadge.vue'
import RefreshButton from '../shared/RefreshButton.vue'
import SearchBox from '../shared/SearchBox.vue'

// 모바일 큰 배너는 세로 포스터를 더 큰 크기(w780)로
const hiRes = (url?: string) => url?.replace('/w500/', '/w780/')

const props = defineProps<{ data: HomeData }>()

type Screen = 'hot' | 'cal' | 'ott' | 'theater'
const TABS: [Screen, string][] = [['hot', '기대작'], ['cal', '캘린더'], ['ott', 'OTT'], ['theater', '극장']]
const screen = ref<Screen>('hot')
function go(s: Screen) {
  screen.value = s
  window.scrollTo(0, 0)
}

// 메인: 공개 예정/지금 인기 × 플랫폼, 10개 = 배너 1 + 목록 9
const { mode: hotMode, platform: hotPlatform, list: hot, title: hotTitle } = useHot(() => props.data)
const meta = (w: Work) => hotMeta(w, hotMode.value)
const title = computed(() => ({ hot: hotTitle.value, cal: '공개 일정', ott: 'OTT', theater: '극장' })[screen.value])

const { view, y, m, sel, week, on, grid, pick, step, toToday, isToday, numCls } = useCalendar(() => props.data.events)
const calTitle = computed(() => {
  if (view.value === 'month') return `${y.value}년 ${m.value + 1}월`
  const [s, e] = [week.value[0], week.value[6]]
  return `${s.getMonth() + 1}.${s.getDate()} – ${e.getMonth() + 1}.${e.getDate()}`
})
const isSel = (d: Date) => d.getTime() === sel.value.getTime()
const dayItems = computed(() => on(sel.value))

const { platform, cat, upcoming, available, showAll, more, showAllUp, moreUp } = useOtt(() => props.data)

const theaterTab = ref<'now' | 'soon'>('now')
const movies = computed(() => props.data.theater[theaterTab.value])
</script>

<template>
  <div class="m">
    <header>
      <span class="logo">{{ BRAND }}<span class="accent">.</span></span>
      <div class="head-right">
        <span v-if="!refreshing && !refreshMsg && !isStale(data.updatedAt)" class="meta">{{ longDay(TODAY) }}</span>
        <RefreshButton :updated-at="data.updatedAt" compact />
        <SearchBox :data="data" compact />
      </div>
    </header>

    <main>
      <h1>{{ title }}</h1>

      <div v-if="screen === 'hot'" class="col20 rise">
        <Seg v-model="hotMode" grid :options="[['soon', '공개 예정'], ['now', '지금 인기']]" label="기대작 구분" />
        <div class="bleed">
          <div role="group" aria-label="플랫폼별 보기" class="chips hscroll">
            <button v-for="p in PLATFORMS" :key="p" type="button" class="chip" :aria-pressed="hotPlatform === p" @click="hotPlatform = p">{{ p }}</button>
          </div>
        </div>
        <template v-if="hot.length">
          <article class="hero lead">
            <Transition name="xfade">
              <div :key="hot[0].id" class="hero-img" :style="bg(hiRes(hot[0].poster) ?? hot[0].backdrop)"></div>
            </Transition>
            <button type="button" class="hit" :aria-label="`${hot[0].title} 자세히 보기`" @click="openDetail(hot[0])"></button>
            <span v-if="!hot[0].poster && !hot[0].backdrop" class="ph-label">still</span>
            <div class="shade"></div>
            <span :key="`b-${hot[0].id}`" class="hero-badge rise">{{ hotTag(hot[0], hotMode) }}</span>
            <div :key="`i-${hot[0].id}`" class="lead-info rise">
              <span class="why on-image">{{ hotWhy(hot[0], hotMode, hotPlatform) }}</span>
              <span class="lead-title">{{ hot[0].title }}</span>
              <p v-if="hot[0].overview" class="blurb on-image">{{ hot[0].overview }}</p>
              <span class="row-chip">
                <span class="lead-meta" :title="platformTitle(hot[0])">{{ meta(hot[0]) }}</span>
                <NewsBadge :w="hot[0]" on-image />
              </span>
            </div>
          </article>
          <ul class="list10">
            <li v-for="(h, i) in hot.slice(1)" :key="h.id" class="card hot-item rise" :style="{ '--i': i + 1 }">
              <button type="button" class="hit" :aria-label="`${h.title} 자세히 보기`" @click="openDetail(h)"></button>
              <span class="ph" v-bg="h.poster"></span>
              <div class="hot-body col3">
                <span class="tag">{{ hotTag(h, hotMode) }}</span>
                <span class="hot-title">{{ h.title }}</span>
                <span class="why small">{{ hotWhy(h, hotMode, hotPlatform) }}</span>
                <p v-if="h.overview" class="blurb small">{{ h.overview }}</p>
                <span class="row-chip">
                  <span class="meta small" :title="platformTitle(h)">{{ meta(h) }}</span>
                  <NewsBadge :w="h" />
                </span>
              </div>
            </li>
          </ul>
        </template>
        <p v-else class="empty">{{ hotPlatform === '전체' ? '아직 정리된 작품이 없어요.' : `${hotPlatform}의 ${hotMode === 'soon' ? '공개 예정작' : '인기작'}이 아직 없어요.` }}</p>
      </div>

      <div v-else-if="screen === 'cal'" class="col16 rise">
        <Seg v-model="view" grid :options="VIEWS" label="보기 단위" />
        <div class="cal-head">
          <span class="cal-title">{{ calTitle }}</span>
          <div class="nav-btns">
            <button type="button" class="icon-btn" aria-label="이전" @click="step(-1)">←</button>
            <button type="button" class="text-btn sm" @click="toToday">오늘</button>
            <button type="button" class="icon-btn" aria-label="다음" @click="step(1)">→</button>
          </div>
        </div>

        <div v-if="view === 'month'" class="col4">
          <div class="grid7">
            <span v-for="(n, i) in DOW" :key="n" class="dow" :class="dowCls(i)">{{ n }}</span>
          </div>
          <div class="grid7 g2">
            <template v-for="(d, i) in grid" :key="i">
              <div v-if="!d" class="mc blank"></div>
              <button v-else type="button" class="mc" :class="{ 'today-ring': isToday(d) && !isSel(d) }" :aria-label="`${d.getMonth() + 1}월 ${d.getDate()}일`" :aria-pressed="isSel(d)" @click="pick(d)">
                <span class="n" :class="numCls(d)">{{ d.getDate() }}</span>
                <span class="dots"><i v-for="(e, j) in on(d).slice(0, 3)" :key="j" :class="{ th: e.platform === '극장' }"></i></span>
              </button>
            </template>
          </div>
          <div class="legend">
            <span><i></i>OTT</span>
            <span><i class="th"></i>극장</span>
          </div>
          <p class="cal-note"><span class="news sm">기사</span>{{ NEWS_NOTE }}</p>
        </div>

        <div v-else class="grid7 g4">
          <button v-for="(d, i) in week" :key="i" type="button" class="mc wc" :class="{ 'today-ring': isToday(d) && !isSel(d) }" :aria-label="`${d.getMonth() + 1}월 ${d.getDate()}일`" :aria-pressed="isSel(d)" @click="pick(d)">
            <span class="wd n" :class="dowCls(i)">{{ DOW[i] }}</span>
            <span class="n wn" :class="isToday(d) ? 'accent' : ''">{{ d.getDate() }}</span>
            <span class="dots"><i v-for="(e, j) in on(d).slice(0, 3)" :key="j" :class="{ th: e.platform === '극장' }"></i></span>
          </button>
        </div>

        <div class="col12 day">
          <div class="sub-head">
            <h2 class="h18">{{ longDay(sel) }}</h2>
            <span class="meta">{{ dayItems.length ? `${dayItems.length}개 공개` : '' }}</span>
          </div>
          <ul class="list8">
            <li v-for="(e, j) in dayItems" :key="`${sel.getTime()}-${e.id}`" class="rise" :style="{ '--i': j }">
              <button type="button" class="card day-item" @click="openDetail(e)">
                <span class="ph" v-bg="e.poster"></span>
                <span class="col2">
                  <span class="row-chip">
                    <span class="t16">{{ e.title }}</span>
                    <NewsBadge :w="e" plain />
                  </span>
                  <span class="meta" :title="platformTitle(e)">{{ platformLabel(e) }} · {{ e.type }}</span>
                </span>
                <span class="muted" aria-hidden="true">›</span>
              </button>
            </li>
          </ul>
          <p v-if="!dayItems.length" class="empty">이날 공개되는 작품이 없어요.</p>
        </div>
      </div>

      <div v-else-if="screen === 'ott'" class="col28 rise">
        <div class="col4 bleed">
          <div role="group" aria-label="플랫폼" class="chips hscroll">
            <button v-for="p in PLATFORMS" :key="p" type="button" class="chip" :aria-pressed="platform === p" @click="platform = p">{{ p }}</button>
          </div>
          <div role="group" aria-label="카테고리" class="cats hscroll">
            <button v-for="c in CATS" :key="c" type="button" class="cat" :aria-pressed="cat === c" @click="cat = c">{{ c }}</button>
          </div>
        </div>

        <div class="col12">
          <div class="sub-head">
            <h2 class="h20">공개 예정</h2>
            <span class="meta small">기사 기준 예정일</span>
          </div>
          <ul class="list8">
            <li v-for="(u, i) in upcoming" :key="u.id" class="card up rise" :style="{ '--i': i }">
              <button type="button" class="hit" :aria-label="`${u.title} 자세히 보기`" @click="openDetail(u)"></button>
              <div class="ph" v-bg="u.poster"></div>
              <div class="col3 grow">
                <span class="row-chip">
                  <span class="t15">{{ u.title }}</span>
                  <NewsBadge :w="u" />
                </span>
                <span class="meta small" :title="platformTitle(u)">{{ platformLabel(u) }} · {{ u.type }} · {{ when(u) }}</span>
                <p v-if="u.overview" class="blurb small">{{ u.overview }}</p>
              </div>
              <div class="up-side">
                <span class="dday">{{ dday(u) }}</span>
                <a :href="u.source ?? '#'" target="_blank" rel="noopener" class="src">{{ u.via === 'tmdb' ? 'TMDB' : '기사' }} ↗</a>
              </div>
            </li>
          </ul>
          <button v-if="moreUp > 0" type="button" class="more-btn" :aria-expanded="showAllUp" @click="showAllUp = !showAllUp">{{ showAllUp ? '접기 ↑' : `${moreUp}개 더 보기 ↓` }}</button>
          <p v-if="!upcoming.length" class="empty">조건에 맞는 공개 예정작이 없어요.</p>
        </div>

        <div class="col14">
          <div class="sub-head">
            <h2 class="h20">지금 볼 수 있어요</h2>
            <button v-if="more" type="button" class="all" :aria-expanded="showAll" @click="showAll = !showAll">{{ showAll ? '접기 ↑' : '전체 보기 →' }}</button>
          </div>
          <div class="avail">
            <button v-for="(v, i) in available" :key="v.id" type="button" class="tile rise" :style="{ '--i': i }" @click="openDetail(v)">
              <div class="ph poster" v-bg="v.poster"><span v-if="!v.poster" class="ph-label">poster</span></div>
              <span class="t13">{{ v.title }}</span>
              <span class="meta tiny" :title="platformTitle(v)">{{ platformLabel(v) }}</span>
            </button>
          </div>
          <p v-if="!available.length" class="empty">조건에 맞는 작품이 없어요.</p>
        </div>
      </div>

      <div v-else class="col20 rise">
        <Seg v-model="theaterTab" grid :options="[['now', '상영중'], ['soon', '개봉예정']]" label="극장 구분" />
        <div class="movies">
          <button v-for="(mv, i) in movies" :key="mv.id" type="button" class="tile rise" :style="{ '--i': i }" @click="openDetail(mv)">
            <div class="ph poster" v-bg="mv.poster">
              <span v-if="!mv.poster" class="ph-label">poster</span>
              <span class="badge" :class="{ soon: theaterTab === 'soon' }">{{ theaterTab === 'now' ? '상영중' : dday(mv) }}</span>
            </div>
            <div class="col2">
              <span class="t15">{{ mv.title }}</span>
              <span class="meta small">{{ mv.genre }} · {{ mv.date ? md(mv.date) : when(mv) }} 개봉</span>
              <p v-if="mv.overview" class="blurb small">{{ mv.overview }}</p>
            </div>
          </button>
        </div>
        <p v-if="!movies.length" class="empty">표시할 영화가 없어요.</p>
      </div>

      <p class="foot">극장: KOBIS · 작품 정보: TMDB · 스트리밍: JustWatch<br>OTT 공개 예정일은 기사 기준이며 실제와 다를 수 있습니다.</p>
    </main>

    <nav aria-label="하단 메뉴" class="tabs">
      <button v-for="[id, name] in TABS" :key="id" type="button" :aria-current="screen === id ? 'page' : undefined" @click="go(id)">{{ name }}</button>
    </nav>
  </div>
</template>

<style scoped>
.m { max-width: 430px; margin: 0 auto; min-height: 100vh; display: flex; flex-direction: column; }
header { position: sticky; top: 0; z-index: 5; background: var(--bg); padding: 0 20px; min-height: 56px; display: flex; align-items: center; justify-content: space-between; }
.logo { font-size: 20px; flex: 0 0 auto; }
.head-right { display: flex; align-items: center; gap: 4px; min-width: 0; margin-left: 12px; }
main { flex: 1 1 auto; padding: 8px 20px 32px; display: flex; flex-direction: column; gap: 24px; }
h1 { font-size: 30px; font-weight: 800; letter-spacing: -1px; line-height: 1.2; }
.h18 { font-size: 18px; font-weight: 700; }
.h20 { font-size: 20px; font-weight: 700; }
.col2, .col3, .col4, .col12, .col14, .col16, .col20, .col28 { display: flex; flex-direction: column; min-width: 0; }
.col2 { gap: 2px; } .col3 { gap: 3px; } .col4 { gap: 4px; } .col12 { gap: 12px; } .col14 { gap: 14px; } .col16 { gap: 16px; } .col20 { gap: 20px; } .col28 { gap: 28px; }
.grow { flex: 1 1 auto; }
.list8, .list10 { display: flex; flex-direction: column; gap: 8px; }
.list10 { gap: 10px; }
.meta { font-size: 13px; color: var(--mute); }
.meta.small { font-size: 12px; }
.meta.tiny { font-size: 11px; margin-top: -4px; }
.t13 { font-size: 13px; font-weight: 600; }
.t15 { font-size: 15px; font-weight: 700; }
.t16 { font-size: 16px; font-weight: 700; }
.sub-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }

.lead { aspect-ratio: 4/5; }
.hero > .ph-label { top: 12px; left: 14px; font-size: 11px; }
.hero-badge { top: 12px; right: 12px; font-size: 13px; padding: 6px 10px; }
.lead-info { position: absolute; left: 18px; right: 18px; bottom: 18px; display: flex; flex-direction: column; gap: 6px; }
.lead-meta { font-size: 13px; color: var(--sub); }
.lead-title { font-size: 28px; font-weight: 800; letter-spacing: -0.8px; line-height: 1.2; }
.hot-item { display: flex; gap: 14px; padding: 12px; }
.hot-item > .ph { flex: 0 0 76px; aspect-ratio: 2/3; }
.hot-body { flex: 1; justify-content: center; }
.why.on-image { color: var(--accent); }
.why.small { font-size: 12px; }
.hot-title { font-size: 17px; font-weight: 700; letter-spacing: -0.3px; line-height: 1.3; }

.cal-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.cal-title { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; }
.text-btn.sm { padding: 0 12px; font-size: 13px; }
.grid7 { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
.g2 { gap: 2px; }
.g4 { gap: 4px; }
.dow { text-align: center; font-size: 12px; font-weight: 600; padding: 4px 0; }
.mc { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; min-height: 52px; padding: 0; border: 0; border-radius: 12px; background: var(--surf); transition: background-color 0.2s var(--ease), transform 0.15s var(--ease); }
.mc:active { transform: scale(0.95); }
.mc.blank { background: transparent; }
.mc[aria-pressed='true'] { background: var(--text); }
.mc[aria-pressed='true'] .n { color: var(--bg); }
.n { font-size: 15px; font-weight: 600; }
.wc { justify-content: flex-start; min-height: 68px; padding: 8px 0; }
.wd { font-size: 12px; }
.wn { font-size: 17px; font-weight: 700; }
.dots { display: flex; gap: 3px; height: 5px; }
.dots i, .legend i { width: 5px; height: 5px; border-radius: 3px; background: var(--text); }
.dots i.th, .legend i.th { background: var(--accent); }
.legend { display: flex; gap: 16px; padding-top: 8px; font-size: 12px; color: var(--mute); }
.legend span { display: flex; align-items: center; gap: 6px; }
.legend i { width: 6px; height: 6px; }
.day { padding-top: 8px; }
.day-item { display: flex; align-items: center; gap: 14px; width: 100%; min-height: 44px; padding: 12px; background: var(--surf); }
.day-item > .ph { flex: 0 0 44px; aspect-ratio: 2/3; border-radius: 6px; }
.day-item > .col2 { flex: 1 1 auto; }

.bleed { margin: 0 -20px; }
.hscroll { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; padding: 0 20px; }
.hscroll::-webkit-scrollbar { display: none; }
.chip { padding: 0 18px; }
.up { display: flex; gap: 14px; align-items: center; padding: 12px; }
.up > .ph { flex: 0 0 48px; aspect-ratio: 2/3; border-radius: 6px; }
.up-side { flex: 0 0 auto; display: flex; flex-direction: column; align-items: flex-end; }
.up-side .src { min-height: 32px; display: flex; align-items: center; }
.dday { font-size: 17px; font-weight: 800; color: var(--accent); }
.all { min-height: 44px; display: flex; align-items: center; font-size: 13px; color: var(--mute); border: 0; background: none; padding: 0; }
.avail { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px 10px; }
.avail .tile { gap: 6px; }
.avail .poster { border-radius: 10px; padding: 6px; }
.avail .ph-label { font-size: 10px; }
.movies { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px 14px; }
.movies .tile { gap: 10px; }

.foot { padding-top: 20px; border-top: 1px solid var(--line-soft); font-size: 12px; line-height: 1.6; color: var(--mute); }
/* 카드 클릭 버튼(.hit 1)·기사 링크(2)보다 위. 헤더(5)와 같은 원리 */
.tabs { position: sticky; bottom: 0; z-index: 10; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); background: var(--bg); border-top: 1px solid var(--line-soft); }
.tabs button { min-height: 56px; border: 0; background: transparent; font-size: 14px; font-weight: 500; color: var(--mute); transition: color 0.2s var(--ease), box-shadow 0.25s var(--ease); }
.tabs button[aria-current='page'] { color: var(--text); font-weight: 700; box-shadow: inset 0 2px 0 var(--accent); }
</style>
