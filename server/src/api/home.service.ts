import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import type { CalEvent, HomeData, StoredWork, Work } from './dto.js'
import { addDays, today } from '../config.js'
import { StoreService } from '../store/store.service.js'
import { PLATFORMS } from '../sources/extract.service.js'

/** "9월 중", "상반기", "2분기"가 오늘 기준으로 이미 지났는지 */
export function vaguePast(text: string | undefined, today: string) {
  const m = Number(today.slice(5, 7))
  const month = text?.match(/^(\d{1,2})월/)
  if (month) return Number(month[1]) < m
  const q = text?.match(/([1-4])분기/)
  if (q) return Number(q[1]) * 3 < m
  return text === '상반기' && m > 6
}

/** 메인(기대작 영역)에 올릴 작품: 드라마, 그리고 기안장 같은 시즌제 예능. 런닝맨 같은 장수 예능·해외 장수 드라마는 뺀다 */
export const main = (w: { type: string; longRun?: boolean }) => (w.type === '드라마' || w.type === '예능') && !w.longRun

const norm = (t: string) => t.replace(/시즌|season/gi, '').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase()

/** 같은 작품이 여러 플랫폼에 있으면 하나로 묶고 platforms에 모두 담는다 (화면: "넷플릭스 +2"). 대표는 TMDB 날짜가 있는 쪽 */
export function group<T extends Work | CalEvent>(list: T[], byDate = false): T[] {
  const map = new Map<string, T>()
  for (const w of list) {
    const k = norm(w.title) + (byDate ? `|${w.date}` : '')
    const g = map.get(k)
    if (!g) map.set(k, { ...w, platforms: [w.platform] })
    else if (g.via === 'news' && w.via === 'tmdb') map.set(k, { ...w, platforms: [w.platform, ...g.platforms!.filter((p) => p !== w.platform)] })
    else if (!g.platforms!.includes(w.platform)) g.platforms!.push(w.platform)
  }
  return [...map.values()]
}

@Injectable()
export class HomeService {
  constructor(private store: StoreService) {}

  async build(): Promise<HomeData> {
    const s = await this.store.load()
    // 모은 데이터가 하나도 없으면 화면이 시안 예시 데이터를 쓰도록 503
    if (!s.works.length && !s.ottAvailable.length && !s.theater.now.length) throw new ServiceUnavailableException('아직 수집된 데이터가 없습니다')
    const t = today()

    const out = (w: Work | StoredWork): Work => ({
      id: w.id, title: w.title, platform: w.platform, type: w.type, date: w.date, dateText: w.dateText,
      genre: w.genre, poster: w.poster, backdrop: w.backdrop, rank: w.rank, longRun: w.longRun,
      ...('sources' in w
        ? {
            source: (w.sources.filter((x) => x.title !== 'TMDB').at(-1) ?? w.sources.at(-1))?.link,
            via: w.dateBy ?? 'news',
            buzz: w.sources.filter((x) => x.title !== 'TMDB').length,
          }
        : { source: w.source }),
    })

    // 규칙 추출이라 잘못 뽑힌 제목이 섞일 수 있다. TMDB에 있거나 기사 2개 이상에 나온 작품만 보여 준다
    // 다루는 플랫폼만 (예전에 모은 웨이브 데이터는 여기서 빠진다)
    const ours = (w: { platform: string }) => (PLATFORMS as readonly string[]).includes(w.platform)
    const works = s.works.filter((w) => ours(w) && (w.tmdbId || w.sources.length >= 2))
    const available = s.ottAvailable.filter(ours)
    const upcoming = group(works.filter((w) => w.status === 'upcoming' && (w.date ? w.date >= t : !vaguePast(w.dateText, t))).map(out))
    // 기대작(OTT만): 30일 안에 공개되는 드라마·시즌제 예능 중 기사가 많이 나온 순
    const soon = upcoming
      .filter((w) => main(w) && w.date && w.date >= t && w.date <= addDays(t, 30))
      .sort((a, b) => (b.buzz ?? 0) - (a.buzz ?? 0) || a.date!.localeCompare(b.date!))
      .slice(0, 4)
    const tn = s.theater.now.map(out)
    const oa = group(available.map(out))
    // 지금 인기(OTT만): 드라마·시즌제 예능 중 한국어 작품 → 드라마 → TMDB 인기 점수 순.
    // 플랫폼이 겹치지 않게 고르고, 4개가 안 되면 나머지로 채운다
    const picks = available
      .filter(main)
      .sort((a, b) => Number(!!b.ko) - Number(!!a.ko) || Number(b.type === '드라마') - Number(a.type === '드라마') || (b.pop ?? 0) - (a.pop ?? 0))
    const now: Work[] = []
    for (const pass of [true, false]) {
      for (const w of picks) {
        if (now.length === 4 || now.some((x) => x.title === w.title) || (pass && now.some((x) => x.platform === w.platform))) continue
        now.push(out(w))
      }
    }

    const ev = (w: Work): CalEvent => ({ date: w.date!, platform: w.platform, type: w.type, title: w.title, source: w.source, via: w.via })
    const events = group([...works.map(out), ...tn, ...s.theater.soon.map(out)].filter((w) => w.date).map(ev), true)

    return {
      hot: { soon, now },
      ott: { upcoming, available: oa }, // 플랫폼 필터가 화면에서 걸리므로 자르지 않는다
      theater: { now: tn, soon: s.theater.soon.map(out) },
      events,
      updatedAt: s.collectedAt,
    }
  }
}
