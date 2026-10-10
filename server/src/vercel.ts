// Vercel 함수 진입점 (api/index.js가 이 파일을 내보낸다)
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createApp } from './app.js'

type Handler = (req: IncomingMessage, res: ServerResponse) => void
let ready: Promise<Handler> | undefined

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  ready ??= createApp().then(async (app) => {
    await app.init()
    return app.getHttpAdapter().getInstance() as Handler
  })
  ;(await ready)(req, res)
}
