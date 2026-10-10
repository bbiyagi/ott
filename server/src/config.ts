// 키는 server/.env(로컬) 또는 Vercel 환경 변수에만 둔다
export const env = (k: string) => process.env[k]?.trim() || undefined

const KEYS = {
  naver: ['NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET'],
  tmdb: ['TMDB_TOKEN'],
  kobis: ['KOBIS_KEY'],
} as const

export const has = (name: keyof typeof KEYS) => KEYS[name].every((k) => env(k))
export const missingKeys = () => Object.values(KEYS).flat().filter((k) => !env(k))

/** 진단용: 값은 숨기고 길이(와 공개되는 ID만 앞 4글자)만. 숨김 변수가 바뀌어 들어갔는지 확인할 때 */
export const keyHints = () =>
  Object.fromEntries(
    Object.values(KEYS).flat().map((k) => {
      const v = process.env[k] ?? ''
      const odd = v !== v.trim() || /["'\s]/.test(v) ? ' (공백·따옴표 섞임)' : ''
      return [k, v ? `${k === 'NAVER_CLIENT_ID' ? `${v.trim().slice(0, 4)}… ` : ''}${v.trim().length}자${odd}` : '없음']
    }),
  )

/** 오늘(한국 시간) YYYY-MM-DD. 테스트 때는 TODAY_OVERRIDE로 고정 */
export const today = () => env('TODAY_OVERRIDE') ?? new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })

export function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
