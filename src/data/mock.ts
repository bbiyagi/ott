// 서버가 없을 때 보여 주는 시안 예시 데이터. 날짜는 오늘 기준으로 만든다.
import { TODAY, addDays, iso } from '../lib/date'

export interface Work {
  id: string
  title: string
  platform: string // 넷플릭스·티빙·디즈니+·쿠팡플레이·극장
  type: string // 영화·드라마·예능·애니메이션
  date: string | null // YYYY-MM-DD. "10월 중"처럼 애매하면 null + dateText
  time?: string // 'HH:MM' 공개 시각 (기사에 적혀 있을 때만)
  after?: string // TV 방송 채널: 그 방송 후 OTT 공개
  next?: string // 다음 회차 OTT 공개일 (OTT 오리지널만)
  nextTime?: string // 다음 회차 공개 시각
  weekly?: { days: string; time?: string; per?: number; after?: string } // 매주 월 오후 6시 공개. after = 방송 채널 (그 방송 후 공개)
  dateText?: string
  rank?: string // 지금 인기: "넷플릭스 예능 인기 1위"
  buzz?: number // 기대작: 이 작품을 다룬 기사 수
  genre?: string
  source?: string // 출처 기사 링크
  poster?: string // 세로 포스터
  backdrop?: string // 가로 스틸 (큰 배너)
  platforms?: string[] // 같은 작품이 여러 플랫폼에 있으면 전부 (첫 번째 = platform)
  via?: 'news' | 'tmdb' // news = 기사에서 모은 날짜라 정확하지 않을 수 있음
  overview?: string // 줄거리. 카드에는 두 줄까지
  tmdbUrl?: string
}

export interface CalEvent { id: string; date: string; platform: string; type: string; title: string; time?: string; after?: string; overview?: string; weekly?: Work['weekly']; source?: string; platforms?: string[]; via?: 'news' | 'tmdb'; poster?: string }

/** 상세 창 (/api/works/:id) */
export interface WorkDetail extends Work { sources: { title: string; link: string; date: string }[] }

export interface HomeData {
  hot: { soon: Work[]; now: Work[] }
  ott: { upcoming: Work[]; available: Work[] }
  theater: { now: Work[]; soon: Work[] }
  events: CalEvent[]
  updatedAt?: string // 마지막 수집 시각
}

const d = (n: number) => iso(addDays(TODAY, n))
const w = (id: string, title: string, platform: string, type: string, day: number | null, extra: Partial<Work> = {}): Work =>
  ({ id, title, platform, type, date: day === null ? null : d(day), ...extra })

// 시안의 evs(): 날짜마다 0~3개 작품을 고르게 흩뿌린다
function events(): CalEvent[] {
  const P = ['넷플릭스', '티빙', '디즈니+', '쿠팡플레이', '극장']
  const T = ['드라마', '예능', '영화', '애니메이션']
  const out: CalEvent[] = []
  const y0 = TODAY.getFullYear()
  for (let x = new Date(y0, 0, 1); x.getFullYear() <= y0 + 1; x = addDays(x, 1)) {
    const y = x.getFullYear(), m = x.getMonth(), day = x.getDate()
    const h = (m * 31 + day * 17 + (y % 10) * 5) % 11
    const n = h < 3 ? 0 : h < 7 ? 1 : h < 9 ? 2 : 3
    for (let i = 0; i < n; i++) {
      const p = P[(m + day + i * 2) % P.length], t = p === '극장' ? '영화' : T[(m * 3 + day + i) % 4]
      out.push({ id: `ev-${iso(x)}-${i}`, date: iso(x), platform: p, type: t, title: `[${t} 제목]` })
    }
  }
  return out
}

export function mock(): HomeData {
  const month = TODAY.getMonth() + 1
  return {
    hot: {
      soon: [
        w('hs1', '[드라마 제목]', '티빙', '드라마', 6, { buzz: 9, via: 'news' }),
        w('hs2', '[시리즈 제목]', '디즈니+', '드라마', 1, { buzz: 6, via: 'tmdb' }),
        w('hs3', '[영화 제목]', '넷플릭스', '영화', 9, { buzz: 4, via: 'news' }),
        w('hs4', '[예능 제목]', '쿠팡플레이', '예능', 15, { buzz: 2, via: 'news' }),
      ],
      now: [
        w('hn1', '[드라마 제목]', '넷플릭스', '드라마', null, { rank: '넷플릭스 드라마 인기 1위' }),
        w('hn2', '[예능 제목]', '티빙', '예능', null, { rank: '티빙 예능 인기 1위' }),
        w('hn3', '[시리즈 제목]', '디즈니+', '드라마', null, { rank: '디즈니+ 드라마 인기 1위' }),
        w('hn4', '[예능 제목]', '쿠팡플레이', '예능', null, { rank: '쿠팡플레이 예능 인기 1위' }),
      ],
    },
    ott: {
      upcoming: [
        w('ou1', '[영화 제목]', '쿠팡플레이', '영화', 1, { via: 'news' }),
        w('ou2', '[시리즈 제목]', '디즈니+', '드라마', 1, { via: 'tmdb' }),
        w('ou3', '[예능 제목]', '넷플릭스', '예능', 2, { via: 'news', platforms: ['넷플릭스', '티빙'] }),
        w('ou4', '[드라마 제목]', '티빙', '드라마', 6, { via: 'tmdb' }),
        w('ou5', '[드라마 제목]', '쿠팡플레이', '드라마', 9, { via: 'news' }),
        w('ou6', '[애니메이션 제목]', '넷플릭스', '애니메이션', null, { dateText: `${month}월 중`, via: 'news' }),
      ],
      available: [
        w('oa1', '[작품 제목]', '넷플릭스', '드라마', null),
        w('oa2', '[작품 제목]', '티빙', '예능', null),
        w('oa3', '[작품 제목]', '디즈니+', '영화', null),
        w('oa4', '[작품 제목]', '쿠팡플레이', '드라마', null),
        w('oa5', '[작품 제목]', '넷플릭스', '영화', null),
        w('oa6', '[작품 제목]', '디즈니+', '애니메이션', null),
      ],
    },
    theater: {
      now: [-14, -8, -7, -7, -1, -1].map((n, i) => w(`tn${i}`, '[영화 제목]', '극장', '영화', n, { genre: '[장르]' })),
      soon: [6, 6, 13, 15, 20, 22].map((n, i) => w(`ts${i}`, '[영화 제목]', '극장', '영화', n, { genre: '[장르]' })),
    },
    events: events(),
  }
}
