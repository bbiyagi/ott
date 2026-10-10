// 작품 병합 규칙 확인: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Store, Work } from '../api/dto.js'
import type { Article } from '../sources/naver-news.service.js'
import type { ExtractedWork } from '../sources/extract.service.js'
import { group, main, vaguePast } from '../api/home.service.js'
import { CollectService, workKey } from './collect.service.js'

Object.assign(process.env, { TODAY_OVERRIDE: '2026-10-08', NAVER_CLIENT_ID: 'x', NAVER_CLIENT_SECRET: 'x' })
delete process.env.TMDB_TOKEN
delete process.env.KOBIS_KEY

function setup() {
  const state: Store = { works: [], seen: [], ottAvailable: [], theater: { now: [], soon: [] } }
  let articles: Article[] = []
  let items: Omit<ExtractedWork, 'article'>[] = []
  const svc = new CollectService(
    { load: async () => state, save: async () => {} } as never,
    { search: async () => articles } as never,
    { run: async (a: Article[]) => items.map((it) => ({ ...it, article: 0 })).slice(0, a.length) } as never,
    {} as never,
    {} as never,
  )
  const feed = async (link: string, pubDate: string, it: Omit<ExtractedWork, 'article'>) => {
    articles = [{ title: link, description: '', link, pubDate }]
    items = [it]
    return svc.run()
  }
  return { state, feed }
}

const work = (date: string | null, dateText: string | null = null) =>
  ({ title: '오징어 게임 3', platform: '넷플릭스' as const, type: '드라마' as const, date, dateText })

test('새 작품을 만들고 같은 작품은 합친다', async () => {
  const { state, feed } = setup()
  await feed('a1', '2026-10-01T00:00:00Z', work('2026-10-20'))
  await feed('a2', '2026-10-02T00:00:00Z', { ...work('2026-10-20'), title: '오징어게임3!' })
  assert.equal(state.works.length, 1)
  assert.equal(state.works[0].sources.length, 2)
})

test('앞부분이 같고 플랫폼·날짜가 같으면 같은 작품', async () => {
  const { state, feed } = setup()
  await feed('a1', '2026-10-01T00:00:00Z', { ...work('2026-10-13'), title: '라스트 스테이지 : 24H' })
  await feed('a2', '2026-10-02T00:00:00Z', { ...work('2026-10-13'), title: '라스트 스테이지' })
  await feed('a3', '2026-10-02T00:00:00Z', { ...work('2026-10-20'), title: '라스트' }) // 날짜가 다르면 다른 작품
  assert.deepEqual(state.works.map((w) => [w.title, w.sources.length]), [['라스트 스테이지 : 24H', 2], ['라스트', 1]])
})

test('시즌 표기가 달라도 같은 작품, 지나간 시기는 공개 예정에서 뺀다', () => {
  assert.equal(workKey('데블스 플랜 시즌3', '넷플릭스'), workKey('데블스플랜3', '넷플릭스'))
  assert.deepEqual(['9월 중', '10월 중', '상반기', '하반기', '3분기', '4분기'].map((x) => vaguePast(x, '2026-10-10')), [true, false, true, false, true, false])
})

test('여러 플랫폼의 같은 작품은 하나로, 대표는 TMDB 날짜 쪽', () => {
  const w = (platform: string, via: 'news' | 'tmdb', title = '100일의 거짓말'): Work => ({ id: platform, title, platform, type: '드라마', date: '2026-10-10', via })
  const g = group([w('넷플릭스', 'news'), w('웨이브', 'tmdb'), w('쿠팡플레이', 'news', '100일의 거짓말 '), w('티빙', 'news', '다른 작품')])
  assert.deepEqual(g.map((x) => [x.title, x.platform, x.platforms]), [['100일의 거짓말', '웨이브', ['웨이브', '넷플릭스', '쿠팡플레이']], ['다른 작품', '티빙', ['티빙']]])
})

test('메인에는 드라마와 시즌제 예능만, 장수 프로그램은 뺀다', () => {
  assert.deepEqual([
    { type: '드라마' }, { type: '예능', longRun: false }, { type: '예능', longRun: true }, { type: '드라마', longRun: true }, { type: '영화' }, { type: '애니메이션' },
  ].map(main), [true, true, false, false, false, false])
})

test('TMDB 날짜는 기사로 덮지 않는다', async () => {
  const { state, feed } = setup()
  await feed('a1', '2026-10-01T00:00:00Z', work('2026-10-20'))
  state.works[0].dateBy = 'tmdb'
  await feed('a2', '2026-10-05T00:00:00Z', work('2026-10-25'))
  assert.equal(state.works[0].date, '2026-10-20')
})

test('애매한 날짜로 정확한 날짜를 덮지 않고, 더 최근 기사의 정확한 날짜는 반영한다', async () => {
  const { state, feed } = setup()
  await feed('a1', '2026-10-01T00:00:00Z', work('2026-10-20'))
  await feed('a2', '2026-10-03T00:00:00Z', work(null, '10월 중'))
  assert.equal(state.works[0].date, '2026-10-20')
  await feed('a3', '2026-10-04T00:00:00Z', work('2026-10-24'))
  assert.equal(state.works[0].date, '2026-10-24')
  await feed('a4', '2026-09-01T00:00:00Z', work('2026-11-01')) // 더 오래된 기사
  assert.equal(state.works[0].date, '2026-10-24')
})

test('처리한 기사는 다시 추출하지 않는다', async () => {
  const { state, feed } = setup()
  await feed('a1', '2026-10-01T00:00:00Z', work('2026-10-20'))
  const r = await feed('a1', '2026-10-01T00:00:00Z', work('2026-10-30'))
  assert.equal(r.newArticles, 0)
  assert.equal(state.works[0].date, '2026-10-20')
})

test('공개일이 7일 지나면 공개됨, 너무 지난 날짜는 무시', async () => {
  const { state, feed } = setup()
  await feed('a1', '2026-10-01T00:00:00Z', work('2026-09-25'))
  assert.equal(state.works.length, 0)
  await feed('a2', '2026-10-01T00:00:00Z', work('2026-10-01'))
  assert.equal(state.works[0].status, 'released')
})
