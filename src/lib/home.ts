import { computed, reactive, ref } from 'vue'
import { mock, type HomeData, type Work } from '../data/mock'
import { TODAY, fmt, md, parse } from './date'

export type HotMode = 'soon' | 'now'

export const home = ref<HomeData | null>(null)
const fromServer = ref(false)

export async function loadHome() {
  try {
    const r = await fetch('/api/home')
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    home.value = await r.json()
    fromServer.value = true
  } catch {
    home.value = mock() // 서버가 꺼져 있거나 수집 전이면 시안 예시 데이터
  }
}

// 기대돼요/추천해요: 누른 상태는 브라우저에, 숫자는 서버에
const KEY = 'nextscene.liked'
const saved = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] } }
export const liked = reactive(new Set<string>(saved()))
const counts = reactive(new Map<string, number>())
export const likeCount = (w: Work) => counts.get(w.id) ?? w.likes ?? 0

export async function toggleLike(w: Work) {
  const on = !liked.has(w.id)
  if (on) liked.add(w.id)
  else liked.delete(w.id)
  try { localStorage.setItem(KEY, JSON.stringify([...liked])) } catch { /* 저장 못 해도 화면은 동작 */ }
  counts.set(w.id, Math.max(0, likeCount(w) + (on ? 1 : -1)))
  if (!fromServer.value) return
  try {
    const r = await fetch(`/api/likes/${encodeURIComponent(w.id)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on }),
    })
    if (r.ok) counts.set(w.id, (await r.json()).likes)
  } catch { /* 숫자는 다음 새로고침 때 맞춰진다 */ }
}

export const dday = (w: Work) => {
  if (!w.date) return '예정'
  const n = Math.round((parse(w.date).getTime() - TODAY.getTime()) / 864e5)
  return n === 0 ? 'D-DAY' : n > 0 ? `D-${n}` : `D+${-n}`
}
export const when = (w: Work) => (w.date ? fmt(w.date) : w.dateText ?? '미정')
// 날짜 있는 작품 먼저, "10월 중" 같은 작품은 맨 뒤
export const byDate = (a: Work, b: Work) => (a.date ?? '9999').localeCompare(b.date ?? '9999')

export const hotTag = (w: Work, mode: HotMode) => (mode === 'now' ? w.rank ?? '' : dday(w))
const hotDate = (w: Work, mode: HotMode) =>
  mode === 'soon' ? when(w) : w.date ? `${md(w.date)} ${w.platform === '극장' ? '개봉' : '공개'}` : ''
/** 티빙 · 드라마 · 10.14 (수) */
export const hotMeta = (w: Work, mode: HotMode) => [w.platform, w.type, hotDate(w, mode)].filter(Boolean).join(' · ')

export const bg = (url?: string) => (url ? { background: `center/cover no-repeat url("${url}")` } : undefined)

export const PLATFORMS = ['전체', '넷플릭스', '티빙', '디즈니+', '쿠팡플레이', '웨이브']
export const CATS = ['전체', '영화', '드라마', '예능', '애니메이션']

export function useOtt(data: () => HomeData) {
  const platform = ref('전체'), cat = ref('전체')
  const ok = (w: Work) => (platform.value === '전체' || w.platform === platform.value) && (cat.value === '전체' || w.type === cat.value)
  const upcoming = computed(() => data().ott.upcoming.filter(ok).sort(byDate))
  const available = computed(() => data().ott.available.filter(ok))
  return { platform, cat, upcoming, available }
}
