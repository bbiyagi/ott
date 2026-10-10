import { Injectable } from '@nestjs/common'
import { env } from '../config.js'

export interface Article { title: string; description: string; link: string; pubDate: string }

const ENTITIES: Record<string, string> = { '&quot;': '"', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&apos;': "'", '&#39;': "'" }
const clean = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&(quot|amp|lt|gt|apos|#39);/g, (m) => ENTITIES[m]).trim()

// 네이버 검색 API(뉴스). 하루 25,000회 무료
@Injectable()
export class NaverNewsService {
  async search(query: string): Promise<Article[]> {
    const u = new URL('https://openapi.naver.com/v1/search/news.json')
    u.searchParams.set('query', query)
    u.searchParams.set('display', '30')
    u.searchParams.set('sort', 'date')
    const r = await fetch(u, {
      headers: { 'X-Naver-Client-Id': env('NAVER_CLIENT_ID')!, 'X-Naver-Client-Secret': env('NAVER_CLIENT_SECRET')! },
    })
    if (!r.ok) throw new Error(`네이버 뉴스 ${r.status}`)
    const data = (await r.json()) as { items: { title: string; description: string; originallink: string; link: string; pubDate: string }[] }
    return data.items.map((x) => ({
      title: clean(x.title),
      description: clean(x.description),
      link: x.originallink || x.link,
      pubDate: new Date(x.pubDate).toISOString(),
    }))
  }
}
