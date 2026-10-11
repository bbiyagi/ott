import { Injectable } from '@nestjs/common'
import { env } from '../config.js'

export interface Article { title: string; description: string; link: string; pubDate: string }

const ENTITIES: Record<string, string> = { '&quot;': '"', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&apos;': "'", '&#39;': "'" }
const clean = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&(quot|amp|lt|gt|apos|#39);/g, (m) => ENTITIES[m]).trim()

// 네이버 검색 API(뉴스·블로그). 하루 25,000회 무료. 블로그는 작품별 공개 일정을 찾을 때만 쓴다
const GAP = 110 // 네이버 API 초당 요청 한도(약 10회) 아래로: 동시에 찾아도 요청 사이를 띄운다

@Injectable()
export class NaverNewsService {
  private last = Promise.resolve()
  /** 모든 요청이 순서대로 GAP씩 띄워 나가게 한다. 429면 1·2·4초 쉬고 다시 (3번까지) */
  private async call(u: URL): Promise<Response> {
    for (let tries = 0; ; tries++) {
      const turn = this.last.then(() => new Promise<void>((ok) => setTimeout(ok, GAP)))
      this.last = turn
      await turn
      const r = await fetch(u, { headers: { 'X-Naver-Client-Id': env('NAVER_CLIENT_ID')!, 'X-Naver-Client-Secret': env('NAVER_CLIENT_SECRET')! } })
      if (r.status !== 429 || tries === 3) return r
      await new Promise((ok) => setTimeout(ok, 1000 * 2 ** tries))
    }
  }

  async search(query: string, kind: 'news' | 'blog' = 'news'): Promise<Article[]> {
    const u = new URL(`https://openapi.naver.com/v1/search/${kind}.json`)
    u.searchParams.set('query', query)
    u.searchParams.set('display', '100') // API 최대값
    u.searchParams.set('sort', 'date')
    const r = await this.call(u)
    if (!r.ok) throw new Error(`네이버 ${kind} ${r.status}`)
    const data = (await r.json()) as { items: { title: string; description: string; originallink?: string; link: string; pubDate?: string; postdate?: string }[] }
    return data.items.map((x) => ({
      title: clean(x.title),
      description: clean(x.description),
      link: x.originallink || x.link,
      // 블로그는 날짜만 (YYYYMMDD)
      pubDate: new Date(x.pubDate ?? x.postdate!.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3T00:00:00+09:00')).toISOString(),
    }))
  }

  /** 네이버 이미지 검색: TMDB에 이미지가 없는 작품용. https 원본 주소와 크기 */
  async images(query: string): Promise<{ title: string; url: string; w: number; h: number }[]> {
    const u = new URL('https://openapi.naver.com/v1/search/image.json')
    u.searchParams.set('query', query)
    u.searchParams.set('display', '30')
    u.searchParams.set('filter', 'large')
    const r = await this.call(u)
    if (!r.ok) throw new Error(`네이버 이미지 ${r.status}`)
    const data = (await r.json()) as { items: { title: string; link: string; sizewidth: string; sizeheight: string }[] }
    return data.items
      .filter((x) => x.link.startsWith('https://')) // http 이미지는 https 페이지에서 막힌다
      .map((x) => ({ title: clean(x.title), url: x.link, w: Number(x.sizewidth), h: Number(x.sizeheight) }))
  }
}
