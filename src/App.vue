<script setup lang="ts">
import { ref } from 'vue'
import { BRAND } from './brand'
import { home, loadError, loadHome, refresh, refreshMsg, refreshing } from './lib/home'
import HomeDesktop from './components/desktop/HomeDesktop.vue'
import HomeMobile from './components/mobile/HomeMobile.vue'
import WorkDetail from './components/shared/WorkDetail.vue'

// 767px 이하는 모바일 시안
const mq = matchMedia('(max-width: 767px)')
const mobile = ref(mq.matches)
mq.addEventListener('change', (e) => (mobile.value = e.matches))

loadHome()
</script>

<template>
  <!-- 불러오는 중: 실제 화면과 같은 모양의 자리표시(배너 + 카드). 글은 화면 읽기 프로그램용 -->
  <div v-if="!home && !loadError" class="boot" :class="{ mobile }" role="status" aria-live="polite">
    <header class="boot-head">
      <span class="logo">{{ BRAND }}<span class="accent">.</span></span>
      <span class="sk sk-search"></span>
    </header>
    <main class="boot-main">
      <span class="sk sk-date"></span>
      <span class="sk sk-title"></span>
      <div class="boot-chips"><span v-for="i in 5" :key="i" class="sk sk-chip"></span></div>
      <div class="boot-hot">
        <div class="sk sk-hero"></div>
        <div class="boot-list">
          <div v-for="i in 3" :key="i" class="boot-row">
            <span class="sk sk-poster"></span>
            <span class="boot-lines"><span class="sk sk-l1"></span><span class="sk sk-l2"></span><span class="sk sk-l3"></span></span>
          </div>
        </div>
      </div>
      <p class="boot-msg">곧 공개될 작품을 불러오고 있어요</p>
    </main>
  </div>

  <div v-else-if="!home" class="state" role="alert">
    <span class="logo">{{ BRAND }}<span class="accent">.</span></span>
    <template v-if="loadError === 'empty'">
      <h1>아직 모은 작품 정보가 없어요</h1>
      <p>처음 한 번은 기사와 작품 정보를 모아야 해요. 1~2분 걸려요.</p>
      <button type="button" class="text-btn" :disabled="refreshing" @click="refresh">{{ refreshing ? '모으는 중…' : '지금 모으기' }}</button>
    </template>
    <template v-else>
      <h1>정보를 불러오지 못했어요</h1>
      <p>잠시 후 다시 시도해 주세요.</p>
      <button type="button" class="text-btn" @click="loadHome">다시 시도</button>
    </template>
    <p v-if="refreshMsg" class="muted">{{ refreshMsg }}</p>
  </div>
  <HomeMobile v-else-if="mobile" :data="home" />
  <HomeDesktop v-else :data="home" />
  <WorkDetail />
</template>

<style scoped>
/* ---- 불러오는 중 ---- */
.boot { min-height: 100vh; animation: fadein 0.3s var(--ease) both; }
@keyframes fadein { from { opacity: 0; } }
.boot-head { max-width: 1240px; margin: 0 auto; padding: 0 32px; min-height: 68px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--line-soft); }
.boot-head .logo { font-size: 22px; }
.boot-main { max-width: 1240px; margin: 0 auto; padding: 48px 32px; display: flex; flex-direction: column; gap: 16px; }
.boot-chips { display: flex; gap: 8px; margin: 8px 0 12px; }
.boot-hot { display: flex; gap: 20px; }
.boot-list { flex: 1 1 320px; display: flex; flex-direction: column; gap: 12px; }
.boot-row { display: flex; gap: 16px; padding: 14px; border-radius: 14px; background: var(--surf); }
.boot-lines { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 10px; }
.boot-msg { margin-top: 8px; font-size: 14px; color: var(--mute); }

/* 자리표시 조각: 줄무늬 위로 빛이 천천히 지나간다 */
.sk { position: relative; display: block; overflow: hidden; border-radius: 8px; background: var(--surf); }
.sk::after { content: ''; position: absolute; inset: 0; background: linear-gradient(100deg, transparent 20%, rgba(255, 255, 255, 0.05) 50%, transparent 80%); transform: translateX(-100%); animation: sweep 1.6s var(--ease) infinite; }
@keyframes sweep { to { transform: translateX(100%); } }
.boot-row .sk, .sk-poster { background: var(--surf2); }
.sk-search { width: 260px; height: 44px; border-radius: 10px; }
.sk-date { width: 120px; height: 16px; }
.sk-title { width: min(520px, 80%); height: 56px; border-radius: 10px; }
.sk-chip { width: 84px; height: 44px; border-radius: 22px; }
.sk-hero { flex: 2 1 560px; aspect-ratio: 16/10; border-radius: 16px; background: var(--stripe-lg); }
.sk-poster { flex: 0 0 84px; aspect-ratio: 2/3; }
.sk-l1 { width: 40px; height: 12px; }
.sk-l2 { width: 70%; height: 18px; }
.sk-l3 { width: 50%; height: 12px; }

/* 모바일: 세로 배너 + 아래 목록 */
.boot.mobile .boot-head { padding: 0 20px; min-height: 56px; border-bottom: 0; }
.boot.mobile .boot-head .logo { font-size: 20px; }
.boot.mobile .sk-search { width: 44px; border-radius: 12px; }
.boot.mobile .boot-main { padding: 8px 20px 32px; }
.boot.mobile .sk-title { height: 36px; }
.boot.mobile .boot-chips { overflow: hidden; }
.boot.mobile .sk-chip { flex: 0 0 72px; }
.boot.mobile .boot-hot { flex-direction: column; }
.boot.mobile .sk-hero { flex: none; aspect-ratio: 4/5; }
.boot.mobile .boot-list { flex: none; }
.boot.mobile .sk-poster { flex-basis: 76px; }

/* ---- 오류·빈 상태 ---- */
.state { max-width: 480px; margin: 18vh auto 0; padding: 0 20px; display: flex; flex-direction: column; align-items: flex-start; gap: 12px; }
.state .logo { font-size: 22px; margin-bottom: 20px; }
.state h1 { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
.state p { color: var(--sub); font-size: 15px; line-height: 1.6; }
.state .muted { color: var(--mute); font-size: 13px; }
</style>
