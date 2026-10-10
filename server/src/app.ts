import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
// 어댑터를 직접 import한다. Nest가 이름으로 불러오면 Vercel 번들러가 따라가지 못해 함수에서 빠진다
import { ExpressAdapter } from '@nestjs/platform-express'
import { AppModule } from './app.module.js'

export async function createApp() {
  const app = await NestFactory.create(AppModule, new ExpressAdapter(), { logger: ['log', 'warn', 'error'] })
  app.setGlobalPrefix('api')
  return app
}
