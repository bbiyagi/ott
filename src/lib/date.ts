export const DOW = ['일', '월', '화', '수', '목', '금', '토']

const pad = (n: number) => String(n).padStart(2, '0')
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
export const sameDay = (a: Date, b: Date) => iso(a) === iso(b)

// 오늘은 한국 시간 기준
export const TODAY = parse(new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }))

/** 10.14 (수) */
export const fmt = (s: string) => { const d = parse(s); return `${d.getMonth() + 1}.${d.getDate()} (${DOW[d.getDay()]})` }
/** 10.14 */
export const md = (s: string) => { const d = parse(s); return `${d.getMonth() + 1}.${d.getDate()}` }
/** 10월 8일 목요일 */
export const longDay = (d: Date) => `${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일`

export const dowCls = (i: number) => (i === 0 ? 'sun' : i === 6 ? 'sat' : 'muted')
