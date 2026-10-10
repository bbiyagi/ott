import { Injectable } from '@nestjs/common'
import { Redis } from '@upstash/redis'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import type { Store } from '../api/dto.js'
import { env } from '../config.js'

const empty = (): Store => ({ works: [], seen: [], ottAvailable: [], theater: { now: [], soon: [] } })
const DIR = 'server/data'

// Vercel(파일 쓰기 불가)에서는 Upstash Redis, 로컬은 Redis 키가 없으면 JSON 파일
@Injectable()
export class StoreService {
  private redis = (() => {
    const url = env('UPSTASH_REDIS_REST_URL') ?? env('KV_REST_API_URL')
    const token = env('UPSTASH_REDIS_REST_TOKEN') ?? env('KV_REST_API_TOKEN')
    return url && token ? new Redis({ url, token }) : null
  })()

  get kind() { return this.redis ? 'redis' : 'file' }

  async load(): Promise<Store> {
    const saved = this.redis ? await this.redis.get<Store>('store') : await this.readFile<Store>('store.json')
    return { ...empty(), ...saved }
  }

  async save(s: Store) {
    s.collectedAt = new Date().toISOString()
    if (this.redis) return void (await this.redis.set('store', s))
    // Vercel은 파일을 쓸 수 없어서 저장이 조용히 사라진다. 원인이 바로 보이게 막는다
    if (env('VERCEL')) throw new Error('Vercel에서는 Upstash Redis 연결이 필요합니다 (Storage > Upstash for Redis)')
    await this.writeFile('store.json', s)
  }

  private async readFile<T>(name: string): Promise<T | null> {
    try { return JSON.parse(await readFile(`${DIR}/${name}`, 'utf8')) } catch { return null }
  }

  private async writeFile(name: string, data: unknown) {
    await mkdir(DIR, { recursive: true })
    await writeFile(`${DIR}/${name}`, JSON.stringify(data, null, 2))
  }
}
