// 로컬 개발 서버 (Vercel에서는 vercel.ts)
import { Logger } from '@nestjs/common'
import { createApp } from './app.js'
import { missingKeys } from './config.js'

const app = await createApp()
const port = Number(process.env.API_PORT ?? 3000) // PORT는 Vite 쪽이 쓸 수 있어 따로 둔다
await app.listen(port)
const missing = missingKeys()
new Logger('Main').log(`http://localhost:${port}/api/health` + (missing.length ? ` · 없는 키: ${missing.join(', ')}` : ''))
