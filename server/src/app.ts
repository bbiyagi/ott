import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.js'

export async function createApp() {
  const app = await NestFactory.create(AppModule, { logger: ['log', 'warn', 'error'] })
  app.setGlobalPrefix('api')
  return app
}
