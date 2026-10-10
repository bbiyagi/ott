import { createHash } from 'node:crypto'
import { Injectable, Logger } from '@nestjs/common'
import type { Store, StoredWork, Work } from '../api/dto.js'
import { addDays, has, today } from '../config.js'
import { StoreService } from '../store/store.service.js'
import { ExtractService } from '../sources/extract.service.js'
import { KobisService } from '../sources/kobis.service.js'
import { NaverNewsService } from '../sources/naver-news.service.js'
import { TmdbService, type Media } from '../sources/tmdb.service.js'

const KEYWORDS = ['넷플릭스 공개 예정', '넷플릭스 공개일', '티빙 공개 예정', '디즈니플러스 공개 예정', '쿠팡플레이 공개 예정', '웨이브 공개 예정', 'OTT 공개 예정', 'OTT 신작 공개']
const PER_RUN = 30 // 한 번에 추출할 새 기사 수
const SEEN_MAX = 3000

export interface Report { articles: number; newArticles: number; extracted: number; newWorks: number; updated: number; released: number; skipped: string[] }

/** 같은 작품 판단: 작품명(공백·문장부호 제거) + 플랫폼 */
export const workKey = (title: string, platform: string) => `${title.replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase()}|${platform}`
const media = (w: Work): Media => (w.type === '영화' ? 'movie' : 'tv')

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
    const report: Report = { articles: 0, newArticles: 0, extracted: 0, newWorks: 0, updated: 0, released: 0, skipped: [] }
    // 단계마다 따로 실패한다. 실패한 단계는 이전 데이터를 그대로 둔다
    const step = async (name: string, ready: boolean, fn: () => Promise<void>) => {
      if (!ready) return void report.skipped.push(`${name}: 키 없음`)
      try { await fn() } catch (e) {
        this.log.error(`${name} 실패: ${(e as Error).message}`)
        report.skipped.push(`${name}: ${(e as Error).message}`)
      }
    }

    await step('뉴스 수집·추출', has('naver') && has('anthropic'), () => this.news(s, t, report))
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
    const found = (await Promise.all(KEYWORDS.map((k) => this.naver.search(k)))).flat()
    const articles = [...new Map(found.map((a) => [a.link, a])).values()]
    const seen = new Set(s.seen)
    const fresh = articles.filter((a) => !seen.has(a.link)).slice(0, PER_RUN)
    report.articles = articles.length
    report.newArticles = fresh.length
    if (!fresh.length) return

    const items = await this.extract.run(fresh, t)
    report.extracted = items.length
    const byKey = new Map(s.works.map((w) => [w.key, w]))
    for (const it of items) {
      const a = fresh[it.article]
      if (!a || !it.title.trim()) continue
      const date = it.date && /^\d{4}-\d{2}-\d{2}$/.test(it.date) ? it.date : null
      if (date && date < addDays(t, -7)) continue
      const src = { title: a.title, link: a.link, date: a.pubDate }
      const key = workKey(it.title, it.platform)
      const w = byKey.get(key)
      if (!w) {
        const nw: StoredWork = {
          id: createHash('sha1').update(key).digest('hex').slice(0, 12), key, title: it.title.trim(), platform: it.platform, type: it.type,
          date, dateText: date ? undefined : it.dateText ?? undefined, status: 'upcoming', sources: [src], dateFrom: src.date,
        }
        s.works.push(nw)
        byKey.set(key, nw)
        report.newWorks++
        continue
      }
      if (!w.sources.some((x) => x.link === src.link)) w.sources.push(src)
      // 더 최근 기사의 정확한 날짜를 우선. 애매한 날짜로 정확한 날짜를 덮지 않는다
      if (date && (!w.date || src.date >= (w.dateFrom ?? ''))) {
        if (w.date !== date) report.updated++
        Object.assign(w, { date, dateText: undefined, dateFrom: src.date })
        if (w.status === 'released' && date > t) w.status = 'upcoming'
      } else if (!date && !w.date && it.dateText) {
        w.dateText = it.dateText
      }
    }
    // 추출이 끝난 기사만 처리한 것으로 기록
    s.seen = [...fresh.map((a) => a.link), ...s.seen].slice(0, SEEN_MAX)
  }

  private async enrich(s: Store, t: string, report: Report) {
    for (const w of s.works.filter((w) => w.tmdbId === undefined).slice(0, 40)) {
      const hit = await this.tmdb.search(w.title, media(w))
      w.tmdbId = hit?.id ?? null
      if (hit) Object.assign(w, { poster: hit.poster, overview: hit.overview })
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
