<script setup lang="ts">
import { ref } from 'vue'
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
  <p v-if="!home && !loadError" class="loading">불러오는 중…</p>
  <div v-else-if="!home" class="state" role="alert">
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
.state { max-width: 480px; margin: 20vh auto 0; padding: 0 20px; display: flex; flex-direction: column; align-items: flex-start; gap: 12px; }
.state h1 { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
.state p { color: var(--sub); font-size: 15px; line-height: 1.6; }
.state .muted { color: var(--mute); font-size: 13px; }
</style>
