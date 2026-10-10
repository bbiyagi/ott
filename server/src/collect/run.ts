// npm run collect: 수집을 한 번 돌리고 결과를 출력
import { createApp } from '../app.js'
import { CollectService } from './collect.service.js'

const app = await createApp()
console.log(JSON.stringify(await app.get(CollectService).run(), null, 2))
await app.close()
