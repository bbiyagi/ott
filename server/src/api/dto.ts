// 화면 src/data/mock.ts 타입과 같이 고친다
export interface Work {
  id: string
  title: string
  platform: string // 넷플릭스·티빙·디즈니+·쿠팡플레이·웨이브·극장
  type: string // 영화·드라마·예능·애니메이션
  date: string | null // YYYY-MM-DD. 애매하면 null + dateText
  dateText?: string
  likes?: number
  rank?: string
  genre?: string
  source?: string
  poster?: string
}

export interface CalEvent { date: string; platform: string; type: string; title: string; source?: string }

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
  tmdbId?: number | null // null = 찾아봤지만 없음
  overview?: string
}

export interface Store {
  works: StoredWork[]
  seen: string[] // 이미 처리한 기사 링크
  ottAvailable: Work[]
  theater: { now: Work[]; soon: Work[] }
  collectedAt?: string
}
