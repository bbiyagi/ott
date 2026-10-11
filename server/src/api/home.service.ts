import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import type { CalEvent, HomeData, Store, StoredWork, Work, WorkDetail } from './dto.js'
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

/** 플랫폼이 번갈아 나오게: 각 플랫폼 1등 → 각 플랫폼 2등 → … (같은 작품명은 한 번만). 순서는 원래 목록 기준 */
export function interleave<T extends { platform: string; title: string }>(list: T[]): T[] {
  const by = new Map<string, T[]>()
  for (const w of list) {
    const l = by.get(w.platform)
    if (l) l.push(w)
    else by.set(w.platform, [w])
  }
  const out: T[] = []
  const titles = new Set<string>()
  const longest = Math.max(0, ...[...by.values()].map((l) => l.length))
  for (let i = 0; i < longest; i++) {
    for (const l of by.values()) {
      const w = l[i]
      if (w && !titles.has(w.title)) {
        titles.add(w.title)
        out.push(w)
      }
    }
  }
  return out
}

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

/** 기사 속 정기 공개 일정. "닥터X"처럼 기사가 줄여 쓴 제목도 앞부분(3글자 이상)이 같으면 찾는다. 단 "김연경"(시즌1) ≠ "김연경2" */
function weeklyOf(s: Store, w: Work) {
  if (w.type === '영화' || !s.weekly) return undefined
  const t = norm(w.title), since = addDays(today(), -60) // 두 달 넘은 글의 편성은 바뀌었을 수 있다
  const k = s.weekly[t] ? t : Object.keys(s.weekly).filter((k) => k.length >= 3 && t.startsWith(k) && !/^\d/.test(t.slice(k.length))).sort((a, b) => b.length - a.length)[0]
  return k && s.weekly[k].from >= since ? s.weekly[k] : undefined
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
      id: w.id, title: w.title, platform: w.platform, type: w.type, date: w.date, time: w.time, next: w.next, nextTime: w.nextTime, weekly: weeklyOf(s, w), dateText: w.dateText,
      genre: w.genre, poster: w.poster, backdrop: w.backdrop, rank: w.rank, longRun: w.longRun,
      overview: w.overview, // 카드에 두 줄 소개로 보인다
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
    // 오늘 공개작은 공개 확인 단계에서 released가 돼도 오늘 하루는 공개 예정·기대작에 남긴다
    const upcoming = group(works.filter((w) => (w.status === 'upcoming' || w.date === t) && (w.date ? w.date >= t : !vaguePast(w.dateText, t))).map(out))
    // 메인 목록은 화면에서 플랫폼별로 걸러 10개를 보여 주므로 넉넉히(최대 40개) 순서만 정해 보낸다
    // 기대작(OTT만): 60일 안에 공개되는 드라마·시즌제 예능 중 기사가 많이 나온 순
    // 오늘 공개작(서비스 중인 OTT 오리지널의 새 회차·시즌 포함)은 기사 수와 상관없이 맨 앞
    const today_ = available.filter((w) => main(w) && w.date === t).map(out)
    const soon = group([...upcoming, ...today_])
      .filter((w) => main(w) && w.date && w.date >= t && w.date <= addDays(t, 60))
      .sort((a, b) => Number(b.date === t) - Number(a.date === t) || (b.buzz ?? 0) - (a.buzz ?? 0) || a.date!.localeCompare(b.date!))
      .slice(0, 40)
    const tn = s.theater.now.map(out)
    const oa = group(available.map(out))
    // 지금 인기(OTT만): 드라마·시즌제 예능 중 한국어 작품 → 드라마 → TMDB 인기 점수 순, 플랫폼이 번갈아 나오게
    const picks = available
      .filter(main)
      .sort((a, b) => Number(!!b.ko) - Number(!!a.ko) || Number(b.type === '드라마') - Number(a.type === '드라마') || (b.pop ?? 0) - (a.pop ?? 0))
    const now = interleave(picks).slice(0, 40).map(out)

    const ev = (w: Work): CalEvent => ({ id: w.id, date: w.date!, platform: w.platform, type: w.type, title: w.title, time: w.time, source: w.source, via: w.via, poster: w.poster })
    const events = group([...works.map(out), ...tn, ...s.theater.soon.map(out)].filter((w) => w.date).map(ev), true)

    return {
      hot: { soon, now },
      ott: { upcoming, available: oa }, // 플랫폼 필터가 화면에서 걸리므로 자르지 않는다
      theater: { now: tn, soon: s.theater.soon.map(out) },
      events,
      updatedAt: s.collectedAt,
    }
  }

  /** 상세 창: 목록에는 없는 줄거리·출처 기사·TMDB 링크까지 */
  async detail(id: string): Promise<WorkDetail> {
    const s = await this.store.load()
    const w = s.works.find((x) => x.id === id)
    if (w) {
      // 같은 작품의 다른 플랫폼 (목록의 "+2"와 같은 묶음)
      const mates = s.works.filter((x) => norm(x.title) === norm(w.title) && (PLATFORMS as readonly string[]).includes(x.platform))
      const news = mates.flatMap((x) => x.sources).filter((x) => x.title !== 'TMDB')
      return {
        id: w.id, title: w.title, platform: w.platform, type: w.type, date: w.date, time: w.time, weekly: weeklyOf(s, w), dateText: w.dateText, poster: w.poster, backdrop: w.backdrop,
        overview: w.overview, via: w.dateBy ?? 'news', platforms: [...new Set([w.platform, ...mates.map((x) => x.platform)])],
        tmdbUrl: w.tmdbId ? `https://www.themoviedb.org/${w.tmdbMedia ?? 'tv'}/${w.tmdbId}` : undefined,
        sources: [...new Map(news.map((x) => [x.link, x])).values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20),
      }
    }
    const other = [...s.ottAvailable, ...s.theater.now, ...s.theater.soon].find((x) => x.id === id)
    if (!other) throw new NotFoundException()
    const { pop: _pop, ko: _ko, ...rest } = other as typeof other & { pop?: number; ko?: boolean }
    return { ...rest, weekly: weeklyOf(s, rest), sources: [] }
  }
}
