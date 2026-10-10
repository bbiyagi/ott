import { Injectable } from '@nestjs/common'
import type { Article } from './naver-news.service.js'

// 기사 제목·요약에서 규칙으로 작품명·플랫폼·구분·공개일을 뽑는다 (AI·유료 API 없음).
// ponytail: 문장 규칙이라 놓치거나 잘못 뽑는 기사가 있다. 같은 작품을 다룬 기사가 여러 개라
// 병합 단계에서 대부분 보정된다. 정확도가 모자라면 이 파일만 바꾸면 된다.

export const PLATFORMS = ['넷플릭스', '티빙', '디즈니+', '쿠팡플레이'] as const
export type Platform = (typeof PLATFORMS)[number]

export interface ExtractedWork {
  article: number
  title: string
  platform: Platform
  type: string
  date: string | null
  dateText: string | null
}

const PLATFORM_RE: [Platform, RegExp][] = [
  ['넷플릭스', /넷플릭스|netflix/i],
  ['티빙', /티빙|tving/i],
  ['디즈니+', /디즈니\s*(\+|플러스)|disney\s*\+/i],
  ['쿠팡플레이', /쿠팡\s*플레이|쿠플/],
]
const RELEASE = /공개|첫\s*방송|첫방|선보인|스트리밍|출격/
// 이미 공개된 작품·순위 기사
const PAST = /지난|공개된(?!다)|공개했|공개 이후|공개 후|선공개|순위|1위/
// 작품명은 홑따옴표·꺾쇠로 쓰는 관례. 겹따옴표는 대사라 뺀다
const QUOTE = /[‘'〈<《「]([^’'〉>》」\n]{2,40})[’'〉>》」]/g
const SPEECH = /[다요까죠!?]$/

const pad = (n: number) => String(n).padStart(2, '0')
const kstDate = (iso: string) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const addDays = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }

const platformsIn = (s: string) => PLATFORM_RE.filter(([, re]) => re.test(s)).map(([p]) => p)
// 작품명이 아닌 것: 일반 명사, 플랫폼 이름이 든 문구, 3글자 이하 영문 약어(HBO 등)
const GENERIC = /^(애니|드라마|예능|영화|시리즈|오리지널|신작|작품)$/
const isTitle = (t: string) => t.length >= 2 && !SPEECH.test(t) && !GENERIC.test(t) && !platformsIn(t).length && !/^[A-Z]{1,3}$/.test(t)
// "필승 원더독스(이하 원더독스)", "나의 작품(가제)" → 괄호 부분 제거
const titlesIn = (s: string) => [...s.matchAll(QUOTE)].map((m) => m[1].replace(/\s*\([^)]*\)\s*$/, '').trim()).filter(isTitle)
const sentences = (t: string) => t.split(/(?<=[.!?])\s+|…|\.{3}/).map((s) => s.trim()).filter(Boolean)

function typeIn(text: string) {
  if (/예능|리얼리티|버라이어티|서바이벌/.test(text)) return '예능'
  if (/애니메이션|애니(?![가-힣])/.test(text)) return '애니메이션'
  if (/드라마|시리즈/.test(text)) return '드라마'
  if (/영화(?!제)/.test(text)) return '영화'
  return null
}

/** 문장 속 날짜 중 기사 날짜 이후(오늘 공개는 당일 포함), 180일 안의 첫 날짜 */
export function pickDate(s: string, pub: string): string | null {
  const [py, pm, pd] = pub.split('-').map(Number)
  const today = /오늘/.test(s)
  for (const m of s.matchAll(/(?:(\d{4})년\s*)?(?:(\d{1,2})월|(다음\s*달|내달))?\s*(\d{1,2})일(?!간|째|동안)/g)) {
    const day = Number(m[4])
    let y = m[1] ? Number(m[1]) : py
    let mon = m[2] ? Number(m[2]) : m[3] ? pm + 1 : pm
    if (!m[2] && !m[3] && day < pd - 7) mon++ // "오는 3일"을 28일에 쓴 경우
    if (!m[1] && m[2] && mon < pm - 1) y++ // "1월 5일"을 12월에 쓴 경우
    if (mon > 12) { mon -= 12; y++ }
    const d = `${y}-${pad(mon)}-${pad(day)}`
    if (day < 1 || day > 31 || Number.isNaN(Date.parse(d))) continue
    if ((d > pub || (today && d === pub)) && d <= addDays(pub, 180)) return d
  }
  return null
}

/** "11월 중", "하반기", "4분기"처럼 날짜가 애매한 표현 (올해 것만) */
export function vague(s: string, pub: string): string | null {
  if (/내년/.test(s)) return null
  const pm = Number(pub.slice(5, 7))
  const m = s.match(/(\d{1,2})월\s*(중순|초|말|중)?(?!\s*\d)/)
  if (m && Number(m[1]) >= pm) return `${Number(m[1])}월 ${m[2] ?? '중'}`
  return s.match(/상반기|하반기|연내|[1-4]분기/)?.[0] ?? null
}

export function extract(articles: Article[]): ExtractedWork[] {
  const out: ExtractedWork[] = []
  articles.forEach((a, i) => {
    const pub = kstDate(a.pubDate)
    const all = `${a.title}. ${a.description}`
    const articlePlatforms = platformsIn(all)
    // 요약 문장에 작품명이 없으면 제목의 작품명을 쓴다. 제목이 공개 소식일 때만
    const headTitle = platformsIn(a.title).length || RELEASE.test(a.title) ? titlesIn(a.title)[0] : undefined
    const articleType = typeIn(a.title) ?? typeIn(all) ?? '드라마'
    const found = new Map<string, ExtractedWork>()
    for (const s of sentences(all)) {
      if (!RELEASE.test(s) || PAST.test(s)) continue
      const platform = platformsIn(s)[0] ?? (articlePlatforms.length === 1 ? articlePlatforms[0] : undefined)
      const title = titlesIn(s)[0] ?? headTitle
      if (!platform || !title) continue
      const date = pickDate(s, pub)
      const dateText = date ? null : vague(s, pub)
      if (!date && !dateText) continue
      const key = `${title}|${platform}`
      if (found.get(key)?.date) continue // 정확한 날짜를 먼저 찾았으면 유지
      // 구분은 그 문장 → 기사 제목 → 기사 전체 순. TMDB에서 찾으면 다시 보정된다
      found.set(key, { article: i, title, platform, type: typeIn(s) ?? articleType, date, dateText })
    }
    out.push(...found.values())
  })
  return out
}

@Injectable()
export class ExtractService {
  async run(articles: Article[]): Promise<ExtractedWork[]> {
    return extract(articles)
  }
}
