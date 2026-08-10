# 인계 메모 — 2026-08 사이트 리디자인 (라이트 테마 + 홈 개편)

> 다음 세션은 이 문서부터 읽으면 바로 이어서 작업 가능.
> 시안 원본: `~/Downloads/모두의시세 홈 화면 디자인.zip` (README = 완전한 구현 스펙, .dc.html = 픽셀 레퍼런스)

---

## ✅ 완료 — 전부 라이브 배포·검증됨 (2026-08-10)

### 1단계: 라이트 기본 테마 전환
- 기본 테마 네이비 → **라이트(화이트+블루 #2563eb)**, 네이비는 토글로 유지.
  `:root` = 라이트 토큰, `:root[data-theme="dark"]` = 네이비 토큰.
- 수평 주요 메뉴(top-nav) 12개 — 알약형, 활성 표시. 모바일 가로 스크롤 + 기존 드로어 병행.
- 푸터: 네이비 밴드 멀티컬럼(브랜드·서비스 11링크·안내) — 두 테마 공통.
- `--color-accent-strong` 토큰: accent 를 틴트 배경 위 소형 텍스트로 쓸 때의 AA 확보용.

### A단계: 홈 전면 리디자인 (시안 구현)
- **`assets/home-render.js` (신규·핵심)**: composeHome(원본 JSON들→홈 데이터) + 모든 홈 마크업 렌더러.
  ① 빌드 프리렌더(build-static.mjs 가 require) ② 브라우저 하이드레이션(pages.js pageHome)
  ③ home.json 생성(build-runtime-data.mjs) — **세 곳이 같은 코드라 값이 어긋날 수 없음.**
- 홈 구성: 히어로(라이브 배지·실데이터 미니통계·플로팅 카드) / 카테고리 카드 8종 /
  주요지표 스파크 8종(기준금리 24개월·김프 포함) / BTC 요약(일봉 40일 차트 + 시장요약 3행) /
  상품권 패널(실데이터 백화점 3종) / 바로보기 11종 / 신뢰 배너.
- 폰트 Fira → **Pretendard Variable(jsDelivr)** — CSP `_headers.template`의 style/font-src 교체됨.
- index.html 은 `prerender:KEY` 마커 8개(hero-live/hero-stats/hero-pill/cat-grid/kpi-grid/btc-block/gift-rows/quick-grid).
- 시안에서 의도적으로 뺀 것: 검색창·알림 벨·앱 배지·고객센터·소셜(실체 없음 — README도 생략 허용),
  일러스트의 "자산 비중 58%" 같은 가짜 수치(중립 장식으로 대체).

### 함께 잡은 중요 버그
- **fetchJSON `cache:'no-store'` 복구** — 보안 개편 때 유실돼 브라우저 휴리스틱 캐시가
  며칠 묵은 시세를 보여줄 수 있었음(전 페이지 영향). 엣지 캐시는 `_headers`의 /data/* 5분 규칙이 담당.
- 3자 리뷰 반영: 캡션 사실화("40회 수집"→"40일 일봉"), 결측 changePct '—' 표기, "(-0원)" 방지,
  크림 패널 대비 AA 5건(gift-note·title small·해피머니 칩 #b45309·btc-row up·hero-mini 틴트).

---

## ⏭️ 남은 것 — B단계: BTC 인터랙티브 차트

시안의 마지막 조각. 현재 홈의 BTC 블록은 일봉 40일 정적 차트.
- 기간 탭 7개(1시간·1일·1주·1개월·3개월·1년·전체) — **업비트 캔들 API** 클라이언트 연동
  (`api.upbit.com/v1/candles/...` — CSP connect-src 에 추가 필요).
- 호버 크로스헤어 + 툴팁, 거래량 바. 차트 좌표/툴팁 로직은 시안 .dc.html 하단 스크립트에 완성돼 있음.
- 시가총액·도미넌스는 외부 소스(CoinGecko 등) 필요 — 없으면 그 행만 생략(현재처럼).
- 상품권 "전일 대비 %": 가격 이력 축적부터(뉴스 아카이브 패턴 재사용) — 시작 다음 날부터 표시 가능.

---

## ⚠️ 운영 수칙 (이번에 실제로 겪은 함정들)

1. **자산(css/js) 변경 = ASSET_VERSION 범프 필수** — `scripts/build-static.mjs` 상단 상수 + 전 HTML sed.
   `/assets/*` 는 7일 엣지 캐시. **배포 전파가 끝나기 전에 새 버전 URL 을 요청하면 구 파일이
   새 키로 7일 캐시됨(실제 발생)** → 배포 후 프로브 쿼리(`?probe=랜덤`)로 새 내용 확인 후 접속하거나,
   오염 시 버전 재범프로 해소.
2. **매시간 크론과 push 경합** — rebase 충돌은 늘 `_headers`·`data/*`·프리렌더 HTML.
   해법: 충돌 파일 `--theirs`(내 커밋) → `build-runtime-data` → `build-static` → `build-deploy` 재생성
   → 검증 2종 통과 → `rebase --continue` → push.
3. **빌드 파이프라인 순서**: fetch류 → build-rss → build-static(+--check) → 보안 테스트(node:sqlite,
   **Node 24 필요**) → build-deploy(+--check, `_headers` 루트 렌더링 포함) → data/ `_headers` 등 커밋.
4. `_headers` 는 렌더링본(루트 서빙), `_headers.template` 이 원본(플레이스홀더) — 직접 수정은 template 에.

## 검증 명령 모음
```bash
node scripts/build-static.mjs --check
node --test scripts/security-sanitizers.test.mjs functions/api/lotto/security.test.mjs functions/security-routes.test.mjs
node scripts/build-deploy.mjs --check
```
