import { Module } from '@nestjs/common'
import { ApiController } from './api/api.controller.js'
import { HomeService } from './api/home.service.js'
import { CollectService } from './collect/collect.service.js'
import { ExtractService } from './sources/extract.service.js'
import { KobisService } from './sources/kobis.service.js'
import { NaverNewsService } from './sources/naver-news.service.js'
import { TmdbService } from './sources/tmdb.service.js'
import { StoreService } from './store/store.service.js'

@Module({
  controllers: [ApiController],
  providers: [HomeService, CollectService, StoreService, NaverNewsService, ExtractService, TmdbService, KobisService],
})
export class AppModule {}
