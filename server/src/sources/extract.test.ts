// 규칙 추출 확인 (실제 기사 제목·요약에서 가져온 예): npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { extract, pickDate, vague } from './extract.service.js'

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
  assert.equal(one('2026-10-09', '[이번주 뭐보지] 예능 공개', "티빙 예능 '필승 원더독스'(이하 원더독스)는 오는 11일 첫 방송된다.")[0]?.title, '필승 원더독스')
  assert.equal(one('2026-10-09', '예능 공개', "티빙 예능 '필승 원더독스(이하 원더독스)'는 오는 11일 첫 방송된다.")[0]?.title, '필승 원더독스')
  // 웨이브는 다루지 않는다
  assert.deepEqual(one('2026-10-09', '예능 공개', "웨이브 예능 '필승 원더독스'는 오는 11일 첫 방송된다."), [])
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
