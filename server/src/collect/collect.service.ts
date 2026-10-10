import { createHash } from 'node:crypto'
import { Injectable, Logger } from '@nestjs/common'
import type { Store, StoredWork, Work } from '../api/dto.js'
import { addDays, has, today } from '../config.js'
import { StoreService } from '../store/store.service.js'
import { ExtractService } from '../sources/extract.service.js'
import { KobisService } from '../sources/kobis.service.js'
import { NaverNewsService } from '../sources/naver-news.service.js'
import { TmdbService, type Media } from '../sources/tmdb.service.js'

// 플랫폼 × 구분별로 검색해야 예능·영화·애니 기사도 잡힌다 (5 × 9 + 1 = 46회, 네이버 하루 한도 25,000회)
const QUERY_NAMES = ['넷플릭스', '티빙', '디즈니플러스', '쿠팡플레이', '웨이브']
const SUFFIXES = ['공개 예정', '공개일', '오리지널 공개', '드라마 공개', '예능 공개', '영화 공개', '애니 공개', '첫 공개', '첫 방송']
const KEYWORDS = [...QUERY_NAMES.flatMap((p) => SUFFIXES.map((s) => `${p} ${s}`)), 'OTT 신작 공개']
const PER_RUN = 3000 // 한 번에 처리할 새 기사 수 (규칙 추출이라 비용 없음)
const SEEN_MAX = 20000 // 링크 대신 짧은 해시로 저장
const ENRICH_MAX = 150 // 한 번에 TMDB에서 찾아볼 작품 수

export interface Report { articles: number; newArticles: number; extracted: number; tmdbSeries: number; newWorks: number; updated: number; released: number; skipped: string[] }
interface Candidate { title: string; platform: string; type: string; date: string | null; dateText?: string | null }

/** 같은 작품 판단: 작품명(공백·문장부호 제거) + 플랫폼 */
export const workKey = (title: string, platform: string) =>
  `${title.replace(/시즌|season/gi, '').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase()}|${platform}` // "데블스 플랜 시즌3" = "데블스플랜3"
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

  async run(): Promise<Report> {
    const s = await this.store.load()
    const t = today()
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
    await step('극장', has('kobis') || has('tmdb'), async () => { s.theater = await this.theater(t) })

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

  /** TMDB에 등록된 플랫폼 오리지널 공개 예정 시리즈. 기사보다 날짜·구분이 정확해서 덮어쓴다 */
  private async series(s: Store, t: string, report: Report) {
    const list = await this.tmdb.upcomingSeries(t)
    report.tmdbSeries = list.length
    const now = new Date().toISOString()
    for (const x of list) {
      const w = this.merge(s, x, { title: 'TMDB', link: `https://www.themoviedb.org/tv/${x.id}`, date: now }, t, report)
      if (w) Object.assign(w, { tmdbId: x.id, tmdbMedia: 'tv', type: x.type, poster: x.poster ?? w.poster, overview: x.overview ?? w.overview })
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
        id: hash(key, 12), key, title, platform: it.platform, type: it.type, date, dateText: date ? undefined : it.dateText ?? undefined,
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
      Object.assign(w, { date, dateText: undefined, dateFrom: src.date, dateBy: by })
      if (w.status === 'released' && date > t) w.status = 'upcoming'
    } else if (!date && !w.date && it.dateText) {
      w.dateText = it.dateText
    }
    return w
  }

  private async enrich(s: Store, t: string, report: Report) {
    for (const w of s.works.filter((w) => w.tmdbId === undefined).slice(0, ENRICH_MAX)) {
      const hit = await this.tmdb.search(w.title, w.date, t)
      w.tmdbId = hit?.id ?? null
      if (hit) Object.assign(w, { tmdbMedia: hit.media, poster: hit.poster, overview: hit.overview, type: hit.type })
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
      now.push({ id: `kobis-${m.code}`, title: m.title, platform: '극장', type: '영화', date: m.openDt, genre: info?.genre, poster: info?.poster })
    }
    const soon = has('tmdb') ? (await this.tmdb.upcomingMovies(t)).filter((x) => !now.some((n) => n.title === x.title)) : []
    return { now, soon }
  }
}
