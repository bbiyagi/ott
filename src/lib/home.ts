import { computed, ref } from 'vue'
import { mock, type HomeData, type Work } from '../data/mock'
import { TODAY, fmt, parse } from './date'

export type HotMode = 'soon' | 'now'

export const home = ref<HomeData | null>(null)

export async function loadHome() {
  try {
    const r = await fetch('/api/home')
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    home.value = await r.json()
  } catch {
    home.value = mock() // 서버가 꺼져 있거나 수집 전이면 시안 예시 데이터
  }
}

// 새로고침 버튼: 서버가 기사·TMDB·KOBIS를 다시 불러온 뒤(1~2분) 화면 데이터를 다시 받는다
export const refreshing = ref(false)
export const refreshMsg = ref('')
export async function refresh() {
  refreshing.value = true
  refreshMsg.value = ''
  try {
    const r = await fetch('/api/refresh', { method: 'POST' })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const j: { waitMinutes?: number; newWorks?: number; skipped?: string[] } = await r.json()
    if (j.waitMinutes) refreshMsg.value = `방금 업데이트했어요. ${j.waitMinutes}분 뒤에 다시 할 수 있어요`
    else refreshMsg.value = `업데이트 완료 · 새 작품 ${j.newWorks ?? 0}개` + (j.skipped?.length ? ` · 일부 실패 ${j.skipped.length}건` : '')
    await loadHome()
  } catch {
    refreshMsg.value = '서버에 연결하지 못했어요'
  } finally {
    refreshing.value = false
  }
}

/** 10.10 22:55 업데이트 */
export const updatedLabel = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} 업데이트`
}

export const dday = (w: Work) => {
  if (!w.date) return '예정'
  const n = Math.round((parse(w.date).getTime() - TODAY.getTime()) / 864e5)
  return n === 0 ? 'D-DAY' : n > 0 ? `D-${n}` : `D+${-n}`
}
export const when = (w: Work) => (w.date ? fmt(w.date) : w.dateText ?? '미정')
// 날짜 있는 작품 먼저, "10월 중" 같은 작품은 맨 뒤
export const byDate = (a: Work, b: Work) => (a.date ?? '9999').localeCompare(b.date ?? '9999')

/** 같은 작품이 여러 플랫폼에 있으면 "넷플릭스 +2" */
export const platformLabel = (w: { platform: string; platforms?: string[] }) =>
  (w.platforms?.length ?? 1) > 1 ? `${w.platform} +${w.platforms!.length - 1}` : w.platform
/** 마우스를 올리면 보이는 전체 플랫폼 */
export const platformTitle = (w: { platform: string; platforms?: string[] }) => (w.platforms ?? [w.platform]).join(', ')
export const NEWS_NOTE = '기사에서 모은 날짜라 정확하지 않을 수 있어요'

/** 배너 뱃지: 공개 예정은 D-day, 지금 인기는 "인기 1위" */
export const hotTag = (w: Work, mode: HotMode) => (mode === 'now' ? w.rank?.match(/인기 \d+위$/)?.[0] ?? '' : dday(w))
/** 왜 여기 있는지: "티빙 드라마 기대작 · 기사 9건" / "넷플릭스 예능 인기 1위" */
export const hotWhy = (w: Work, mode: HotMode) =>
  mode === 'now' ? w.rank ?? '' : `${platformLabel(w)} ${w.type} 기대작${w.buzz ? ` · 기사 ${w.buzz}건` : ''}`
/** 티빙 +1 · 드라마 · 10.14 (수) */
export const hotMeta = (w: Work, mode: HotMode) => [platformLabel(w), w.type, mode === 'soon' ? when(w) : ''].filter(Boolean).join(' · ')

export const bg = (url?: string) => (url ? { background: `center/cover no-repeat url("${url}")` } : undefined)

export const PLATFORMS = ['전체', '넷플릭스', '티빙', '디즈니+', '쿠팡플레이']
export const CATS = ['전체', '영화', '드라마', '예능', '애니메이션']

export function useOtt(data: () => HomeData) {
  const platform = ref('전체'), cat = ref('전체'), showAll = ref(false)
  const ok = (w: Work) =>
    (platform.value === '전체' || (w.platforms ?? [w.platform]).includes(platform.value)) && (cat.value === '전체' || w.type === cat.value)
  const upcoming = computed(() => data().ott.upcoming.filter(ok).sort(byDate))
  const allAvailable = computed(() => data().ott.available.filter(ok))
  const available = computed(() => (showAll.value ? allAvailable.value : allAvailable.value.slice(0, 12)))
  const more = computed(() => allAvailable.value.length > 12) // "전체 보기"가 필요한지
  return { platform, cat, upcoming, available, showAll, more }
}
