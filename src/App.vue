<script setup lang="ts">
import { ref } from 'vue'
import { home, loadHome } from './lib/home'
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
  <p v-if="!home" class="loading">불러오는 중…</p>
  <HomeMobile v-else-if="mobile" :data="home" />
  <HomeDesktop v-else :data="home" />
  <WorkDetail />
</template>
