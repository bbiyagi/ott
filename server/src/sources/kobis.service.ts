import { Injectable } from '@nestjs/common'
import { env } from '../config.js'

export interface BoxOffice { rank: number; code: string; title: string; openDt: string | null }

// 영화진흥위원회 KOBIS 일별 박스오피스
@Injectable()
export class KobisService {
  async daily(date: string): Promise<BoxOffice[]> {
    const u = new URL('https://www.kobis.or.kr/kobisopenapi/webservice/rest/boxoffice/searchDailyBoxOfficeList.json')
    u.searchParams.set('key', env('KOBIS_KEY')!)
    u.searchParams.set('targetDt', date.replaceAll('-', ''))
    const r = await fetch(u)
    if (!r.ok) throw new Error(`KOBIS ${r.status}`)
    const data = (await r.json()) as { boxOfficeResult?: { dailyBoxOfficeList: { rank: string; movieCd: string; movieNm: string; openDt: string }[] }; faultInfo?: { message: string } }
    if (!data.boxOfficeResult) throw new Error(`KOBIS ${data.faultInfo?.message ?? '응답 없음'}`)
    return data.boxOfficeResult.dailyBoxOfficeList.map((x) => ({
      rank: Number(x.rank),
      code: x.movieCd,
      title: x.movieNm,
      openDt: /^\d{4}-\d{2}-\d{2}$/.test(x.openDt.trim()) ? x.openDt.trim() : null,
    }))
  }
}
