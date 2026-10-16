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

## ✅ B단계 완료 (2026-08-31) — BTC 인터랙티브 차트 라이브

- `assets/btc-chart.js`: 기간 탭 7개(1분봉 60 ~ 월봉 2017년~), 크로스헤어+툴팁, 거래량 바,
  관심(별) 토글, 티커 실시간 현재가. **점진 향상** — 실패 시 프리렌더 정적 차트 유지.
- 시장 요약: 전일대비·24H 고가/저가(롤링 24h 캔들 계산)·24H 거래량/거래대금·김프.
- **`functions/api/btc.js` 프록시(중요)**: 브라우저의 Origin 헤더 요청은 업비트 'origin'
  레이트리밋 그룹(분당 ~10회, 429 응답엔 CORS 헤더 부재 → CORS 오류로 보임)에 걸린다.
  Pages Function 프록시(허용목록: KRW-BTC 캔들 6종+티커, count≤200) + 엣지 캐시
  (TTL 10초~10분)로 방문자 수와 무관하게 업스트림을 기간당 TTL 1회로 묶음.
- 리뷰로 잡은 함정: 업비트 캔들 **count 상한 200** — '1년'을 일봉 365로 요청하면 조용히
  6.5개월로 잘림 → 주봉 53개로 해결. 티커의 high/low 는 **UTC일 기준**이라 '당일'
  표기는 거짓 → 캔들 계산으로 대체.

## ✅ 상품권 등락 표시 완료 (2026-08-31)
- `data/giftcards-history.json` 일별 이력(60일, build-runtime-data 가 매시간 누적) +
  git 이력 667버전 백필(`scripts/build-giftcard-history.mjs`, 1회성)로 첫날부터 표시.
- 등락 기준: **최근 3일 내 직전 기록 대비** (패널에 명시). 오늘 이전 기록에만 의존해
  빌드 순서와 무관하게 결정적이고, 같은 날 재실행은 멱등(--check 안전).

## ✅ 쿠팡 파트너스 코너 (2026-10-16) — 핫딜 페이지
- `data/coupang.json` 의 items(name·url·banner)로 핫딜 페이지 상단에 프리렌더. url 은 반드시
  `https://link.coupang.com/`(파트너스 링크생성 단축 URL — 일반 상품 URL 은 정산 불가, 빌드가 거부),
  banner 는 `https://coupa.ng/` 공식 배너(iframe) 주소. banner 있으면 이미지 카드, 없으면 텍스트 카드,
  items 비면 코너 자체 미렌더.
- 고지문("이 포스팅은 쿠팡 파트너스 활동의 일환으로…")은 링크 바로 위 고정. 가격은 표시하지 않음.
- CSP frame-src 에 배너 리다이렉트 체인 3도메인만 허용(coupa.ng → ads-partners.coupang.com → partners.coupangcdn.com).
- 승인용 스크린샷: Chrome 헤드리스로 라이브 /hotdeal 캡처(`coupang-partners-screenshot.png`, git 제외).

## ✅ 상품권 페이지 개선 P1 완료 (2026-10-16)
- **수집 거래소 2→10곳**: 씨티페이·최고·미래·명인(파서 수리)·우천(EUC-KR)·월드티켓·엑스이·중앙(아임웹)·
  우리에스티(EUC-KR)·상품권백화점. `scripts/fetch-giftcards-dept.mjs` SHOPS 에 `encoding` 옵션,
  `lib.getText(url, { encoding })`. 제외: 고고상품권(robots.txt 로 AI 봇 차단), 어즈티켓(Wix·불안정), 퍼스트티켓(도메인 사망).
- **거래소×상품권 매트릭스**: `assets/giftcard-render.js`(프리렌더·브라우저 공용) — 셀마다 살 때/팔 때,
  열별 최저 판매·최고 매입 강조, 액면가 전환 시 재렌더(`?face=`), 업체명 링크.
- 기타 상품권(수동) 섹션은 시세가 있을 때만 렌더 — 빈 '미입력' 표·개발자 문구 제거.
- 검증 기준: 업체 간 10만원권 가격대 일치(신세계 매입 96,050~96,400), 매입>판매 역전 0건.
- 남은 P2: 시세 추이 차트(이력 데이터 있음), 실수령 계산기, 살때/팔때 1차 라벨, 관련 뉴스 필터.

## ⏭️ 남은 아이디어 (선택)
- 시가총액·도미넌스: 외부 소스(CoinGecko 등) 필요 — 현재 생략.
- 차트 키보드/터치 드래그 접근성 (현재 마우스 전용, 요약 수치는 별도 제공됨).

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
5. **Cloudflare `_headers` 한 줄 2,000자 한도** — 넘으면 그 헤더(CSP)가 조용히 통째로 무시된다.
   2026-10-16 에 JSON-LD 블록까지 해시해 26개(2,118자)가 되어 사이트 전체 CSP 가 빠져 있던 걸 발견.
   build-deploy 가 실행 스크립트만 해시하고(6개·1,038자), 초과 시 빌드를 실패시킨다.
   배포 후 `curl -sD- https://modoosise.com/ | grep -i content-security` 로 헤더 존재를 확인할 것.

## 검증 명령 모음
```bash
node scripts/build-static.mjs --check
node --test scripts/security-sanitizers.test.mjs functions/api/lotto/security.test.mjs functions/security-routes.test.mjs
node scripts/build-deploy.mjs --check
```
