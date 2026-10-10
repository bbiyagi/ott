import { BadRequestException, Body, Controller, Get, Headers, Param, Post, UnauthorizedException } from '@nestjs/common'
import { env, missingKeys, today } from '../config.js'
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

  /** 기대돼요/추천해요. on=false면 취소 */
  @Post('likes/:id')
  async like(@Param('id') id: string, @Body() body: { on?: boolean }) {
    if (!/^[\w-]{1,40}$/.test(id)) throw new BadRequestException()
    return { likes: await this.store.like(id, body?.on === false ? -1 : 1) }
  }

  @Get('health')
  health() {
    return { ok: true, storage: this.store.kind, missingKeys: missingKeys(), today: today() }
  }

  /** 예약 수집. CRON_SECRET이 있으면 Authorization: Bearer <CRON_SECRET> 필요 */
  @Get('collect')
  run(@Headers('authorization') auth?: string) {
    const secret = env('CRON_SECRET')
    if (secret ? auth !== `Bearer ${secret}` : env('VERCEL')) throw new UnauthorizedException()
    return this.collect.run()
  }
}
