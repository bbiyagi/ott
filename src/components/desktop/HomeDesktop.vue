<script setup lang="ts">
import { computed, ref } from 'vue'
import { BRAND } from '../../brand'
import type { HomeData, Work } from '../../data/mock'
import { DOW, TODAY, dowCls, longDay, md } from '../../lib/date'
import { CATS, NEWS_NOTE, PLATFORMS, bg, dday, hotMeta, hotTag, hotWhy, platformLabel, platformTitle, useOtt, when, type HotMode } from '../../lib/home'
import { VIEWS, useCalendar } from '../../lib/calendar'
import { openDetail } from '../../lib/detail'
import Seg from '../shared/Seg.vue'
import NewsBadge from '../shared/NewsBadge.vue'
import RefreshButton from '../shared/RefreshButton.vue'

const props = defineProps<{ data: HomeData }>()

const NAV = [['hot', '기대작'], ['cal', '캘린더'], ['ott', 'OTT'], ['theater', '극장']]
const active = ref('hot')

const hotMode = ref<HotMode>('soon')
const hot = computed(() => props.data.hot[hotMode.value])
const meta = (w: Work) => hotMeta(w, hotMode.value)

const { view, y, m, week, on, months, pct, grid, step, toToday, pickMonth, isToday, isCurMonth, numCls } = useCalendar(() => props.data.events)
const calTitle = computed(() => {
  if (view.value === 'year') return `${y.value}년`
  if (view.value === 'month') return `${y.value}년 ${m.value + 1}월`
  const [s, e] = [week.value[0], week.value[6]]
  return `${s.getMonth() + 1}월 ${s.getDate()}일 – ${e.getMonth() + 1}월 ${e.getDate()}일`
})

const { platform, cat, upcoming, available, showAll, more, showAllUp, moreUp, total } = useOtt(() => props.data)

const theaterTab = ref<'now' | 'soon'>('now')
const movies = computed(() => props.data.theater[theaterTab.value])
</script>

<template>
  <div>
    <header class="top">
      <div class="wrap head">
        <a href="#" class="logo">{{ BRAND }}<span class="accent">.</span></a>
        <nav aria-label="주 메뉴">
          <a v-for="[id, name] in NAV" :key="id" :href="`#${id}`" :aria-current="active === id ? 'true' : undefined" @click="active = id">{{ name }}</a>
        </nav>
        <div class="search">
          <RefreshButton :updated-at="data.updatedAt" />
          <label for="q" class="sr-only">작품 검색</label>
          <input id="q" type="search" placeholder="작품 검색">
        </div>
      </div>
    </header>

    <main class="wrap">
      <section id="hot" aria-labelledby="hot-h">
        <div class="sec-head end">
          <div class="col10">
            <span class="date">{{ longDay(TODAY) }}</span>
            <h1 id="hot-h">{{ hotMode === 'soon' ? '곧 공개되는 기대작' : '지금 인기 있는 작품' }}</h1>
          </div>
          <Seg v-model="hotMode" :options="[['soon', '공개 예정'], ['now', '지금 인기']]" label="기대작 구분" />
        </div>
        <div v-if="hot.length" class="hot">
          <article class="hero lead" :style="bg(hot[0].backdrop ?? hot[0].poster)">
            <button type="button" class="hit" :aria-label="`${hot[0].title} 자세히 보기`" @click="openDetail(hot[0])"></button>
            <span v-if="!hot[0].backdrop && !hot[0].poster" class="ph-label">still · 16:10</span>
            <div class="shade"></div>
            <span class="hero-badge">{{ hotTag(hot[0], hotMode) }}</span>
            <div class="lead-info col8">
              <span class="why on-image">{{ hotWhy(hot[0], hotMode) }}</span>
              <span class="lead-title">{{ hot[0].title }}</span>
              <span class="row-chip">
                <span class="lead-meta" :title="platformTitle(hot[0])">{{ meta(hot[0]) }}</span>
                <NewsBadge :w="hot[0]" on-image />
              </span>
            </div>
          </article>
          <ul class="hot-list">
            <li v-for="h in hot.slice(1)" :key="h.id" class="card hot-item">
              <button type="button" class="hit" :aria-label="`${h.title} 자세히 보기`" @click="openDetail(h)"></button>
              <span class="ph" :style="bg(h.poster)"></span>
              <div class="hot-body col4">
                <span class="tag">{{ hotTag(h, hotMode) }}</span>
                <span class="hot-title">{{ h.title }}</span>
                <span class="why">{{ hotWhy(h, hotMode) }}</span>
                <span class="row-chip">
                  <span class="meta" :title="platformTitle(h)">{{ meta(h) }}</span>
                  <NewsBadge :w="h" />
                </span>
              </div>
            </li>
          </ul>
        </div>
        <p v-else class="empty">아직 정리된 작품이 없어요.</p>
      </section>

      <section id="cal" aria-labelledby="cal-h">
        <div class="sec-head">
          <h2 id="cal-h" class="h2">{{ calTitle }}</h2>
          <div class="tools">
            <Seg v-model="view" :options="VIEWS" label="보기 단위" />
            <div class="nav-btns">
              <button type="button" class="icon-btn" aria-label="이전" @click="step(-1)">←</button>
              <button type="button" class="text-btn" @click="toToday">오늘</button>
              <button type="button" class="icon-btn" aria-label="다음" @click="step(1)">→</button>
            </div>
          </div>
        </div>

        <div v-if="view === 'year'" class="years">
          <button v-for="(c, k) in months" :key="k" type="button" class="year-cell" :class="{ cur: isCurMonth(k) }" :aria-label="`${k + 1}월 보기`" @click="pickMonth(k)">
            <span class="year-name">{{ k + 1 }}월</span>
            <span class="year-count">{{ c.total }}<small>작품</small></span>
            <span class="bar"><span :style="{ width: pct(c.total) }"></span></span>
            <span class="meta">OTT {{ c.ott }} · 극장 {{ c.total - c.ott }}</span>
          </button>
        </div>

        <div v-else-if="view === 'month'" class="col8">
          <div class="grid7">
            <span v-for="(n, i) in DOW" :key="n" class="dow" :class="dowCls(i)">{{ n }}</span>
          </div>
          <div class="grid7">
            <template v-for="(d, i) in grid" :key="i">
              <div v-if="!d" class="mcell blank"></div>
              <div v-else class="mcell" :class="{ 'today-ring': isToday(d) }">
                <span class="num" :class="numCls(d)">{{ d.getDate() }}</span>
                <button v-for="(e, j) in on(d).slice(0, 3)" :key="j" type="button" class="mitem" :title="`${platformTitle(e)} · ${e.title}${e.via === 'news' ? ` (${NEWS_NOTE})` : ''}`" @click="openDetail(e)"><span v-if="e.via === 'news'" class="news sm">기사</span><span class="muted">{{ platformLabel(e) }}</span> {{ e.title }}</button>
                <span v-if="on(d).length > 3" class="more">+{{ on(d).length - 3 }}개 더</span>
              </div>
            </template>
          </div>
        </div>

        <div v-else class="grid7">
          <div v-for="(d, i) in week" :key="i" class="wcell" :class="{ 'today-ring': isToday(d) }">
            <div class="wtop">
              <span class="wnum" :class="{ accent: isToday(d) }">{{ d.getDate() }}</span>
              <span class="wdow" :class="dowCls(i)">{{ DOW[i] }}</span>
            </div>
            <button v-for="(e, j) in on(d)" :key="j" type="button" class="witem" :title="e.via === 'news' ? NEWS_NOTE : undefined" @click="openDetail(e)">
              <span class="muted" :title="platformTitle(e)"><span v-if="e.via === 'news'" class="news sm">기사</span>{{ platformLabel(e) }}</span>
              <b>{{ e.title }}</b>
            </button>
          </div>
        </div>
        <p v-if="view !== 'year'" class="cal-note"><span class="news sm">기사</span>{{ NEWS_NOTE }}</p>
      </section>

      <section id="ott" aria-labelledby="ott-h">
        <div class="sec-head base">
          <h2 id="ott-h" class="h2">OTT</h2>
          <span class="muted t14">{{ total }}개 작품</span>
        </div>
        <div class="col12">
          <div role="group" aria-label="플랫폼" class="chips">
            <button v-for="p in PLATFORMS" :key="p" type="button" class="chip" :aria-pressed="platform === p" @click="platform = p">{{ p }}</button>
          </div>
          <div role="group" aria-label="카테고리" class="cats">
            <button v-for="c in CATS" :key="c" type="button" class="cat" :aria-pressed="cat === c" @click="cat = c">{{ c }}</button>
          </div>
        </div>

        <div class="ott">
          <div class="ott-col">
            <div class="sub-head">
              <h3>공개 예정</h3>
              <span class="meta">기사 기준 예정일 · 변동될 수 있어요</span>
            </div>
            <ul class="ups">
              <li v-for="u in upcoming" :key="u.id" class="card up">
                <button type="button" class="hit" :aria-label="`${u.title} 자세히 보기`" @click="openDetail(u)"></button>
                <div class="ph" :style="bg(u.poster)"></div>
                <div class="up-body">
                  <span class="row-chip">
                    <span class="up-title">{{ u.title }}</span>
                    <NewsBadge :w="u" />
                  </span>
                  <span class="meta" :title="platformTitle(u)">{{ platformLabel(u) }} · {{ u.type }} · {{ when(u) }}</span>
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

          <div class="ott-col">
            <div class="sub-head">
              <h3>지금 볼 수 있어요</h3>
              <button v-if="more" type="button" class="all" :aria-expanded="showAll" @click="showAll = !showAll">{{ showAll ? '접기 ↑' : '전체 보기 →' }}</button>
            </div>
            <div class="avail">
              <button v-for="v in available" :key="v.id" type="button" class="tile" @click="openDetail(v)">
                <div class="ph poster" :style="bg(v.poster)"><span v-if="!v.poster" class="ph-label">poster</span></div>
                <span class="t14 b6">{{ v.title }}</span>
                <span class="meta small" :title="platformTitle(v)">{{ platformLabel(v) }} · {{ v.type }}</span>
              </button>
            </div>
            <p v-if="!available.length" class="empty">조건에 맞는 작품이 없어요.</p>
          </div>
        </div>
      </section>

      <section id="theater" aria-labelledby="theater-h">
        <div class="sec-head">
          <h2 id="theater-h" class="h2">극장</h2>
          <Seg v-model="theaterTab" :options="[['now', '상영중'], ['soon', '개봉예정']]" label="극장 구분" />
        </div>
        <div class="movies">
          <button v-for="mv in movies" :key="mv.id" type="button" class="tile" @click="openDetail(mv)">
            <div class="ph poster" :style="bg(mv.poster)">
              <span v-if="!mv.poster" class="ph-label">poster</span>
              <span class="badge" :class="{ soon: theaterTab === 'soon' }">{{ theaterTab === 'now' ? '상영중' : dday(mv) }}</span>
            </div>
            <div class="col3">
              <span class="mtitle">{{ mv.title }}</span>
              <span class="meta">{{ mv.genre }} · {{ mv.date ? md(mv.date) : when(mv) }} 개봉</span>
            </div>
          </button>
        </div>
        <p v-if="!movies.length" class="empty">표시할 영화가 없어요.</p>
      </section>
    </main>

    <footer>
      <div class="wrap foot">
        <p>극장 정보: 영화진흥위원회 KOBIS · 작품 정보·이미지: TMDB · 스트리밍 제공 정보: JustWatch</p>
        <p>OTT 공개 예정일은 뉴스 기사를 바탕으로 정리했으며 실제와 다를 수 있습니다.</p>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.wrap { max-width: 1240px; margin: 0 auto; padding: 0 32px; }
.top { position: sticky; top: 0; z-index: 5; background: var(--bg); border-bottom: 1px solid var(--line-soft); }
.head { min-height: 68px; display: flex; flex-wrap: wrap; align-items: center; gap: 0 40px; }
.logo { font-size: 22px; }
nav { display: flex; gap: 28px; flex-wrap: wrap; }
nav a { padding: 16px 0; font-size: 15px; font-weight: 600; text-decoration: none; color: var(--mute); }
nav a[aria-current='true'] { color: var(--text); }
.search { flex: 1 1 200px; display: flex; justify-content: flex-end; align-items: center; gap: 12px; min-width: 0; }
.search input { width: 100%; max-width: 260px; height: 44px; padding: 0 16px; border-radius: 10px; border: 1px solid var(--line); background: var(--surf); color: var(--text); font: inherit; font-size: 14px; }
.search input::placeholder { color: var(--mute); }

main.wrap { padding-top: 48px; padding-bottom: 96px; display: flex; flex-direction: column; gap: 96px; }
section { display: flex; flex-direction: column; gap: 28px; scroll-margin-top: 84px; }
#cal { gap: 24px; }
.sec-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
.sec-head.end { align-items: flex-end; }
.sec-head.base { align-items: baseline; gap: 8px; }
.col3, .col4, .col8, .col10, .col12 { display: flex; flex-direction: column; min-width: 0; }
.col3 { gap: 3px; } .col4 { gap: 4px; } .col8 { gap: 8px; } .col10 { gap: 10px; } .col12 { gap: 12px; }
.date { font-size: 14px; font-weight: 600; color: var(--accent); }
h1 { font-size: clamp(34px, 5vw, 56px); font-weight: 800; letter-spacing: -1.5px; line-height: 1.1; }
.h2 { font-size: 32px; font-weight: 800; letter-spacing: -1px; }
h3 { font-size: 20px; font-weight: 700; }
.meta { font-size: 13px; color: var(--mute); }
.meta.small { font-size: 12px; margin-top: -4px; }
.t14 { font-size: 14px; }
.b6 { font-weight: 600; }

.hot { display: flex; flex-wrap: wrap; gap: 20px; }
.lead { flex: 2 1 560px; min-width: 0; aspect-ratio: 16/10; }
.lead-info { position: absolute; left: 28px; right: 28px; bottom: 26px; }
.why.on-image { color: var(--accent); font-size: 14px; }
.lead-meta { font-size: 14px; color: var(--sub); }
.lead-title { font-size: clamp(28px, 3.4vw, 44px); font-weight: 800; letter-spacing: -1px; line-height: 1.15; }
.hot-list { flex: 1 1 320px; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
.hot-item { display: flex; gap: 16px; padding: 14px; }
.hot-item > .ph { flex: 0 0 84px; aspect-ratio: 2/3; }
.hot-body { flex: 1; justify-content: center; }
.hot-title { font-size: 18px; font-weight: 700; letter-spacing: -0.3px; line-height: 1.3; }

.tools { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.years { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
.year-name { font-size: 15px; font-weight: 600; }
.year-count { font-size: 40px; font-weight: 800; letter-spacing: -1px; line-height: 1; }
.year-count small { font-size: 14px; font-weight: 500; color: var(--mute); margin-left: 6px; }
.grid7 { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; }
.dow { padding: 0 10px; font-size: 13px; font-weight: 600; }
.mcell { display: flex; flex-direction: column; gap: 4px; min-height: 112px; padding: 10px; min-width: 0; border-radius: 12px; background: var(--surf); }
.mcell.blank { background: var(--blank); }
.num { font-size: 14px; font-weight: 700; }
.mitem { display: block; width: 100%; padding: 0; background: none; font-size: 12px; line-height: 1.5; text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.more { font-size: 12px; color: var(--mute); }
.wcell { display: flex; flex-direction: column; gap: 10px; min-height: 200px; padding: 14px 10px; min-width: 0; border-radius: 14px; background: var(--surf); }
.wtop { display: flex; align-items: baseline; gap: 8px; }
.wnum { font-size: 22px; font-weight: 800; }
.wdow { font-size: 13px; font-weight: 600; }
.witem { display: flex; flex-direction: column; gap: 2px; padding: 10px; border-radius: 8px; background: var(--surf2); text-decoration: none; font-size: 12px; }
.witem b { font-size: 14px; font-weight: 600; }

.ott { display: flex; flex-wrap: wrap; gap: 48px; align-items: flex-start; }
.ott-col { flex: 1 1 440px; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
.sub-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px; }
.ups { display: flex; flex-direction: column; gap: 8px; }
.up { display: flex; gap: 16px; align-items: center; padding: 12px 16px 12px 12px; }
.up > .ph { flex: 0 0 56px; aspect-ratio: 2/3; }
.up-body { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.up-title { font-size: 16px; font-weight: 700; }
.up-side { flex: 0 0 auto; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.up-side .src { padding: 8px 0; }
.dday { font-size: 18px; font-weight: 800; color: var(--accent); }
.all { font-size: 13px; color: var(--mute); padding: 8px 0; border: 0; background: none; }
.all:hover { color: var(--accent); }
.avail { display: grid; grid-template-columns: repeat(auto-fill, minmax(124px, 1fr)); gap: 20px 12px; }
.avail .tile { gap: 8px; }
.avail .poster { border-radius: 10px; padding: 8px; }
.movies { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 28px 18px; }
.movies .tile { gap: 12px; }
.mtitle { font-size: 16px; font-weight: 700; }

footer { border-top: 1px solid var(--line-soft); }
.foot { padding-top: 32px; padding-bottom: 32px; display: flex; flex-direction: column; gap: 6px; font-size: 13px; line-height: 1.6; color: var(--mute); }
</style>
