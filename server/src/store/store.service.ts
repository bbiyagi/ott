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
  // Vercel에서 Upstash를 연결할 때 접두어를 붙일 수 있다 (예: STORAGE_KV_REST_API_URL). 끝 이름으로 찾는다
  private redis = (() => {
    const find = (...ends: string[]) => {
      const k = Object.keys(process.env).find((name) => ends.some((e) => name.endsWith(e)) && env(name))
      return k ? env(k) : undefined
    }
    const url = find('UPSTASH_REDIS_REST_URL', 'KV_REST_API_URL')
    const token = find('UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_TOKEN')
    return url && token ? new Redis({ url, token }) : null
  })()

  /** 진단용: Redis 관련 환경 변수 "이름"만 (값은 보이지 않는다) */
  get redisVars() {
    return Object.keys(process.env).filter((k) => /REDIS|KV_/.test(k)).sort()
  }

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
