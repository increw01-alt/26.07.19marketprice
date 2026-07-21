# 종합 시세 사이트

상품권 · 주가지수 · 귀금속 · 환율 · 암호화폐 · 로또 판매 규모를 메뉴별로 봅니다.

<https://26-07-19marketprice.pages.dev>

빌드 도구가 없는 순수 정적 사이트입니다. GitHub Actions가 매시간 시세를 수집해
`data/*.json` 으로 커밋하고, 브라우저는 그 JSON만 읽습니다.

## 구조

```
index.html              홈 (요약)
coin/stock/kosdaq/fx/   메뉴별 페이지. 전부 동일한 껍데기이고
metal/giftcard/         <body data-page="..."> 로 어떤 렌더러를 쓸지 정합니다.
realestate/lotto.html
assets/style.css        스타일
assets/app.js           공용 셸(헤더·메뉴·푸터 주입) + 포맷터 · 카드 · 스파크라인
assets/pages.js         페이지별 렌더러와 라우터 (data-page → ROUTES)
data/lotto.json         회차별 로또 판매 데이터 (자동 수집, 누적)
data/markets.json       지수·귀금속·환율·코인 (자동 수집, 매시간 교체)
data/giftcards-dept.json 백화점 상품권 매입/판매 시세 (자동 수집, 매시간 교체)
data/giftcards.json     기타 상품권 시세 (수동 관리)
data/korea-provinces.json  전국 17개 시도 SVG 경로 (지도 형상)
data/sgg-codes.json     전국 256개 시군구 법정동코드 (실거래가 API 검증 완료)
data/realestate.json    시군구×월 아파트 실거래 집계 (자동 수집, 하루 1회)
scripts/fetch-*.mjs     수집 스크립트 (Node 20 내장 fetch만 사용, 의존성 없음)
scripts/build-korea-map.mjs  지도 데이터 생성기 (1회성, 워크플로에 없음)
.github/workflows/      매시간 실행되는 수집 워크플로
design-system/          ui-ux-pro-max 스킬이 생성한 디자인 규칙 (MASTER.md)
```

## 데이터 출처

| 항목 | 출처 | 방식 |
|---|---|---|
| 로또 회차 정보 | 동행복권 공개 API | 자동 (신규 회차만 추가 수집) |
| 주가지수·귀금속·환율 | Yahoo Finance 차트 API | 자동 (매시간) |
| 암호화폐 | 업비트 공개 API | 자동 (매시간) |
| 백화점 상품권 | 각 상품권 업체 공식 시세 페이지 | 자동 (매시간) |
| 기타 상품권 | — | **수동** |
| 부동산 | 국토교통부 아파트 매매 실거래가 API | 자동 (하루 1회, 06:30 KST) |
| 관련 뉴스 | 구글뉴스 RSS (메뉴별 검색어) | 자동 (매시간) |

> stooq.com 과 동행복권 구 API(`common.do?method=getLottoNumber`)는 2026년에
> 폐기돼 각각 Yahoo Finance 와 신 API 로 교체했습니다.

### 전일 대비 등락률 계산 (주의)

Yahoo 차트 API 의 `meta.chartPreviousClose` 는 **전일 종가가 아니라 요청한 range
직전의 종가**입니다. `range=3mo` 로 요청하면서 이 값을 기준으로 쓰면 3개월 등락률이
전일 등락률 자리에 표시되고, 그 사이 방향이 바뀐 종목은 부호까지 반대로 나옵니다.
`scripts/fetch-markets.mjs` 는 일봉 시계열의 `rows.at(-2).close` 를 기준으로 씁니다.
장중이든 장마감이든 직전 세션은 항상 여기입니다.

### 백화점 상품권 시세에 대하여

`scripts/fetch-giftcards-dept.mjs` 가 **각 상품권 업체의 공식 시세 페이지에서 직접**
수집합니다. 시세를 모아 보여주는 취합 사이트를 거치지 않고 1차 출처에서만 가져오며,
화면에도 업체별 원문 링크를 함께 노출합니다.

현재 수집 대상:

| 업체 | 시세 페이지 |
|---|---|
| 씨티페이 | https://city-pay.co.kr/ |
| 최고상품권 | https://www.choigoticket.com/html/sub0101.php |
| 명인상품권 | https://mingren.co.kr/sub1_1.php |

업체를 추가하려면 스크립트 상단의 `SHOPS` 배열에 `{ id, name, site, url, parse }` 를
넣으면 됩니다. 3열(상품권명·매입가·판매가) 구조의 표라면 기존 `parseTable3` 를 그대로
재사용할 수 있습니다.

수집 시 지켜야 할 것:

- 업체 사이트의 `robots.txt` 를 먼저 확인합니다.
- 요청은 업체당 1회, 사이에 1초 간격을 둡니다 (매시간 총 3회 요청).
- 액면가 대비 말이 안 되는 값(업체 사이트의 오기)은 `sane()` 가 걸러냅니다.
  실제로 일부 업체는 50만원권 칸에 10만원권 가격을 올려두고 있습니다.

### 기타 상품권 시세에 대하여

문화상품권·해피머니 등은 위 업체들이 시세를 공개하지 않아 수동으로 관리합니다.
`data/giftcards.json` 의 `rate` 값(액면가 대비 매입률 %)을 직접 채우면 표에 반영됩니다.

```json
{ "id": "culture", "name": "문화상품권", "face": 10000, "rate": 82.5, "note": "" }
```

값을 고친 뒤 같은 파일의 `updatedAt` 도 함께 갱신하세요.

### 부동산 실거래가에 대하여

`scripts/fetch-realestate.mjs` 가 국토교통부 API 로 전국 256개 시군구의 아파트 매매를
시군구×월 단위로 집계합니다 (건수 + ㎡당 평균 단가, 해제거래 제외).

- **인증키는 GitHub Actions Secret `DATA_GO_KR_KEY` 로만 전달합니다.**
  저장소가 공개이므로 키를 코드·데이터 파일에 절대 넣지 마세요.
- 하루 1회(06:30 KST)만 돕니다. 일일 한도 10,000콜 대비:
  첫 실행 약 3,072콜(12개월 백필), 이후 매일 768콜(최근 3개월 재수집).
- 실거래 신고는 계약 후 30일 이내이므로 최근 달은 잠정치이며,
  해제신고 반영을 위해 최근 3개월을 매번 다시 받습니다.
- 시군구 코드는 `data/sgg-codes.json` — 행정표준 법정동코드에서 추출한 뒤
  API 실호출로 검증했습니다. 2023~2026 행정개편(강원 42→51, 전북 45→52,
  군위→대구, 인천 원도심 개편, 화성·부천 분구)이 반영돼 있습니다.
- **광주(29)·전남(46)은 2026-07-01 「전남광주통합특별시」 출범으로 시도코드
  `12` 로 재코드**됐습니다 (행정표준코드관리시스템에서 27개 시군구 확인).
  API 는 과거 월까지 전부 새 코드로 재분류해, 구 코드로 조회하면 전 기간 0건이
  나옵니다 — 처음엔 이것이 "API 가 자료를 반환하지 않는" 것으로 보였습니다.
- 지도(kostat 2018)의 구 시도코드와 데이터 연결은 접두사 매핑이 아니라
  **sido 이름 매칭**으로 합니다. 광주·전남이 같은 접두사(12)를 공유하게 되면서
  접두사로는 두 지역을 구분할 수 없기 때문입니다.
- 지도 도형은 구멍 링을 유지하고 `fill-rule: evenodd` 로 그립니다. 구멍을 버리면
  전남 도형이 월경지인 광주를 덮어 광주 클릭이 전남으로 먹힙니다.

### 로또 "구매자 수"에 대하여

실제 구매 **인원**은 어디에도 공개되지 않습니다. 동행복권이 공개하는 것은
회차별 **총 판매금액**뿐입니다. 이 사이트는

```
판매 게임 수 = 총 판매금액 ÷ 1,000원
추정 구매자 수 = 판매 게임 수 ÷ (1인당 평균 구매 게임 수)
```

로 계산하며, 1인당 평균 게임 수는 화면의 슬라이더로 직접 조정하는 **가정값**입니다.
확정된 수치가 아니라 규모 감을 잡기 위한 추정치입니다.

## SEO

- 대표 도메인은 **https://k-coin.kr** 입니다. `www.k-coin.kr` 과
  `26-07-19marketprice.pages.dev` 는 `_redirects` 로 301 통합됩니다
  (프리뷰 배포 `*.pages.dev` 서브도메인은 영향 없음).
- 페이지마다 canonical / Open Graph / Twitter 카드가 있고, 홈에는
  JSON-LD(WebSite)가 있습니다. OG 이미지는 `assets/og.png`.
- `robots.txt` 는 전체 허용입니다. **`/data/ 를 절대 막지 마세요`** —
  페이지 콘텐츠가 전부 `/data/*.json` fetch 로 그려지므로, 막으면
  검색엔진이 렌더링한 화면이 빈 껍데기가 됩니다.
- `sitemap.xml` 에 9개 페이지가 등록돼 있습니다. 페이지를 추가하면
  sitemap 과 메타 주입을 함께 갱신하세요.
- 서치콘솔 등록(사이트 소유 확인)은 콘솔에서 발급받은 메타 태그를
  `index.html` 에 넣거나 Cloudflare DNS TXT 로 합니다:
  [Google Search Console](https://search.google.com/search-console) ·
  [네이버 서치어드바이저](https://searchadvisor.naver.com)

## 배포 (Cloudflare Pages)

이 저장소의 `main` 브랜치가 Cloudflare Pages 에 연결돼 있어 push 하면 자동 배포됩니다.
빌드 명령 없이 저장소 루트를 그대로 서빙합니다. 커스텀 도메인은 추후 연결 예정.

<https://26-07-19marketprice.pages.dev>

### 데이터 경로가 절대경로인 이유

`assets/pages.js` 등은 `/data/markets.json` 처럼 **절대경로**로 데이터를 읽습니다.
루트 도메인에 서빙되는 Cloudflare Pages 전제입니다. GitHub Pages **프로젝트 사이트**
(`user.github.io/저장소명/`) 로 옮기면 `user.github.io/data/...` 를 찾아 전 페이지가
404 가 되므로, 옮길 경우 상대경로로 되돌려야 합니다.

메뉴 링크에는 `.html` 을 유지합니다. Cloudflare Pages 가 `/coin.html` → `/coin` 으로
308 리다이렉트하지만, `.html` 을 빼면 로컬 정적 서버에서 404 가 나 검증이 막힙니다.

## 수동 실행

Actions 탭에서 **시세 데이터 갱신 → Run workflow** 를 누르면 즉시 수집합니다.
첫 실행 때는 로또 1회차부터 전부 받아오므로 몇 분 걸립니다.

## 면책

모든 시세는 참고용이며 실제 거래가와 다를 수 있습니다. 투자 판단의 근거로 사용하지 마세요.
