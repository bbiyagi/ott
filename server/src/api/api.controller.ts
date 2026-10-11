import { Controller, Get, Header, Headers, HttpCode, Param, Post, UnauthorizedException } from '@nestjs/common'
import { env, keyHints, missingKeys, today } from '../config.js'
import { CollectService } from '../collect/collect.service.js'
import { StoreService } from '../store/store.service.js'
import { HomeService } from './home.service.js'

@Controller()
export class ApiController {
  constructor(private home: HomeService, private store: StoreService, private collect: CollectService) {}

  @Get('home')
  getHome() {
    return this.home.build()
  }

  @Get('health')
  async health() {
    const { collectedAt, lastReport } = await this.store.load()
    return { ok: true, storage: this.store.kind, missingKeys: missingKeys(), keys: keyHints(), redisVars: this.store.redisVars, today: today(), collectedAt, lastReport }
  }

  /** 작품 상세 창 */
  // 출처 기사는 하루 두 번 수집 때만 바뀐다. Vercel 엣지에 5분 저장해 다시 열 때는 바로 뜨게
  @Header('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600')
  @Get('works/:id')
  work(@Param('id') id: string) {
    return this.home.detail(id)
  }

  /** 화면의 새로고침 버튼: 기사·TMDB·KOBIS를 다시 불러온다 (10분에 한 번) */
  @Post('refresh')
  @HttpCode(200)
  refresh() {
    return this.collect.refresh()
  }

  /** 예약 수집. CRON_SECRET이 있으면 Authorization: Bearer <CRON_SECRET> 필요 */
  @Get('collect')
  run(@Headers('authorization') auth?: string) {
    const secret = env('CRON_SECRET')
    if (secret ? auth !== `Bearer ${secret}` : env('VERCEL')) throw new UnauthorizedException()
    return this.collect.run()
  }
}
