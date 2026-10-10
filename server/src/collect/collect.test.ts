// 작품 병합 규칙 확인: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Store } from '../api/dto.js'
import type { Article } from '../sources/naver-news.service.js'
import type { ExtractedWork } from '../sources/extract.service.js'
import { CollectService } from './collect.service.js'

Object.assign(process.env, { TODAY_OVERRIDE: '2026-10-08', NAVER_CLIENT_ID: 'x', NAVER_CLIENT_SECRET: 'x', ANTHROPIC_API_KEY: 'x' })
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
