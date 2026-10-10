// 화면 src/data/mock.ts 타입과 같이 고친다
export interface Work {
  id: string
  title: string
  platform: string // 넷플릭스·티빙·디즈니+·쿠팡플레이·웨이브·극장
  type: string // 영화·드라마·예능·애니메이션
  date: string | null // YYYY-MM-DD. 애매하면 null + dateText
  dateText?: string
  rank?: string // 지금 인기: "넷플릭스 예능 인기 1위"
  buzz?: number // 기대작: 이 작품을 다룬 기사 수
  genre?: string
  source?: string
  poster?: string // 세로 포스터 (w500)
  backdrop?: string // 가로 스틸 (w1280), 큰 배너용
  platforms?: string[] // 같은 작품이 여러 플랫폼에 있으면 전부 (첫 번째 = platform)
  via?: 'news' | 'tmdb' // 공개일을 어디서 가져왔는지. news는 기사 기준이라 정확하지 않을 수 있다
}

export interface CalEvent { date: string; platform: string; type: string; title: string; source?: string; platforms?: string[]; via?: 'news' | 'tmdb' }

export interface HomeData {
  hot: { soon: Work[]; now: Work[] }
  ott: { upcoming: Work[]; available: Work[] }
  theater: { now: Work[]; soon: Work[] }
  events: CalEvent[]
}

// ---- 저장소 ----
export interface Source { title: string; link: string; date: string }

export interface StoredWork extends Work {
  key: string // 작품명(공백·문장부호 제거) + 플랫폼
  status: 'upcoming' | 'released'
  sources: Source[] // 기사 제목·링크·날짜만. 본문은 저장하지 않는다
  dateFrom?: string // 지금 날짜를 정한 기사의 날짜
  dateBy?: 'news' | 'tmdb' // 지금 날짜의 출처. TMDB 날짜는 기사로 덮지 않는다
  tmdbId?: number | null // null = 찾아봤지만 없음
  tmdbMedia?: 'movie' | 'tv'
  overview?: string
}

export interface Store {
  works: StoredWork[]
  seen: string[] // 이미 처리한 기사 링크
  ottAvailable: (Work & { pop?: number; ko?: boolean })[] // pop = TMDB 인기 점수, ko = 한국어 작품
  theater: { now: Work[]; soon: Work[] }
  collectedAt?: string
}
