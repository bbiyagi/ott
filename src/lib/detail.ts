import { ref } from 'vue'
import type { CalEvent, Work, WorkDetail } from '../data/mock'

// 작품 상세 창. 목록에 있던 정보로 바로 열고, 줄거리·출처 기사는 서버에서 받아 채운다
export const detail = ref<(WorkDetail & { loading?: boolean }) | null>(null)
let seq = 0

export async function openDetail(w: Work | CalEvent) {
  const n = ++seq
  detail.value = { ...(w as Work), sources: [], loading: true }
  try {
    const r = await fetch(`/api/works/${encodeURIComponent(w.id)}`)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const d: WorkDetail = await r.json()
    const platforms = (d.platforms?.length ?? 0) >= (w.platforms?.length ?? 0) ? d.platforms : w.platforms
    if (n === seq) detail.value = { ...detail.value!, ...d, platforms, loading: false }
  } catch {
    if (n === seq && detail.value) detail.value = { ...detail.value, loading: false } // 서버가 없으면 목록 정보만
  }
}

export function closeDetail() {
  seq++
  detail.value = null
}

// 플랫폼 바로가기. 넷플릭스·쿠팡플레이는 로그인 뒤 검색 결과로 가고, 티빙은 바로 검색된다.
// 디즈니+는 로그인 없이 쓸 수 있는 검색 주소가 없어 홈으로 연다 (2026-10 확인)
const WATCH: Record<string, { label: string; url: (q: string) => string }> = {
  넷플릭스: { label: '넷플릭스에서 보기', url: (q) => `https://www.netflix.com/search?q=${q}` },
  티빙: { label: '티빙에서 보기', url: (q) => `https://www.tving.com/search?keyword=${q}` },
  쿠팡플레이: { label: '쿠팡플레이에서 보기', url: (q) => `https://www.coupangplay.com/search?keyword=${q}` },
  '디즈니+': { label: '디즈니+ 열기', url: () => 'https://www.disneyplus.com/ko-kr' },
}

export const watchLinks = (w: { title: string; platform: string; platforms?: string[] }) =>
  (w.platforms ?? [w.platform]).filter((p) => WATCH[p]).map((p) => ({ label: WATCH[p].label, url: WATCH[p].url(encodeURIComponent(w.title)) }))
