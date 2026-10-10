import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import type { CalEvent, HomeData, StoredWork, Work } from './dto.js'
import { addDays, today } from '../config.js'
import { StoreService } from '../store/store.service.js'

@Injectable()
export class HomeService {
  constructor(private store: StoreService) {}

  async build(): Promise<HomeData> {
    const [s, likes] = await Promise.all([this.store.load(), this.store.likes()])
    // 모은 데이터가 하나도 없으면 화면이 시안 예시 데이터를 쓰도록 503
    if (!s.works.length && !s.ottAvailable.length && !s.theater.now.length) throw new ServiceUnavailableException('아직 수집된 데이터가 없습니다')
    const t = today()

    const out = (w: Work | StoredWork): Work => ({
      id: w.id, title: w.title, platform: w.platform, type: w.type, date: w.date, dateText: w.dateText,
      genre: w.genre, poster: w.poster, source: 'sources' in w ? w.sources.at(-1)?.link : w.source, likes: likes[w.id] ?? 0,
    })

    // 규칙 추출이라 잘못 뽑힌 제목이 섞일 수 있다. TMDB에 있거나 기사 2개 이상에 나온 작품만 보여 준다
    const works = s.works.filter((w) => w.tmdbId || w.sources.length >= 2)
    const upcoming = works.filter((w) => w.status === 'upcoming' && (!w.date || w.date >= t)).map(out)
    const soon = upcoming
      .filter((w) => w.date && w.date >= t && w.date <= addDays(t, 30))
      .sort((a, b) => b.likes! - a.likes! || a.date!.localeCompare(b.date!))
      .slice(0, 4)
    const tn = s.theater.now.map(out)
    const oa = s.ottAvailable.map(out)
    // 지금 인기: 극장 1·2위와 OTT 인기 1·2위를 번갈아
    const now: Work[] = []
    for (const [w, rank] of [[tn[0], '상영중 1위'], [oa[0], 'OTT 1위'], [tn[1], '상영중 2위'], [oa[1], 'OTT 2위']] as const) {
      if (w) now.push({ ...w, rank })
    }

    const ev = (w: Work): CalEvent => ({ date: w.date!, platform: w.platform, type: w.type, title: w.title, source: w.source })
    const events = [...works.map(out), ...tn, ...s.theater.soon.map(out)].filter((w) => w.date).map(ev)

    return {
      hot: { soon, now },
      ott: { upcoming, available: oa.slice(0, 12) },
      theater: { now: tn, soon: s.theater.soon.map(out) },
      events,
    }
  }
}
