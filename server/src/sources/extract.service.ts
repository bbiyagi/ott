import { Injectable, Logger } from '@nestjs/common'
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import type { Article } from './naver-news.service.js'

export const PLATFORMS = ['넷플릭스', '티빙', '디즈니+', '쿠팡플레이', '웨이브'] as const

const Extracted = z.object({
  works: z.array(z.object({
    article: z.number().int().describe('기사 번호'),
    title: z.string().describe('작품명. 따옴표·괄호·시즌 표기 없이'),
    platform: z.enum(PLATFORMS),
    type: z.enum(['영화', '드라마', '예능', '애니메이션']),
    date: z.string().nullable().describe('하루로 특정되면 YYYY-MM-DD, 아니면 null'),
    dateText: z.string().nullable().describe('date가 null일 때 기사 표현 그대로. 예: 10월 중, 하반기'),
  })),
})
export type ExtractedWork = z.infer<typeof Extracted>['works'][number]

const SYSTEM = `한국 OTT 뉴스 기사 제목·요약에서 "앞으로 공개될" 작품 정보를 뽑는다.
- 대상 플랫폼: 넷플릭스, 티빙, 디즈니+, 쿠팡플레이, 웨이브. 그 밖의 플랫폼이나 극장 개봉작은 뽑지 않는다.
- 공개일이나 공개 시기가 기사에 나온 작품만 뽑는다. 이미 공개된 작품, 제작·캐스팅 소식만 있는 작품은 뺀다.
- 날짜가 하루로 특정되면 date에 YYYY-MM-DD. 연도가 없으면 기사 날짜를 기준으로 가장 가까운 미래로 정한다.
- "10월 중", "하반기", "연내"처럼 애매하면 date는 null, dateText에 기사 표현을 그대로 쓴다.
- 한 기사에 작품이 여러 개면 모두 뽑는다. 해당 작품이 없으면 빈 배열.`

// 기사 → 작품명·플랫폼·구분·공개일. 단순 추출이라 effort low
@Injectable()
export class ExtractService {
  private log = new Logger('Extract')
  private client = new Anthropic()

  async run(articles: Article[], today: string): Promise<ExtractedWork[]> {
    const list = articles.map((a, i) => `[${i}] (${a.pubDate.slice(0, 10)}) ${a.title}\n${a.description}`).join('\n\n')
    const res = await this.client.beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default', // 안전 분류기가 거절하면 서버가 다른 모델로 다시 실행
      output_config: { effort: 'low', format: betaZodOutputFormat(Extracted) },
      system: SYSTEM,
      messages: [{ role: 'user', content: `오늘은 ${today}입니다.\n\n${list}` }],
    })
    if (res.stop_reason === 'refusal') {
      this.log.warn(`추출 거절: ${res.stop_details?.category ?? '-'}`)
      return []
    }
    return res.parsed_output?.works ?? []
  }
}
