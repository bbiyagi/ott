// 규칙 추출 확인 (실제 기사 제목·요약에서 가져온 예): npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { extract, pickDate, pickWhen, ottMentions, timeFor, vague, weeklyFor, weeklyIn, weeklyTitle } from './extract.service.js'

const art = (pub: string, title: string, description: string) => ({ title, description, link: title, pubDate: `${pub}T03:00:00Z` })
const one = (pub: string, title: string, description: string) =>
  extract([art(pub, title, description)]).map(({ title, platform, type, date, dateText }) => ({ title, platform, type, date, dateText }))

test('요약 문장의 작품명·플랫폼·날짜', () => {
  assert.deepEqual(one('2026-10-10', "넷플릭스 '꿀알바' 신박한 생계형 호러로 부산 열광시켰다 [BIFF기획]",
    "넷플릭스 오리지널 시리즈 '꿀알바'(총 8부작)는 오는 10월 30일 오직 넷플릭스를 통해 전 세계에 공개될 예정이다."),
  [{ title: '꿀알바', platform: '넷플릭스', type: '드라마', date: '2026-10-30', dateText: null }])
})

test('요약에 작품명이 없으면 제목의 작품명, 플랫폼은 기사 전체에서', () => {
  assert.deepEqual(one('2026-10-08', '남지현 “김재영과 호흡? 100점 만점에 110점” (내가 떨릴 수 있게)',
    "배우 남지현과 김재영이 티빙 오리지널 ‘내가 떨릴 수 있게’(극본 안새봄)를 선보일 예정이다. ‘내가 떨릴 수 있게’는 15일 1화부터 4화까지 동시 공개된다."),
  [{ title: '내가 떨릴 수 있게', platform: '티빙', type: '드라마', date: '2026-10-15', dateText: null }])
})

test('발표일(기사 날짜)이 아니라 공개일을 고른다', () => {
  assert.equal(one('2026-10-02', "손석구·에이타 '푸른길', 11월 20일 공개…한일 공조 범죄 수사극",
    "넷플릭스는 2일 \"새 오리지널 시리즈 '푸른길'의 공개일을 오는 11월 20일로 확정했다\"고 밝혔다.")[0].date, '2026-11-20')
})

test('영화·디즈니+·다음 달', () => {
  const r = one('2026-10-10', '"도파민 터지는 \'재혼황후\' 기대해주세요"', "‘재혼황후’는 다음 달 4일 디즈니플러스를 통해 공개될 예정이다.")
  assert.deepEqual(r.map((x) => [x.title, x.platform, x.date]), [['재혼황후', '디즈니+', '2026-11-04']])
  assert.equal(one('2026-10-10', "조여정, 부산서 전한 미소…'가능한 사랑' 넷플릭스 공개 예고",
    '극장 상영을 마친 뒤 오는 11월 6일 넷플릭스를 통해 전 세계에 공개될 예정으로, 전도연이 출연하는 영화다.')[0].type, '영화')
})

test('이미 공개된 작품, 관계없는 기사는 뺀다', () => {
  assert.deepEqual(one('2026-10-03', '‘스캔들’ 효과 이 정도였나…지창욱, 파리 패션위크서 현지 팬 환호',
    '지난 9월 18일 공개된 넷플릭스 시리즈 ‘스캔들’은 공개 직후 화제를 모았다.'), [])
  assert.deepEqual(one('2026-10-10', "조롱하듯 돌아온 유출범, 끝나지 않은 'GTA6 유출 사태'",
    "한편, GTA6는 오는 11월 19일 PS5 및 Xbox Series X/S를 통해 정식 출시될 예정이다."), [])
})

test('작품명 뒤 괄호는 뗀다', () => {
  assert.equal(one('2026-10-09', '[이번주 뭐보지] 예능 공개', "티빙 예능 '필승 원더독스'(이하 원더독스)는 오는 11일 공개된다.")[0]?.title, '필승 원더독스')
  assert.equal(one('2026-10-09', '예능 공개', "티빙 예능 '필승 원더독스(이하 원더독스)'는 오는 11일 공개된다.")[0]?.title, '필승 원더독스')
  // 웨이브는 다루지 않는다
  assert.deepEqual(one('2026-10-09', '예능 공개', "웨이브 예능 '필승 원더독스'는 오는 11일 공개된다."), [])
})

test('날짜 해석', () => {
  assert.equal(pickDate('오는 3일 공개', '2026-10-28'), '2026-11-03')
  assert.equal(pickDate('1월 5일 공개', '2026-12-20'), '2027-01-05')
  assert.equal(pickDate('메리 베리 러브 오늘(7일) 공개', '2026-10-07'), '2026-10-07')
  assert.equal(pickDate('6박 7일간 펼쳐지는', '2026-10-01'), null)
  assert.equal(vague('올 4분기 공개 예정인 오리지널 예능', '2026-10-09'), '4분기')
  assert.equal(vague('오는 11월 디즈니플러스 오리지널 시리즈로도 공개될 예정', '2026-10-09'), '11월 중')
  assert.equal(vague('내년 공개 예정인 디즈니+', '2026-10-09'), null)
})

test('공개 시각', () => {
  const w = (s: string, pub = '2026-10-05') => pickWhen(s, pub)
  assert.deepEqual(w('공개일은 9일 금요일 오후 5시다'), { date: '2026-10-09', time: '17:00' })
  assert.deepEqual(w('오는 24일 밤 10시 50분 첫 방송'), { date: '2026-10-24', time: '22:50' })
  assert.deepEqual(w('3일 낮 12시 티빙에서 독점 공개', '2026-10-01'), { date: '2026-10-03', time: '12:00' })
  assert.deepEqual(w('오늘(27일) 오후 6시 공개', '2026-10-27'), { date: '2026-10-27', time: '18:00' })
  assert.deepEqual(w('10일(토) 오후 9시 10분 첫 방송'), { date: '2026-10-10', time: '21:10' })
  assert.deepEqual(w('11월 20일 17시 공개'), { date: '2026-11-20', time: '17:00' })
  // 시각이 없거나 오전·오후를 알 수 없으면 날짜만
  assert.deepEqual(w('오는 9일 공개'), { date: '2026-10-09' })
  assert.deepEqual(w('9일 5시 공개'), { date: '2026-10-09' })
  assert.deepEqual(w('9일 밤 12시 공개'), { date: '2026-10-09' })
  // TV 방송 시각은 OTT 공개 시각이 아니라 버린다
  assert.equal(extract([{ title: "넷플릭스 '100일의 거짓말'", description: "tvN '100일의 거짓말'은 10일 밤 9시 10분 첫 방송되며 넷플릭스에서도 공개된다.", link: 'y', pubDate: '2026-10-05T09:00:00+09:00' }])[0]?.time, undefined)
  assert.equal(extract([{ title: "넷플릭스 '나를 충전해줘' 공개", description: "넷플릭스 시리즈 '나를 충전해줘'는 9일 오후 5시 공개된다.", link: 'x', pubDate: '2026-10-05T09:00:00+09:00' }])[0]?.time, '17:00')
})

test('매주 공개 일정 (OTT 공개만)', () => {
  assert.deepEqual(weeklyIn("'원수는 외야석에서'는 매주 월요일 오후 6시 티빙에서 공개된다"), { days: '월', time: '18:00' })
  assert.deepEqual(weeklyIn("디즈니+ '파이널 테이블'은 10월 25일부터 매주 일, 월요일 공개된다"), { days: '일·월' })
  assert.deepEqual(weeklyIn("'술래게임'은 총 10부작으로, 매주 수요일 2회씩 디즈니+에서 공개된다"), { days: '수', per: 2 })
  // TV 방송 시각은 OTT 공개 시각이 아니라 "방송 후 공개"로
  assert.deepEqual(weeklyIn("'100일의 거짓말'은 매주 토요일과 일요일 오후 9시 10분 tvN에서 방송된다"), { days: '토·일', time: '21:10', after: 'tvN' })
  assert.deepEqual(weeklyIn("'용감한 형사들5'는 매주 금요일 밤 9시 50분 방송되며 넷플릭스에서도 공개된다"), { days: '금', time: '21:50', after: 'TV' })
  assert.equal(weeklyIn("매주 금ㆍ토요일 시청자들과 만날 예정이다"), null)
  assert.equal(weeklyTitle("'환승연애4' 후속 '원수는 외야석에서'는 매주 월요일 오후 6시 공개"), '원수는 외야석에서')
  assert.equal(weeklyTitle("매주 월요일 오후 6시 티빙을 통해 공개되는 '원수는 외야석에서'는"), '원수는 외야석에서')
  assert.equal(weeklyTitle("'나를 충전해줘' 리뷰. KBS2 '영화가 좋다'는 매주 토요일 오전 10시 10분"), undefined)
  assert.equal(weeklyTitle('(일본 Nippon TV 매주 수요일 방송) 〈푸른길〉 손석구'), undefined)
  assert.equal(weeklyIn('매주 일정이 공개된다'), null)
  assert.equal(weeklyIn('매주 9일 금요일 밤 9시 50분 공개'), null)
})

test('TV 첫 방송은 방송 후 공개로', () => {
  const a = (d: string) => extract([{ title: "디즈니+ '파이널 테이블'", description: d, link: 'z', pubDate: '2026-10-05T09:00:00+09:00' }])
  // TV 첫 방송은 "방송 후 공개"로, 시각은 버린다
  const tv = a("'파이널 테이블'은 오는 24일 오후 10시 40분 JTBC에서 첫 방송된다.")[0]
  assert.deepEqual([tv?.date, tv?.time, tv?.after], ['2026-10-24', undefined, 'JTBC'])
  // 기사 요약에서 채널 이름이 빠져도 "첫 방송"은 TV 방송
  assert.equal(a("디즈니+ '파이널 테이블'은 오는 24일 오후 10시 40분에 첫 방송된다.")[0]?.after, 'TV')
  // TV 기사에서 OTT가 다른 문장(배우의 예전 작품)에만 나오면 플랫폼으로 쓰지 않는다
  assert.deepEqual(extract([{ title: "안효섭 '파이널 테이블' 셰프 변신", description: "넷플릭스 '사내맞선'으로 사랑받은 안효섭. 넷플릭스에서 시청자를 만났던 그. '파이널 테이블'은 24일 JTBC에서 첫 방송된다.", link: 'q', pubDate: '2026-10-05T09:00:00+09:00' }]), [])
  // "OTT로는 …에서 시청" 문장의 OTT마다
  assert.deepEqual(extract([{ title: "'신인감독 김연경2' 오늘 첫 방송", description: "MBC '신인감독 김연경2'는 11일 오후 9시 10분 첫 방송된다. OTT로는 넷플릭스, 티빙에서 시청할 수 있다.", link: 'k', pubDate: '2026-10-10T09:00:00+09:00' }]).map((x) => [x.platform, x.date, x.after]),
    [['넷플릭스', '2026-10-11', 'MBC'], ['티빙', '2026-10-11', 'MBC']])
  // 회차 방송 소식은 새 작품이 아니다
  assert.deepEqual(a("디즈니+ '파이널 테이블' 3회는 오는 26일 JTBC에서 방송된다."), [])
  // 같은 글에 OTT 공개일이 있으면 그쪽
  assert.deepEqual(a("'파이널 테이블'은 24일 JTBC에서 첫 방송된다. 디즈니+ '파이널 테이블'은 25일 공개된다.").map((x) => [x.date, x.after]), [['2026-10-25', undefined]])
  assert.equal(a("디즈니+ '파이널 테이블'은 25일 오후 4시 공개된다.")[0]?.date, '2026-10-25')
})

test('블로그에서 작품별 일정', () => {
  const b = (title: string, description: string) => [{ title, description, link: 'b', pubDate: '2026-10-11T00:00:00+09:00' }]
  // 블로그는 따옴표 없이 쓴다
  assert.deepEqual(weeklyFor('신인감독 김연경2', b('신인감독 김연경2 선수 명단 총정리', 'MBC 신인감독 김연경2 공식 포스터 방송: MBC 매주 일요일 밤 9시 10분 첫 방송: 2026년 10월 11일 OTT: 넷플릭스'), '2026-10-11'),
    [{ days: '일', time: '21:10', after: 'MBC', title: '신인감독 김연경2', from: '2026-10-11' }])
  // "방송되며, OTT로는 티빙에서 시청"은 방송 시각
  assert.deepEqual(weeklyFor('신인감독 김연경2', b('x', "'신인감독 김연경2'는 매주 일요일 오후 9시 10분에 방송되며, OTT로는 티빙, 웨이브에서 시청할 수 있다."), '2026-10-11')[0]?.after, 'TV')
  // 지난 시즌 기사, 오래된 글은 쓰지 않는다
  assert.deepEqual(weeklyFor('신인감독 김연경2', b('x', "'신인감독 김연경'은 매주 토요일 오후 8시 30분 MBC에서 방송된다."), '2026-10-11'), [])
  assert.deepEqual(weeklyFor('신인감독 김연경2', b('신인감독 김연경2', '매주 일요일 오후 9시 10분 MBC 방송'), '2027-01-01'), [])
  // 순위 기사의 "매주 수요일 순위 공개"는 작품 일정이 아니다
  assert.deepEqual(weeklyFor('포핸즈', b('x', "'포핸즈' 넷플릭스 톱10 3위. 넷플릭스 톱10 사이트는 매주 수요일 새벽 순위를 공개한다."), '2026-10-11'), [])
  assert.deepEqual(weeklyFor('루키', b('루키 출연진', '루키는 매주 수요일 오후 8시 45분 tvN 방송'), '2026-10-11'), [])
  // 다른 작품 이야기는 붙이지 않는다
  assert.deepEqual(weeklyFor('신인감독 김연경2', b('주말 예능 정리', "KBS2 '영화가 좋다'는 매주 토요일 오전 10시 10분 방송된다"), '2026-10-11'), [])
})

test('작품별 공개 시각 (뉴스·블로그)', () => {
  const b = (title: string, description: string, pub = '2026-10-08') => ({ title, description, link: title, pubDate: `${pub}T10:00:00+09:00` })
  assert.equal(timeFor('나를 충전해줘', '2026-10-09', [b('넷플릭스 신작', "'나를 충전해줘'의 공개일은 9일 금요일 오후 5시다.")]), '17:00')
  // 블로그: 따옴표 없이, 그날 쓴 "오늘 오후 4시 공개"
  assert.equal(timeFor('파이널 테이블', '2026-10-25', [b('파이널 테이블 공개 시간 정리', '디즈니플러스 파이널 테이블 오늘 오후 4시 공개 예정', '2026-10-25')]), '16:00')
  // TV 방송 시각, 다른 작품, 다른 날짜는 쓰지 않는다
  assert.equal(timeFor('파이널 테이블', '2026-10-25', [b('x', "'파이널 테이블'은 25일 오후 10시 40분 JTBC에서 공개된다.")]), undefined)
  assert.equal(timeFor('파이널 테이블', '2026-10-25', [b('x', "'꿀알바'는 25일 오후 5시 넷플릭스에서 공개된다.")]), undefined)
  assert.equal(timeFor('파이널 테이블', '2026-10-25', [b('x', "'파이널 테이블'은 24일 오후 5시 공개된다.")]), undefined)
  // 여러 글이 다르면 가장 많이 나온 시각
  assert.equal(timeFor('꿀알바', '2026-10-30', [b('a', "'꿀알바'는 30일 오후 5시 공개된다."), b('b', "'꿀알바'는 30일 오후 5시 공개."), b('c', "'꿀알바'는 30일 오후 4시 공개.")]), '17:00')
})

test('방송 작품이 OTT에도 올라온다는 글 수', () => {
  const b = (link: string, title: string, description: string) => ({ title, description, link, pubDate: '2026-10-11T00:00:00+09:00' })
  const arts = [
    b('1', '신인감독 김연경2 정보', '방송: MBC 매주 일요일 밤 9시 10분 OTT: 웨이브, 티빙, 넷플릭스'),
    b('2', '신인감독 김연경2 첫방', '매주 일요일 오후 9시 10분에 방송되며, OTT로는 티빙, 웨이브에서 시청할 수 있다.'),
    b('3', '김연경 인터뷰', '신인감독 김연경2 출연. 넷플릭스 예능 다른 작품도 화제'),
    b('4', '김연경 근황', '신인감독 김연경2 촬영 중. 넷플릭스 새 예능도 공개된다'),
  ]
  assert.equal(ottMentions('신인감독 김연경2', '티빙', arts), 2)
  assert.equal(ottMentions('신인감독 김연경2', '넷플릭스', arts), 1) // 3·4번 글의 넷플릭스는 다른 작품 이야기
})
