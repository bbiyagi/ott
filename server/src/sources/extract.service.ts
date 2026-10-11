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
  time?: string // 'HH:MM' (KST). 기사에 날짜 바로 뒤 시각이 적혀 있을 때만
  after?: string // TV 방송 채널: TV와 OTT에 함께 나오는 작품. "MBC 방송 후 공개" (방송 시각은 OTT 시각이 아니라 버린다)
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
const isTitle = (t: string) => t.length >= 2 && !SPEECH.test(t) && !GENERIC.test(t) && !platformsIn(t).length && !/^[A-Z]{1,3}$/.test(t) && !/^\d+$/.test(t)
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

// "오후 5시", "밤 10시 50분", "17시". 접두어 없는 12시 이하는 오전·오후를 알 수 없어 버린다
const TIME = String.raw`\)?\s*(?:\([^)]*\)\s*)?(?:[월화수목금토일]요일\s*)?(?:(오전|오후|낮|저녁|밤|새벽)\s*)?(\d{1,2})시(?:\s*(\d{1,2})분|\s*반)?`
// OTT 공개 일정만 쓴다. TV 방송 기준 문장("방송"·"전파", TV 채널 이름)의 날짜·시각은 버리고,
// 매주 일정은 "MBC 오후 9시 10분 방송 후 공개"로 방송 기준임을 밝혀 쓴다.
// "방송"은 OTT 오리지널도 가끔 쓰지만, 기사 요약은 검색어마다 잘려 채널 이름이 빠지기도 해서 모두 TV로 본다 (정확도 우선)
const CHANNEL = /tvN|JTBC|SBS|KBS|MBC|ENA|MBN|Mnet|EBS|E채널|채널A|TV조선|라이프타임/i
const tvTime = (s: string) => CHANNEL.test(s) || /방송|전파/.test(s)
// 순위·시청률 기사 문장 ("넷플릭스 톱10은 매주 수요일 순위를 공개")은 작품 일정이 아니다
const RANKING = /톱\s*10|TOP\s*10|순위|집계|시청률|화제성/i
const PM = new Set(['오후', '저녁', '밤'])
export function toTime(ampm: string | undefined, h: number, min = 0): string | undefined {
  if (h > 23 || min > 59) return
  if (!ampm && h <= 12) return
  if (ampm && h > 12) return ampm === '오전' || ampm === '새벽' ? undefined : `${pad(h)}:${pad(min)}`
  if (ampm && PM.has(ampm) && h === 12) return ampm === '밤' ? undefined : '12:00' // 밤 12시는 다음 날이라 애매
  if ((ampm && PM.has(ampm)) || (ampm === '낮' && h < 6)) h += 12
  return `${pad(h % 24)}:${pad(min)}`
}

/** 문장 속 날짜 중 기사 날짜 이후(오늘 공개는 당일 포함), 180일 안의 첫 날짜 */
export function pickDate(s: string, pub: string): string | null {
  return pickWhen(s, pub)?.date ?? null
}

/** pickDate + 날짜 바로 뒤에 적힌 공개 시각 */
export function pickWhen(s: string, pub: string): { date: string; time?: string } | null {
  const [py, pm, pd] = pub.split('-').map(Number)
  const today = /오늘/.test(s)
  const re = new RegExp(String.raw`(?:(\d{4})년\s*)?(?:(\d{1,2})월|(다음\s*달|내달))?\s*(\d{1,2})일(?!간|째|동안)(?:${TIME})?`, 'g')
  for (const m of s.matchAll(re)) {
    const day = Number(m[4])
    let y = m[1] ? Number(m[1]) : py
    let mon = m[2] ? Number(m[2]) : m[3] ? pm + 1 : pm
    if (!m[2] && !m[3] && day < pd - 7) mon++ // "오는 3일"을 28일에 쓴 경우
    if (!m[1] && m[2] && mon < pm - 1) y++ // "1월 5일"을 12월에 쓴 경우
    if (mon > 12) { mon -= 12; y++ }
    const d = `${y}-${pad(mon)}-${pad(day)}`
    if (day < 1 || day > 31 || Number.isNaN(Date.parse(d))) continue
    if ((d > pub || (today && d === pub)) && d <= addDays(pub, 180)) {
      const time = m[6] ? toTime(m[5], Number(m[6]), m[7] ? Number(m[7]) : m[0].endsWith('반') ? 30 : 0) : undefined
      return time ? { date: d, time } : { date: d }
    }
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

// ---- 정기 공개: "매주 토·일요일 오후 9시 10분", "매주 수요일 2회씩" ----
// after = TV 방송 채널: "매주 일 오후 9시 10분 MBC 방송 후 공개" (방송이 끝난 뒤 OTT에 올라오는 작품)
export interface Weekly { days: string; time?: string; per?: number; after?: string }
export interface ExtractedWeekly extends Weekly { title: string; from: string }

const DAY = String.raw`[월화수목금토일](?=요일|[\s,·ㆍ∙~과와및]|$)(?:요일)?`
const WEEKLY = new RegExp(String.raw`매주\s*((?:${DAY}(?:\s*(?:[,·ㆍ∙~]|과|와|및)\s*)?)+)(?:\s*(?:(오전|오후|낮|저녁|밤|새벽)\s*)?(\d{1,2})시(?:\s*(\d{1,2})분|\s*반)?)?`)

/** 문장 하나의 "매주 …" OTT 공개 일정. TV 방송 기준 문장이면 "방송 후 공개"로 (방송 시각을 OTT 공개 시각으로 쓰지 않는다) */
export function weeklyIn(s: string): Weekly | null {
  const m = s.match(WEEKLY)
  if (!m || RANKING.test(s)) return null
  const tv = tvTime(s)
  if (!tv && !/공개|스트리밍|방송/.test(s)) return null // "매주 시청자를 만난다"처럼 어디서인지 모르는 문장
  const days = m[1].replace(/요일/g, '').replace(/\s*(?:[,·ㆍ∙]|과|와|및)\s*|\s+/g, '·').replace(/\s*~\s*/g, '~').replace(/^·+|·+$/g, '')
  const time = m[3] ? toTime(m[2], Number(m[3]), m[4] ? Number(m[4]) : m[0].endsWith('반') ? 30 : 0) : undefined
  const per = Number(s.slice(m.index! + m[0].length).match(/^\s*(\d{1,2})\s*(?:회|편|화)씩/)?.[1]) || undefined
  return { days, ...(time && { time }), ...(per && { per }), ...(tv && { after: s.match(CHANNEL)?.[0] ?? 'TV' }) }
}

/** "매주"에 가장 가까운 작품명: 앞쪽("'X'는 매주") 우선, 없으면 뒤쪽("매주 … 공개되는 'X'") */
export const weeklyTitle = (s: string) => nearestTitle(s, s.indexOf('매주'))

/** 문장 속 위치(at)에 가장 가까운 작품명 */
function nearestTitle(s: string, at: number): string | undefined {
  // 가장 가까운 따옴표가 작품명이 아니면(대사·"영화가 좋다" 같은 프로그램) 더 먼 작품으로 넘어가지 않는다
  const near = [...s.matchAll(QUOTE)].map((m) => ({ i: m.index!, t: m[1].replace(/\s*\([^)]*\)\s*$/, '').trim() }))
  // 뒤쪽 작품은 가까이(40자 안) 있고 사이에 괄호가 닫히지 않을 때만 ("(… 매주 수요일 방송) 〈다른 작품〉" 방지)
  const after = near.find((x) => x.i > at && x.i - at <= 40 && !s.slice(at, x.i).includes(')'))
  const t = (near.filter((x) => x.i < at).at(-1) ?? after)?.t
  return t && isTitle(t) ? t : undefined
}

/** 기사에서 작품별 정기 공개 일정. 작품명은 같은 문장에 있을 때만 (기사 제목의 다른 작품을 붙이지 않게) */
const normT = (t: string) => t.replace(/시즌|season/gi, '').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase()

// 같은 작품: 이름이 같거나 더 긴 이름("닥터X" → "닥터X: 하얀 마피아의 시대"). "신인감독 김연경"(시즌1)은 "신인감독 김연경2"가 아니다
const sameWork = (q: string, n: string) => q.startsWith(n) || (n.startsWith(q) && !/^\d/.test(n.slice(q.length)))

/**
 * 이 문장이 그 작품 이야기인지. 따옴표 작품명이 있으면 at(일정 위치)에 가장 가까운 것이 이 작품일 때만 (다른 작품 일정 방지).
 * 블로그는 작품명을 따옴표로 쓰지 않아 그 문장에 이름이 있으면 그 작품으로 본다 (글 제목만으로는 아님). "루키"처럼 짧은 이름은 따옴표 없이 맞추지 않는다
 */
function about(title: string, s: string, at: number) {
  const n = normT(title)
  if ([...s.matchAll(QUOTE)].length) { const q = nearestTitle(s, at); return !!q && sameWork(normT(q), n) }
  return n.length >= 4 && normT(s).includes(n)
}

/** 작품명으로 찾은 뉴스·블로그(최근 60일)에서 그 작품의 정기 공개 일정 */
export function weeklyFor(title: string, articles: Article[], today = kstDate(new Date().toISOString())): ExtractedWeekly[] {
  const n = normT(title), out: ExtractedWeekly[] = []
  for (const a of articles) {
    if (kstDate(a.pubDate) < addDays(today, -60)) continue // 지난 시즌·바뀐 편성
    const all = `${a.title}. ${a.description}`
    for (const s of sentences(all)) {
      const w = weeklyIn(s)
      if (!w) continue
      if (about(title, s, s.indexOf('매주'))) out.push({ ...w, title, from: kstDate(a.pubDate) })
    }
  }
  return out
}

/**
 * 방송 작품이 그 OTT에도 올라온다고 말하는 글 수: 작품명이 나오는 글에서 "OTT: 넷플릭스", "티빙에서 시청"처럼
 * 플랫폼과 OTT·시청 표현이 한 문장에 있는 글 (블로그 편성 정리 글 포함)
 */
export function ottMentions(title: string, platform: string, articles: Article[]): number {
  const n = normT(title), re = PLATFORM_RE.find(([p]) => p === platform)?.[1]
  if (!re || n.length < 2) return 0
  return new Set(articles.filter((a) => {
    const all = `${a.title}. ${a.description}`
    // "OTT: 넷플릭스" 또는 그 작품 이름과 함께 "넷플릭스에서 시청" (다른 넷플릭스 작품 이야기는 세지 않는다)
    return normT(all).includes(n) && sentences(all).some((s) => re.test(s) && (/OTT|다시보기|VOD/i.test(s) || (normT(s).includes(n) && /시청|스트리밍|공개/.test(s))))
  }).map((a) => a.link)).size
}

const CLOCK = new RegExp(String.raw`(?:(오전|오후|낮|저녁|밤|새벽)\s*)?(\d{1,2})시(?:\s*(\d{1,2})분|\s*반)?`)

/**
 * 작품명으로 찾은 뉴스·블로그에서 그 날짜의 OTT 공개 시각 ('HH:MM').
 * "9일 오후 5시 공개", 그날 쓴 글의 "오늘 오후 5시 공개". TV 방송 문장은 쓰지 않는다. 여러 글이 다르면 가장 많이 나온 시각
 */
export function timeFor(title: string, date: string, articles: Article[]): string | undefined {
  const n = normT(title), count = new Map<string, number>()
  for (const a of articles) {
    const pub = kstDate(a.pubDate)
    if (pub > date || pub < addDays(date, -60)) continue // 공개일 이후 글은 "지난 9일 오후 5시 공개"처럼 다른 회차일 수 있다
    const all = `${a.title}. ${a.description}`
    for (const s of sentences(all)) {
      if (tvTime(s) || RANKING.test(s) || !/공개|스트리밍|오픈|업로드/.test(s)) continue
      const w = pickWhen(s, pub)
      let time = w?.date === date ? w.time : undefined
      if (!w && pub === date && /오늘|이날/.test(s)) {
        const m = s.match(CLOCK)
        if (m) time = toTime(m[1], Number(m[2]), m[3] ? Number(m[3]) : m[0].endsWith('반') ? 30 : 0)
      }
      if (time && about(title, s, s.search(/\d{1,2}시/))) count.set(time, (count.get(time) ?? 0) + 1)
    }
  }
  return [...count].sort((x, y) => y[1] - x[1])[0]?.[0]
}

export function weekly(articles: Article[]): ExtractedWeekly[] {
  const out: ExtractedWeekly[] = []
  for (const a of articles) {
    const all = `${a.title}. ${a.description}`
    for (const s of sentences(all)) {
      const w = weeklyIn(s), title = w && weeklyTitle(s)
      if (w && title) out.push({ ...w, title, from: kstDate(a.pubDate) })
    }
  }
  return out
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
    // "OTT로는 넷플릭스·티빙", 또는 그 작품 이름과 함께 "넷플릭스에서도 시청" 같은 문장의 OTT
    const watchOn = (title: string) => sentences(all)
      .filter((x) => /OTT|다시보기|VOD/i.test(x) || (normT(x).includes(normT(title)) && /시청|스트리밍|공개|에서도|동시/.test(x)))
      .flatMap(platformsIn)
    for (const s of sentences(all)) {
      if (!RELEASE.test(s) || PAST.test(s)) continue
      // TV 방송 기사: 첫 방송 날짜만 "방송 후 공개"로 쓴다 (회차 방송 소식 "11회는 3일 방송"은 새 작품이 아니다).
      // 시각은 방송 시각이라 버리고, 같은 작품의 OTT 공개일 기사가 있으면 그쪽이 우선한다 (병합 단계)
      const tv = tvTime(s)
      if (tv && !/첫\s*방송|첫방/.test(s)) continue
      // TV 기사의 OTT는 그 문장·기사 제목·"OTT로는 넷플릭스에서 시청" 같은 문장에 나올 때만, 나온 OTT마다
      // (배우의 예전 넷플릭스 작품 이야기로 플랫폼이 정해지지 않게)
      const title = titlesIn(s)[0] ?? headTitle
      if (!title) continue
      const platforms = platformsIn(s).length
        ? platformsIn(s)
        : tv
          ? [...new Set([...platformsIn(a.title), ...watchOn(title)])]
          : articlePlatforms.length === 1 ? articlePlatforms : []
      if (!platforms.length) continue
      const { date = null, time: t } = pickWhen(s, pub) ?? {}
      const time = tv ? undefined : t
      const after = tv && date ? s.match(CHANNEL)?.[0] ?? 'TV' : undefined
      const dateText = date || tv ? null : vague(s, pub)
      if (!date && !dateText) continue
      for (const platform of platforms) {
        const key = `${title}|${platform}`
        const prev = found.get(key)
        if (prev?.date && (!prev.after || after)) continue // 정확한 날짜를 먼저 찾았으면 유지 (OTT 공개일 > 방송 후 공개)
        // 구분은 그 문장 → 기사 제목 → 기사 전체 순. TMDB에서 찾으면 다시 보정된다
        found.set(key, { article: i, title, platform, type: typeIn(s) ?? articleType, date, time, ...(after && { after }), dateText })
      }
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
