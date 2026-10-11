import { Injectable } from '@nestjs/common'
import { env } from '../config.js'

export interface Article { title: string; description: string; link: string; pubDate: string }

const ENTITIES: Record<string, string> = { '&quot;': '"', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&apos;': "'", '&#39;': "'" }
const clean = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&(quot|amp|lt|gt|apos|#39);/g, (m) => ENTITIES[m]).trim()

// 네이버 검색 API(뉴스·블로그). 하루 25,000회 무료. 블로그는 작품별 공개 일정을 찾을 때만 쓴다
@Injectable()
export class NaverNewsService {
  async search(query: string, kind: 'news' | 'blog' = 'news', retry = true): Promise<Article[]> {
    const u = new URL(`https://openapi.naver.com/v1/search/${kind}.json`)
    u.searchParams.set('query', query)
    u.searchParams.set('display', '100') // API 최대값
    u.searchParams.set('sort', 'date')
    const r = await fetch(u, {
      headers: { 'X-Naver-Client-Id': env('NAVER_CLIENT_ID')!, 'X-Naver-Client-Secret': env('NAVER_CLIENT_SECRET')! },
    })
    if (r.status === 429 && retry) {
      await new Promise((ok) => setTimeout(ok, 1000))
      return this.search(query, kind, false)
    }
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
}
