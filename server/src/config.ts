// 키는 server/.env(로컬) 또는 Vercel 환경 변수에만 둔다
export const env = (k: string) => process.env[k]?.trim() || undefined

const KEYS = {
  naver: ['NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET'],
  tmdb: ['TMDB_TOKEN'],
  kobis: ['KOBIS_KEY'],
} as const

export const has = (name: keyof typeof KEYS) => KEYS[name].every((k) => env(k))
export const missingKeys = () => Object.values(KEYS).flat().filter((k) => !env(k))

/** 오늘(한국 시간) YYYY-MM-DD. 테스트 때는 TODAY_OVERRIDE로 고정 */
export const today = () => env('TODAY_OVERRIDE') ?? new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })

export function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
