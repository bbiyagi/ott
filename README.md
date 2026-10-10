# 넥스트씬

OTT(넷플릭스·티빙·디즈니+·쿠팡플레이)와 극장의 "지금 볼 것 + 곧 나올 것"을 캘린더로 보여 주는 웹앱.

- 화면: Vue 3 + Vite (`src/`)
- 서버: NestJS (`server/`), Vercel에서는 `api/index.js` 함수 하나로 돈다
- 데이터: 네이버 뉴스(공개 예정 기사) → 규칙 추출 → TMDB 보강 / 극장은 KOBIS

## 로컬 실행

```bash
npm install
cp server/.env.example server/.env   # 키 채우기
npm run dev        # 화면 :5173 + 서버 :3000
npm run collect    # 수집 한 번 돌리기 (결과: server/data/store.json)
npm test           # 추출·병합 규칙 테스트
```

키가 없거나 서버가 꺼져 있으면, **개발 중에는** 시안 예시 데이터가 보이고 **배포 화면에서는** 안내 문구가 보인다.

## 배포 (Vercel)

1. Vercel에서 이 GitHub 저장소를 Import. 빌드 설정은 `vercel.json`에 있다 (빌드 `npm run build`, 출력 `dist`, `/api/*` → NestJS 함수, 최대 300초).
2. **Storage → Upstash for Redis** 를 만들어 프로젝트에 연결 (`KV_REST_API_URL`/`KV_REST_API_TOKEN` 자동). Vercel은 파일을 저장할 수 없어서 없으면 수집이 실패한다.
3. **Settings → Environment Variables**: `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, `TMDB_TOKEN`, `KOBIS_KEY`, `CRON_SECRET`(임의의 긴 문자열)
4. 배포 후 `https://<주소>/api/health` 에서 `storage: "redis"`, `missingKeys: []` 확인
5. 첫 화면의 **지금 모으기**를 누르거나 헤더 **새로고침**으로 첫 수집
6. GitHub **Settings → Secrets and variables → Actions** 에 `SITE_URL`(https://<주소>), `CRON_SECRET`(3번과 같은 값). 하루 2번(7시·19시) 자동 수집된다. **Actions → collect → Run workflow** 로 바로 시험할 수 있다.

## 운영 메모

- 헤더에 "하루 넘게 업데이트되지 않았어요"가 보이면 예약 수집이 멈춘 것 → GitHub Actions 실행 기록 확인
- 새로고침 버튼은 마지막 수집 뒤 10분 안에는 다시 돌지 않는다
- 키는 `server/.env`(깃 제외)와 Vercel 환경 변수에만 둔다
