import { Injectable, Logger } from '@nestjs/common'
import type { Work } from '../api/dto.js'
import { addDays, env } from '../config.js'
import { PLATFORMS } from './extract.service.js'

export type Media = 'movie' | 'tv'

// TMDB의 플랫폼 이름. id는 하드코딩하지 않고 이름으로 찾는다
const NAMES: Record<string, RegExp> = {
  넷플릭스: /^netflix$/i,
  티빙: /tving/i,
  '디즈니+': /^disney\s*plus$/i,
  쿠팡플레이: /coupang/i,
}
// 플랫폼 오리지널 시리즈의 TMDB 네트워크 id (실제 작품의 네트워크에서 확인: 오징어 게임, 환승연애, 무빙, 소년시대)
const NETWORKS: Record<string, number> = { 넷플릭스: 213, 티빙: 3897, '디즈니+': 2739, 쿠팡플레이: 5169 }
// 시즌당 회차가 이보다 많으면 매주 하는 장수 프로그램 (런닝맨·아는 형님·해외 장수 드라마). 기안장 같은 시즌제 예능은 10회 안팎
const LONG_RUN_EPISODES = 20
// 포스터는 w500, 큰 배너용 가로 스틸(backdrop)은 w1280
const img = (p?: string | null, size = 'w500') => (p ? `https://image.tmdb.org/t/p/${size}${p}` : undefined)
const pics = (x: any) => ({ poster: img(x.poster_path), backdrop: img(x.backdrop_path, 'w1280') })
// TMDB 장르: 애니메이션 16, 리얼리티 10764, 토크 10767
const typeOf = (media: Media, genres: number[] = []) =>
  genres.includes(16) ? '애니메이션' : media === 'movie' ? '영화' : genres.some((n) => n === 10764 || n === 10767) ? '예능' : '드라마'

// 외부 응답은 쓰는 필드만 읽어서 any로 둔다
@Injectable()
export class TmdbService {
  private log = new Logger('TMDB')
  private providers?: Promise<Record<string, number>>
  private genres?: Promise<Map<number, string>>

  private async get(path: string, params: Record<string, string | number> = {}): Promise<any> {
    const u = new URL(`https://api.themoviedb.org/3${path}`)
    u.searchParams.set('language', 'ko-KR')
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v))
    const r = await fetch(u, { headers: { Authorization: `Bearer ${env('TMDB_TOKEN')}`, accept: 'application/json' } })
    if (!r.ok) throw new Error(`TMDB ${path} ${r.status}`)
    return r.json()
  }

  providerIds() {
    return (this.providers ??= (async () => {
      const lists = await Promise.all((['tv', 'movie'] as const).map((m) => this.get(`/watch/providers/${m}`, { watch_region: 'KR' })))
      const all: { provider_id: number; provider_name: string }[] = lists.flatMap((l) => l.results)
      const ids: Record<string, number> = {}
      for (const p of PLATFORMS) {
        const hit = all.find((x) => NAMES[p].test(x.provider_name))
        if (hit) ids[p] = hit.provider_id
      }
      const missing = PLATFORMS.filter((p) => !ids[p])
      if (missing.length) this.log.warn(`찾지 못한 플랫폼: ${missing.join(', ')}`)
      return ids
    })())
  }

  private tvs = new Map<number, Promise<any>>()
  private tv(tvId: number) {
    let p = this.tvs.get(tvId)
    if (!p) this.tvs.set(tvId, (p = this.get(`/tv/${tvId}`)))
    return p
  }
  /** 시리즈가 장수 프로그램인지: 시즌당 평균 회차 > 20 */
  async longRun(tvId: number) {
    const d = await this.tv(tvId)
    return (d.number_of_episodes ?? 0) / Math.max(1, d.number_of_seasons ?? 1) > LONG_RUN_EPISODES
  }
  /**
   * 최근·다음 회차 날짜. OTT 오리지널(네트워크가 그 OTT)일 때만: TV 방송 작품의 날짜는 방송일이라 OTT 공개일과 다를 수 있다
   * date = 가장 최근 공개 회차 날짜, next = 다음 회차 날짜
   */
  async episodes(tvId: number, platform: string): Promise<{ date?: string; next?: string }> {
    const d = await this.tv(tvId)
    if (!(d.networks as { id: number }[] | undefined)?.some((n) => n.id === NETWORKS[platform])) return {}
    return { date: d.last_episode_to_air?.air_date || undefined, next: d.next_episode_to_air?.air_date || undefined }
  }

  private genreMap() {
    return (this.genres ??= this.get('/genre/movie/list').then((r) => new Map(r.genres.map((g: any) => [g.id, g.name]))))
  }

  /**
   * 시리즈·영화를 함께 찾고, TMDB 장르로 구분을 정한다.
   * 같은 이름의 옛 작품을 잡지 않도록 공개일이 우리 날짜와 60일 안(날짜가 없으면 최근 1년)인 것만,
   * 시리즈는 이름이 똑같으면 새 시즌일 수 있어 날짜와 상관없이 인정한다.
   */
  async search(title: string, date: string | null, today: string) {
    const norm = (s: string) => s.replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase()
    const days = (d: string) => Date.parse(d) / 864e5
    const ok = (r: any) => {
      if (r.media_type !== 'tv' && r.media_type !== 'movie') return false
      const d: string = r.first_air_date || r.release_date
      if (r.media_type === 'tv' && norm(r.name) === norm(title)) return true
      if (!d) return false
      return date ? Math.abs(days(d) - days(date)) <= 60 : d >= addDays(today, -365)
    }
    let x = (await this.get('/search/multi', { query: title })).results.find(ok)
    // "신인감독 김연경2", "데블스 플랜 시즌3"는 TMDB에 시즌 번호 없이 한 작품으로 있다
    const base = title.replace(/\s*(시즌\s*)?\d+$/, '')
    if (!x && base !== title) x = (await this.get('/search/tv', { query: base })).results.map((r: any) => ({ ...r, media_type: 'tv' })).find((r: any) => norm(r.name) === norm(base))
    if (!x) return null
    const media: Media = x.media_type
    const longRun = media === 'tv' ? await this.longRun(x.id) : false
    return { id: x.id as number, media, ...pics(x), overview: (x.overview as string) || undefined, type: typeOf(media, x.genre_ids), longRun }
  }

  /** 플랫폼 오리지널 공개 예정 시리즈: 한국 작품 전부 + 해외 작품은 인기 상위 3개 */
  async upcomingSeries(today: string) {
    const out: { platform: string; id: number; title: string; type: string; date: string; poster?: string; backdrop?: string; overview?: string }[] = []
    for (const [platform, network] of Object.entries(NETWORKS)) {
      const base = { with_networks: network, 'first_air_date.gte': addDays(today, 1), 'first_air_date.lte': addDays(today, 180) }
      const [kr, top] = await Promise.all([
        this.get('/discover/tv', { ...base, with_origin_country: 'KR', sort_by: 'first_air_date.asc' }),
        this.get('/discover/tv', { ...base, sort_by: 'popularity.desc' }),
      ])
      const seen = new Set<number>()
      for (const x of [...kr.results, ...top.results.slice(0, 3)]) {
        if (seen.has(x.id) || !x.first_air_date) continue
        seen.add(x.id)
        out.push({ platform, id: x.id, title: x.name, type: typeOf('tv', x.genre_ids), date: x.first_air_date, ...pics(x), overview: x.overview || undefined })
      }
    }
    return out
  }

  async searchMovie(title: string) {
    const x = (await this.get('/search/movie', { query: title, region: 'KR' })).results[0]
    if (!x) return null
    return { ...pics(x), genre: (await this.genreMap()).get(x.genre_ids?.[0]), overview: (x.overview as string) || undefined, tmdbUrl: `https://www.themoviedb.org/movie/${x.id}` }
  }

  /** KR에서 그 플랫폼 정액제로 볼 수 있는지 */
  async streaming(id: number, media: Media, providerId: number) {
    const r = await this.get(`/${media}/${id}/watch/providers`)
    return (r.results?.KR?.flatrate ?? []).some((p: any) => p.provider_id === providerId)
  }

  /**
   * 플랫폼별 지금 볼 수 있는 인기작 (JustWatch 제공 정보). 오래된 장수 시리즈가 섞이지 않게 최근 작품만.
   * rank = "넷플릭스 예능 인기 1위"처럼 그 플랫폼·구분 안에서의 TMDB 인기 순위
   */
  async available(today: string): Promise<(Work & { pop: number; ko: boolean; longRun: boolean })[]> {
    const ids = await this.providerIds()
    const recent = { tv: { 'air_date.gte': addDays(today, -30) }, movie: { 'primary_release_date.gte': addDays(today, -365) } }
    // 플랫폼 × 구분마다 인기작: 어떤 필터 조합을 골라도 비지 않게 (4 × 5 = 20회 + 시리즈 회차 조회)
    const KINDS: [Media, string, Record<string, string>][] = [
      ['tv', '드라마', { without_genres: '16,10764,10767' }],
      // 티빙처럼 해외 드라마가 위를 차지하는 플랫폼도 메인에 한국 드라마가 오르도록 따로
      ['tv', '한국 드라마', { without_genres: '16,10764,10767', with_original_language: 'ko' }],
      ['tv', '예능', { with_genres: '10764|10767' }],
      ['tv', '애니메이션', { with_genres: '16' }],
      ['movie', '영화', { without_genres: '16' }],
    ]
    const out: (Work & { pop: number; ko: boolean; longRun: boolean })[] = []
    for (const [platform, pid] of Object.entries(ids)) {
      for (const [media, label, genres] of KINDS) {
        const params = { watch_region: 'KR', with_watch_providers: pid, with_watch_monetization_types: 'flatrate', sort_by: 'popularity.desc', ...genres }
        let r = await this.get(`/discover/${media}`, { ...params, ...recent[media] })
        if (!r.results.length) r = await this.get(`/discover/${media}`, params) // 최근 작품이 없으면 기간 없이
        // 5개씩: 메인에서 장수 프로그램을 빼고도 고를 작품이 남도록.
        // 순위는 메인에 나올 수 있는 작품(장수 제외)끼리만 센다. 로 앤 오더 같은 1위가 빠져 "4위"부터 보이지 않게
        let n = 0
        for (const x of (r.results as any[]).slice(0, 5)) {
          const longRun = media === 'tv' ? await this.longRun(x.id) : false
          const eps = media === 'tv' ? await this.episodes(x.id, platform) : {}
          // 같은 작품이 여러 플랫폼에 있으면 플랫폼마다 따로 둔다 (id 끝 = 플랫폼 번호)
          const id = `tmdb-${media}-${x.id}-${PLATFORMS.indexOf(platform as (typeof PLATFORMS)[number])}`
          out.push({
            id, title: x.name ?? x.title, platform, type: typeOf(media, x.genre_ids), date: eps.date ?? null, ...(eps.next && { next: eps.next }), ...pics(x),
            rank: longRun ? undefined : `${platform} ${label} 인기 ${++n}위`, pop: x.popularity, ko: x.original_language === 'ko',
            overview: x.overview || undefined, tmdbUrl: `https://www.themoviedb.org/${media}/${x.id}`, longRun,
          })
        }
      }
    }
    // 같은 작품이 두 목록에 있으면(예: 드라마 3위이자 한국 드라마 1위) 더 높은 순위 쪽을 남긴다
    const rankNo = (w: Work) => Number(w.rank?.match(/(\d+)위$/)?.[1] ?? 99)
    const best = new Map<string, (typeof out)[number]>()
    for (const w of out) {
      const prev = best.get(w.id)
      if (!prev || rankNo(w) < rankNo(prev)) best.set(w.id, w)
    }
    return [...best.values()].sort((a, b) => b.pop - a.pop)
  }

  /** 한국 개봉 예정 영화 (60일 안) */
  async upcomingMovies(today: string): Promise<Work[]> {
    const r = await this.get('/discover/movie', {
      region: 'KR', with_release_type: '2|3', sort_by: 'popularity.desc',
      'release_date.gte': addDays(today, 1), 'release_date.lte': addDays(today, 60),
    })
    const genres = await this.genreMap()
    return (r.results as any[])
      .slice(0, 12)
      .map((x) => ({
        id: `tmdb-movie-${x.id}`, title: x.title, platform: '극장', type: '영화', date: x.release_date || null, genre: genres.get(x.genre_ids?.[0]),
        ...pics(x), overview: (x.overview as string) || undefined, tmdbUrl: `https://www.themoviedb.org/movie/${x.id}`,
      }))
      .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  }
}
