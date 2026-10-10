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
  웨이브: /wavve/i,
}
const img = (p?: string | null) => (p ? `https://image.tmdb.org/t/p/w342${p}` : undefined)

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

  private genreMap() {
    return (this.genres ??= this.get('/genre/movie/list').then((r) => new Map(r.genres.map((g: any) => [g.id, g.name]))))
  }

  async search(title: string, media: Media) {
    const x = (await this.get(`/search/${media}`, { query: title })).results[0]
    if (!x) return null
    const g: number[] = x.genre_ids ?? []
    // TMDB 장르로 구분 보정: 애니메이션 16, 리얼리티 10764, 토크 10767
    const type = g.includes(16) ? '애니메이션' : media === 'tv' && g.some((n) => n === 10764 || n === 10767) ? '예능' : undefined
    return { id: x.id as number, poster: img(x.poster_path), overview: (x.overview as string) || undefined, type }
  }

  async searchMovie(title: string) {
    const x = (await this.get('/search/movie', { query: title, region: 'KR' })).results[0]
    if (!x) return null
    return { poster: img(x.poster_path), genre: (await this.genreMap()).get(x.genre_ids?.[0]) }
  }

  /** KR에서 그 플랫폼 정액제로 볼 수 있는지 */
  async streaming(id: number, media: Media, providerId: number) {
    const r = await this.get(`/${media}/${id}/watch/providers`)
    return (r.results?.KR?.flatrate ?? []).some((p: any) => p.provider_id === providerId)
  }

  /** 플랫폼별 지금 볼 수 있는 인기작 (JustWatch 제공 정보). 오래된 장수 시리즈가 섞이지 않게 최근 작품만 */
  async available(today: string): Promise<Work[]> {
    const ids = await this.providerIds()
    const recent = { tv: { 'air_date.gte': addDays(today, -30) }, movie: { 'primary_release_date.gte': addDays(today, -365) } }
    const out: (Work & { pop: number })[] = []
    for (const [platform, pid] of Object.entries(ids)) {
      for (const media of ['tv', 'movie'] as const) {
        const r = await this.get(`/discover/${media}`, {
          watch_region: 'KR', with_watch_providers: pid, with_watch_monetization_types: 'flatrate', sort_by: 'popularity.desc', ...recent[media],
        })
        for (const x of r.results.slice(0, media === 'tv' ? 4 : 2)) {
          const g: number[] = x.genre_ids ?? []
          const type = g.includes(16) ? '애니메이션' : media === 'movie' ? '영화' : g.some((n) => n === 10764 || n === 10767) ? '예능' : '드라마'
          out.push({ id: `tmdb-${media}-${x.id}`, title: x.name ?? x.title, platform, type, date: null, poster: img(x.poster_path), pop: x.popularity })
        }
      }
    }
    const seen = new Set<string>()
    return out
      .sort((a, b) => b.pop - a.pop)
      .filter((w) => !seen.has(w.id) && seen.add(w.id))
      .map(({ pop: _pop, ...w }) => w)
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
      .map((x) => ({ id: `tmdb-movie-${x.id}`, title: x.title, platform: '극장', type: '영화', date: x.release_date || null, genre: genres.get(x.genre_ids?.[0]), poster: img(x.poster_path) }))
      .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  }
}
