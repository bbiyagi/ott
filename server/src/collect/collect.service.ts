import { createHash } from 'node:crypto'
import { Injectable, Logger } from '@nestjs/common'
import type { Store, StoredWork, Weekly, Work } from '../api/dto.js'
import { addDays, has, today } from '../config.js'
import { StoreService } from '../store/store.service.js'
import { ExtractService, weekly, weeklyFor, type ExtractedWeekly } from '../sources/extract.service.js'
import { KobisService } from '../sources/kobis.service.js'
import { NaverNewsService } from '../sources/naver-news.service.js'
import { TmdbService, type Media } from '../sources/tmdb.service.js'

// 플랫폼 × 구분별로 검색해야 영화·애니 기사도 잡힌다 (4 × 5 + 1 = 21회, 네이버 하루 한도 25,000회)
// 2026-10 측정: '드라마 공개'·'첫 공개'는 다른 검색어가 이미 찾은 작품만, '예능 공개'는 1개, '첫 방송'은 대부분 TV 방송 기사라 뺐다
const QUERY_NAMES = ['넷플릭스', '티빙', '디즈니플러스', '쿠팡플레이']
const SUFFIXES = ['공개 예정', '공개일', '오리지널 공개', '영화 공개', '애니 공개']
const KEYWORDS = [...QUERY_NAMES.flatMap((p) => SUFFIXES.map((s) => `${p} ${s}`)), 'OTT 신작 공개']
const PER_RUN = 3000 // 한 번에 처리할 새 기사 수 (규칙 추출이라 비용 없음)
const SEEN_MAX = 20000 // 링크 대신 짧은 해시로 저장
const ENRICH_MAX = 150 // 한 번에 TMDB에서 찾아볼 작품 수
const WEEKLY_MAX = 20 // 한 번에 정기 공개 일정을 찾아볼 작품 수 (뉴스 1회 + 블로그 1회)
const WEEKLY_RETRY = 3 // 찾아봤는데 일정이 없던 작품은 며칠 뒤에 다시 (같은 검색 반복 방지)
const RULES = 2 // 추출 규칙이 바뀌면 올린다. 다음 수집 때 기사를 새 규칙으로 다시 읽는다 (2: TV 방송 날짜를 OTT 공개일로 쓰지 않음, 매주 일정은 방송 기준이면 "방송 후 공개")
const REFRESH_GAP = 10 * 60_000 // 새로고침 버튼 최소 간격

export interface Report { articles: number; newArticles: number; extracted: number; tmdbSeries: number; newWorks: number; updated: number; released: number; skipped: string[] }
interface Candidate { title: string; platform: string; type: string; date: string | null; time?: string; dateText?: string | null }

/** 같은 작품 판단: 작품명(공백·문장부호 제거) + 플랫폼 */
export const workKey = (title: string, platform: string) =>
  `${title.replace(/시즌|season/gi, '').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase()}|${platform}` // "데블스 플랜 시즌3" = "데블스플랜3"
/** 정기 공개 일정 ("매주 …") 저장: 같은 작품이면 OTT 직접 공개 > 방송 후 공개, 시각 있는 쪽, 그다음 최근 글 */
const score = (x: Weekly) => (x.after ? 0 : 2) + (x.time ? 1 : 0)
function addWeekly(s: Store, found: ExtractedWeekly[]) {
  s.weekly ??= {}
  for (const { title, ...x } of found) {
    const k = workKey(title, '').slice(0, -1), old = s.weekly[k]
    if (!old || score(x) > score(old) || (score(x) === score(old) && x.from >= old.from)) s.weekly[k] = x
  }
}
const hash = (s: string, n: number) => createHash('sha1').update(s).digest('hex').slice(0, n)
const media = (w: StoredWork): Media => w.tmdbMedia ?? (w.type === '영화' ? 'movie' : 'tv')

@Injectable()
export class CollectService {
  private log = new Logger('Collect')

  constructor(
    private store: StoreService,
    private naver: NaverNewsService,
    private extract: ExtractService,
    private tmdb: TmdbService,
    private kobis: KobisService,
  ) {}

  private running?: Promise<Report>

  /**
   * 화면의 새로고침 버튼용. 누구나 누를 수 있어서 마지막 수집 뒤 10분 안에는 다시 돌리지 않고,
   * 이미 돌고 있으면 그 결과를 같이 기다린다.
   * ponytail: 서버 인스턴스 하나 기준. 여러 인스턴스가 동시에 돌 수 있지만 10분 제한으로 충분하다
   */
  async refresh(): Promise<Report | { waitMinutes: number }> {
    if (this.running) return this.running
    const { collectedAt } = await this.store.load()
    const left = collectedAt ? REFRESH_GAP - (Date.now() - Date.parse(collectedAt)) : 0
    if (left > 0) return { waitMinutes: Math.ceil(left / 60_000) }
    this.running = this.run().finally(() => (this.running = undefined))
    return this.running
  }

  async run(): Promise<Report> {
    const s = await this.store.load()
    const t = today()
    if (s.rules !== RULES) {
      // 기사로 정한 날짜·일정을 지우고 최근 45일 기사를 새 규칙으로 다시 읽는다. TMDB 날짜 작품은 그대로
      Object.assign(s, { seen: [], works: s.works.filter((w) => w.dateBy === 'tmdb'), weekly: {}, weeklyTried: {}, rules: RULES })
    }
    const report: Report = { articles: 0, newArticles: 0, extracted: 0, tmdbSeries: 0, newWorks: 0, updated: 0, released: 0, skipped: [] }
    // 단계마다 따로 실패한다. 실패한 단계는 이전 데이터를 그대로 둔다
    const step = async (name: string, ready: boolean, fn: () => Promise<void>) => {
      if (!ready) return void report.skipped.push(`${name}: 키 없음`)
      try { await fn() } catch (e) {
        this.log.error(`${name} 실패: ${(e as Error).message}`)
        report.skipped.push(`${name}: ${(e as Error).message}`)
      }
    }

    await step('뉴스 수집·추출', has('naver'), () => this.news(s, t, report))
    await step('TMDB 공개 예정 시리즈', has('tmdb'), () => this.series(s, t, report))
    await step('TMDB 보강·공개 확인', has('tmdb'), () => this.enrich(s, t, report))
    for (const w of s.works) {
      if (w.status === 'upcoming' && w.date && w.date <= addDays(t, -7)) { w.status = 'released'; report.released++ }
    }
    await step('OTT 서비스 중', has('tmdb'), async () => { s.ottAvailable = await this.tmdb.available(t) })
    await step('정기 공개 일정', has('naver'), () => this.schedules(s, t))
    await step('극장', has('kobis') || has('tmdb'), async () => { s.theater = await this.theater(t) })

    s.lastReport = { articles: report.articles, newWorks: report.newWorks, skipped: report.skipped }
    await this.store.save(s)
    this.log.log(JSON.stringify(report))
    return report
  }

  private async news(s: Store, t: string, report: Report) {
    // 네이버는 초당 요청 수 제한이 있어 하나씩 부른다 (46회 ≈ 10초)
    const found = []
    for (const k of KEYWORDS) found.push(...(await this.naver.search(k)))
    // 45일 지난 기사는 "7월 중" 같은 지나간 시기만 남겨서 뺀다
    const since = addDays(t, -45)
    const articles = [...new Map(found.filter((a) => a.pubDate.slice(0, 10) >= since).map((a) => [a.link, a])).values()]
    const seen = new Set(s.seen)
    const fresh = articles.filter((a) => !seen.has(hash(a.link, 10))).slice(0, PER_RUN)
    report.articles = articles.length
    report.newArticles = fresh.length
    addWeekly(s, weekly(articles))
    // 이미 처리한 기사에서는 공개 시각만 채운다 (같은 작품·같은 날짜이고 시각이 비어 있을 때)
    for (const it of await this.extract.run(articles.filter((a) => seen.has(hash(a.link, 10))))) {
      const w = it.time && s.works.find((x) => x.key === workKey(it.title, it.platform) && x.date === it.date && !x.time)
      if (w) w.time = it.time
    }
    if (!fresh.length) return

    const items = await this.extract.run(fresh)
    report.extracted = items.length
    for (const it of items) {
      const a = fresh[it.article]
      if (a) this.merge(s, it, { title: a.title, link: a.link, date: a.pubDate }, t, report)
    }
    // 추출이 끝난 기사만 처리한 것으로 기록
    s.seen = [...fresh.map((a) => hash(a.link, 10)), ...s.seen].slice(0, SEEN_MAX)
  }

  /** 목록의 시리즈 중 정기 공개 일정이 없는 작품을 "작품명 매주"로 찾는다 */
  private async schedules(s: Store, t: string) {
    const key = (title: string) => workKey(title, '').slice(0, -1)
    const known = (title: string) => Object.keys(s.weekly ?? {}).some((k) => key(title).startsWith(k))
    const tried = (s.weeklyTried = Object.fromEntries(Object.entries(s.weeklyTried ?? {}).filter(([, d]) => d >= addDays(t, -30))))
    const titles = [...new Set([...s.works.filter((w) => w.status === 'upcoming'), ...s.ottAvailable]
      .filter((w) => w.type !== '영화' && !known(w.title) && !(tried[key(w.title)] > addDays(t, -WEEKLY_RETRY))).map((w) => w.title))].slice(0, WEEKLY_MAX)
    for (const title of titles) {
      // 블로그에는 "방송: MBC 매주 일요일 밤 9시 10분 · OTT: 넷플릭스"처럼 편성 정리 글이 많다
      const found = [...(await this.naver.search(`${title} 매주`)), ...(await this.naver.search(`${title} 매주 공개`, 'blog'))]
      addWeekly(s, weeklyFor(title, found, t))
      tried[key(title)] = t
    }
  }

  /** TMDB에 등록된 플랫폼 오리지널 공개 예정 시리즈. 기사보다 날짜·구분이 정확해서 덮어쓴다 */
  private async series(s: Store, t: string, report: Report) {
    const list = await this.tmdb.upcomingSeries(t)
    report.tmdbSeries = list.length
    const now = new Date().toISOString()
    for (const x of list) {
      const w = this.merge(s, x, { title: 'TMDB', link: `https://www.themoviedb.org/tv/${x.id}`, date: now }, t, report)
      if (w) Object.assign(w, { tmdbId: x.id, tmdbMedia: 'tv', type: x.type, poster: x.poster ?? w.poster, backdrop: x.backdrop ?? w.backdrop, overview: x.overview ?? w.overview })
    }
  }

  private merge(s: Store, it: Candidate, src: StoredWork['sources'][number], t: string, report: Report): StoredWork | null {
    const title = it.title.trim()
    const date = it.date && /^\d{4}-\d{2}-\d{2}$/.test(it.date) ? it.date : null
    if (!title || (date && date < addDays(t, -7))) return null
    const key = workKey(title, it.platform)
    const base = key.split('|')[0]
    // "라스트 스테이지"와 "라스트 스테이지 : 24H"처럼 앞부분이 같고 플랫폼·날짜도 같으면 같은 작품
    const w = s.works.find((x) => x.key === key) ?? s.works.find((x) =>
      x.platform === it.platform && date && x.date === date && (x.key.startsWith(base) || base.startsWith(x.key.split('|')[0])))
    const by = src.title === 'TMDB' ? 'tmdb' : 'news'
    if (!w) {
      const nw: StoredWork = {
        id: hash(key, 12), key, title, platform: it.platform, type: it.type, date, time: date ? it.time : undefined, dateText: date ? undefined : it.dateText ?? undefined,
        status: 'upcoming', sources: [src], dateFrom: src.date, dateBy: by,
      }
      s.works.push(nw)
      report.newWorks++
      return nw
    }
    if (!w.sources.some((x) => x.link === src.link)) w.sources.push(src)
    // TMDB 날짜는 기사로 덮지 않는다. 기사끼리는 더 최근 기사의 정확한 날짜 우선, 애매한 날짜로 정확한 날짜를 덮지 않는다
    const locked = w.dateBy === 'tmdb' && by === 'news'
    if (date && !locked && (!w.date || by === 'tmdb' || src.date >= (w.dateFrom ?? ''))) {
      if (w.date !== date) report.updated++
      // 시각은 그 날짜를 말한 기사에서만. 날짜가 바뀌면 옛 시각은 버리고, 같은 날이면 시각 없는 소식(TMDB)이 지우지 않는다
      const time = it.time ?? (w.date === date ? w.time : undefined)
      Object.assign(w, { date, time, dateText: undefined, dateFrom: src.date, dateBy: by })
      if (w.status === 'released' && date > t) w.status = 'upcoming'
    } else if (date && date === w.date && it.time && !w.time) {
      w.time = it.time // TMDB가 정한 날짜와 같은 날이면 기사의 시각을 붙인다
    } else if (!date && !w.date && it.dateText) {
      w.dateText = it.dateText
    }
    return w
  }

  private async enrich(s: Store, t: string, report: Report) {
    for (const w of s.works.filter((w) => w.tmdbId === undefined).slice(0, ENRICH_MAX)) {
      const hit = await this.tmdb.search(w.title, w.date, t)
      w.tmdbId = hit?.id ?? null
      if (hit) Object.assign(w, { tmdbMedia: hit.media, poster: hit.poster, backdrop: hit.backdrop, overview: hit.overview, type: hit.type, longRun: hit.longRun })
    }
    const ids = await this.tmdb.providerIds()
    for (const w of s.works) {
      if (w.status !== 'upcoming' || !w.date || w.date > t || !w.tmdbId || !ids[w.platform]) continue
      if (await this.tmdb.streaming(w.tmdbId, media(w), ids[w.platform])) { w.status = 'released'; report.released++ }
    }
  }

  private async theater(t: string): Promise<Store['theater']> {
    const box = has('kobis') ? await this.kobis.daily(addDays(t, -1)) : []
    const now: Work[] = []
    for (const m of box) {
      const info = has('tmdb') ? await this.tmdb.searchMovie(m.title) : null
      now.push({ id: `kobis-${m.code}`, title: m.title, platform: '극장', type: '영화', date: m.openDt, ...info })
    }
    const soon = has('tmdb') ? (await this.tmdb.upcomingMovies(t)).filter((x) => !now.some((n) => n.title === x.title)) : []
    return { now, soon }
  }
}
