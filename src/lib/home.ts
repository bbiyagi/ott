import { computed, ref } from 'vue'
import { mock, type HomeData, type Work } from '../data/mock'
import { TODAY, fmt, parse } from './date'

export type HotMode = 'soon' | 'now'

export const home = ref<HomeData | null>(null)
/** empty = 서버는 있지만 아직 모은 정보가 없음(503), error = 서버에 닿지 못함 */
export const loadError = ref<'' | 'empty' | 'error'>('')

export async function loadHome() {
  try {
    const r = await fetch('/api/home')
    if (r.status === 503) return fail('empty')
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    home.value = await r.json()
    loadError.value = ''
  } catch {
    fail('error')
  }
}

function fail(kind: 'empty' | 'error') {
  // 시안 예시 데이터는 개발할 때만. 배포 화면에 "[드라마 제목]" 같은 가짜 데이터가 뜨면 고장처럼 보인다
  if (import.meta.env.DEV) home.value = mock()
  else loadError.value = kind
}

/** 마지막 업데이트가 하루 넘게 지났는지 (예약 수집이 멈췄다는 신호) */
export const isStale = (iso?: string) => !!iso && Date.now() - Date.parse(iso) > 864e5

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
export const hotWhy = (w: Work, mode: HotMode, platform = '전체') =>
  mode === 'now'
    ? w.rank ?? ''
    : `${platform === '전체' ? platformLabel(w) : platform} ${w.type} 기대작${w.buzz ? ` · 기사 ${w.buzz}건` : ''}` // 플랫폼을 고르면 그 이름으로
/** 티빙 +1 · 드라마 · 10.14 (수) */
export const hotMeta = (w: Work, mode: HotMode) => [platformLabel(w), w.type, mode === 'soon' ? when(w) : ''].filter(Boolean).join(' · ')

export const bg = (url?: string) => (url ? { background: `center/cover no-repeat url("${url}")` } : undefined)

export const PLATFORMS = ['전체', '넷플릭스', '티빙', '디즈니+', '쿠팡플레이']
export const CATS = ['전체', '영화', '드라마', '예능', '애니메이션']

const onPlatform = (w: Work, p: string) => p === '전체' || (w.platforms ?? [w.platform]).includes(p)

/** 메인 기대작: 공개 예정/지금 인기 × 플랫폼, 10개 (배너 1 + 목록 3 + 포스터 6) */
export function useHot(data: () => HomeData) {
  const mode = ref<HotMode>('soon'), platform = ref('전체')
  // 공개 예정: 기사 수로 기대작 10개를 고른 뒤 D-day가 가까운 순으로 보여 준다
  const list = computed(() => {
    const top = data().hot[mode.value].filter((w) => onPlatform(w, platform.value)).slice(0, 10)
    return mode.value === 'soon' ? top.sort(byDate) : top
  })
  const title = computed(() => {
    const p = platform.value === '전체' ? '' : `${platform.value} `
    return mode.value === 'soon' ? `곧 공개되는 ${p}기대작` : `지금 인기 있는 ${p}작품`
  })
  return { mode, platform, list, title }
}

// ---- 검색: 이미 받아 둔 데이터에서 찾는다 (서버 호출 없음) ----
const norm = (s: string) => s.replace(/시즌|season/gi, '').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase()
export type HitKind = '공개 예정' | '지금 볼 수 있어요' | '극장 상영중' | '극장 개봉예정'
export interface Hit { w: Work; kind: HitKind }

/** 작품명에 검색어가 들어간 작품 (공백·문장부호 무시). 앞부분이 맞는 것 먼저, 최대 8개 */
export function search(d: HomeData, q: string): Hit[] {
  const n = norm(q)
  if (!n) return []
  const pools: [HitKind, Work[]][] = [
    ['공개 예정', d.ott.upcoming], ['지금 볼 수 있어요', d.ott.available], ['극장 상영중', d.theater.now], ['극장 개봉예정', d.theater.soon],
  ]
  const seen = new Set<string>()
  const hits: Hit[] = []
  for (const [kind, list] of pools) {
    for (const w of list) {
      const t = norm(w.title)
      if (!t.includes(n) || seen.has(t)) continue
      seen.add(t)
      hits.push({ w, kind })
    }
  }
  return hits.sort((a, b) => Number(norm(b.w.title).startsWith(n)) - Number(norm(a.w.title).startsWith(n))).slice(0, 8)
}

export function useOtt(data: () => HomeData) {
  const platform = ref('전체'), cat = ref('전체'), showAll = ref(false), showAllUp = ref(false)
  const ok = (w: Work) => onPlatform(w, platform.value) && (cat.value === '전체' || w.type === cat.value)
  // 공개 예정은 6개까지 (오른쪽 포스터 3줄과 높이가 비슷하게), 나머지는 "더 보기"
  const allUpcoming = computed(() => data().ott.upcoming.filter(ok).sort(byDate))
  const upcoming = computed(() => (showAllUp.value ? allUpcoming.value : allUpcoming.value.slice(0, 6)))
  const moreUp = computed(() => allUpcoming.value.length - 6)
  const allAvailable = computed(() => data().ott.available.filter(ok))
  const available = computed(() => (showAll.value ? allAvailable.value : allAvailable.value.slice(0, 12)))
  const more = computed(() => allAvailable.value.length > 12) // "전체 보기"가 필요한지
  const total = computed(() => allUpcoming.value.length + allAvailable.value.length)
  return { platform, cat, upcoming, available, showAll, more, showAllUp, moreUp, total }
}
