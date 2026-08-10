// 핫딜 커뮤니티의 공식 RSS 피드에서 딜을 수집합니다. (키 불필요)
//
// RSS 는 각 사이트가 배포(신디케이션) 목적으로 공식 제공하는 피드입니다.
// HTML 크롤링과 달리 재유통이 전제된 채널이라, 제목·링크를 발굴 신호로 쓰고
// 원문 링크를 함께 노출하는 이 방식은 저작권·ToS 위험이 낮습니다.
// 원문 본문은 가져오지 않으며(제목만), 화면에 반드시 출처와 원문 링크를 답니다.
import { getText, writeJSON, nowKST } from './lib.mjs';

const OUT = 'data/hotdeals.json';
const MAX = 80; // 피드에 유지할 최신 딜 수

/** 제목 키워드로 카테고리 분류 (필터용). 첫 매치 우선, 없으면 '기타'. */
const CATS = [
  ['건강', /루테인|유산균|프로바이오|비타민|오메가|홍삼|콜라겐|밀크씨슬|영양제|캡슐|정제|zn\b|아연|마그네슘|칼슘|글루타치온|다이어트|이너퍼퓸|프로틴|단백질|보충제|엽산|철분|눈영양|간건강/i],
  ['식품', /라면|과자|스낵|음료|커피|우유|만두|김치|쌀\b|고기|한돈|한우|생수|삼다수|즙|밥\b|햇반|간식|피자|치킨|초콜|사탕|젤리|육수|소바|장어|쭈꾸미|볶음|두유|아이스티|콜라|사이다|펩시|\b햄\b|스팸|어묵|\b김\b|시리얼|\b빵\b|과일|견과|아몬드|양념|소스|찌개|\b떡\b|족발|해물|생선|고등어|새우|만둣|즉석|국물|반찬|간편식|도시락|차\b/i],
  ['디지털·가전', /모니터|노트북|ssd|hdd|rtx|gtx|cpu|그래픽|\b램\b|메모리|키보드|마우스|갤럭시|아이폰|에어컨|\btv\b|이어폰|헤드셋|버즈|충전|닌텐도|플스|ps5|\bpc\b|공유기|배터리|스피커|웹캠|태블릿|스위치|카메라|드론|청소기|공기청정|전자레인지|냉장고|세탁기|건조기|선풍기|조명|파워|메인보드|그래픽카드|기계식|모뎀|허브/i],
  ['생활', /세제|화장지|키친타올|섬유유연제|샴푸|칫솔|치약|물티슈|기저귀|주방|욕실|수납|텀블러|베개|이불|매트|커버|세탁|비누|손세정|밀폐용기|휴지|생리대|면도|쉐이빙|방향제|살충|모기|우산|수건|타월|청소|정리함/i],
  ['패션·뷰티', /신발|운동화|스니커즈|티셔츠|자켓|바지|셔츠|원피스|화장품|크림|스킨|로션|향수|\b립\b|쿠션|파운데이션|마스카라|선크림|가방|지갑|모자|양말|구명조끼|패딩|후드|맨투맨|레깅스|속옷|앰플|세럼|토너|마스크팩/i],
  ['쿠폰·상품권', /상품권|기프티콘|기프트|교환권|관람권|cgv|메가박스|롯데시네마|스타벅스|투썸|버거킹|맥도날드|배스킨|이디야|공차|외식|쿠폰|바우처|포인트|적립|모바일교환/i],
];
const classify = (t) => {
  for (const [name, re] of CATS) if (re.test(t)) return name;
  return '기타';
};

/** 수집 대상 — 각 사이트의 핫딜 게시판 RSS.
 *  - 에펨코리아·클리앙·퀘이사존·아카라이브: RSS 미제공/차단 (2026-08 확인).
 *  - 쿨앤조이: RSS는 있으나 해외/데이터센터 IP를 차단해 GitHub Actions에서 타임아웃
 *    (로컬 국내 IP는 정상). 국내 러너/프록시 확보 전까지 제외. */
const SOURCES = [
  { id: 'ppomppu', name: '뽐뿌', url: 'https://www.ppomppu.co.kr/rss.php?id=ppomppu' },
  { id: 'ruliweb', name: '루리웹', url: 'https://bbs.ruliweb.com/market/board/1020/rss' },
  { id: 'damoang', name: '다모앙', url: 'https://damoang.net/rss/economy' },
];

/** XML 엔티티만 풉니다. HTML 이스케이프는 렌더링(pages.js) 책임입니다. */
const decode = (s) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();

const cleanText = (value, max = 300) =>
  String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[<>]/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

function safeHttpsUrl(value, allowedHosts) {
  try {
    const url = new URL(String(value ?? '').trim());
    if (url.protocol === 'http:') url.protocol = 'https:';
    if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname.toLowerCase())) return null;
    url.username = '';
    url.password = '';
    return url.href.slice(0, 2048);
  } catch {
    return null;
  }
}

const DEST_HOSTS = new Set([
  'naver.me',
  'smartstore.naver.com',
  'm.smartstore.naver.com',
  'shopping.naver.com',
  'm.shopping.naver.com',
]);

/** 딜 제목에서 판매처([대괄호])와 가격((…원))을 뽑아냅니다.
 *  예: "[네이버]목우촌 팝콘치킨 420g, 3개 (9,900원/네멤무료)" */
function parseTitle(raw) {
  let title = cleanText(raw);
  let mall = null;
  const mm = title.match(/^\s*\[([^\]]{1,20})\]\s*/);
  if (mm) {
    mall = cleanText(mm[1], 40);
    title = title.slice(mm[0].length);
  }
  // 가장 뒤쪽 괄호의 "숫자원" 을 가격으로 봅니다 (원화만).
  let price = null;
  const pm = [...raw.matchAll(/([\d][\d,]*)\s*원/g)].pop();
  if (pm) {
    const n = Number(pm[1].replace(/,/g, ''));
    if (Number.isFinite(n) && n > 0) price = n;
  }
  // 표시용 제목: 끝에 붙은 가격/배송 괄호는 떼어냅니다 (가격은 별도 배지로 보여줌).
  title = title.replace(/\s*\([^)]*(원|무료|만원|할인|카드|%|배송|적립)[^)]*\)\s*$/, '').trim();
  return { title: cleanText(title), mall, price };
}

/** RSS 본문에서 실제 상품 판매처 링크를 뽑습니다 (있으면 커뮤니티 대신 여기로 바로 보냄).
 *  다모앙 등은 본문에 naver.me 단축링크를 넣어줍니다. 없으면 null(→ 원문 링크 사용). */
function extractDest(desc) {
  if (!desc) return null;
  // naver.me 단축링크 (영숫자로 끝나 자동으로 경계가 잡힘)
  const nm = desc.match(/https?:\/\/naver\.me\/[A-Za-z0-9]+/i);
  if (nm) return safeHttpsUrl(nm[0], DEST_HOSTS);
  // 네이버 스마트스토어·쇼핑 직링크 (경로형이라 URL 문자까지만 — 뒤따르는 한글/공백 제외).
  // 쿼리(&) 의존 몰(쿠팡·G마켓 등)은 본문에서 잘리면 깨지므로 대상에서 뺍니다.
  const sm = desc.match(
    /https?:\/\/(?:m\.)?(?:smartstore|shopping)\.naver\.com\/[A-Za-z0-9._~:/?#%-]+/i
  );
  if (sm) return safeHttpsUrl(sm[0].replace(/[.,)\]]+$/, ''), DEST_HOSTS);
  return null;
}

function parseItems(xml, src) {
  const out = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1];
    const pick = (re) => {
      const r = it.match(re);
      return r ? decode(r[1]) : '';
    };
    const rawTitle = pick(/<title>([\s\S]*?)<\/title>/);
    const post = pick(/<link>([\s\S]*?)<\/link>/); // 커뮤니티 원문 글
    const desc = pick(/<description>([\s\S]*?)<\/description>/);
    // 대부분 <pubDate>, 쿨앤조이 등 일부는 <dc:date> 를 씁니다.
    const pubDate =
      pick(/<pubDate>([\s\S]*?)<\/pubDate>/) || pick(/<dc:date>([\s\S]*?)<\/dc:date>/);
    if (!rawTitle || !post) continue;

    const sourceHost = new URL(src.url).hostname.toLowerCase();
    const safePost = safeHttpsUrl(post, new Set([sourceHost]));
    if (!safePost) continue;

    const { title, mall, price } = parseTitle(rawTitle);
    if (!title) continue;
    const dest = extractDest(desc);
    const ts = Date.parse(pubDate);
    out.push({
      title,
      mall,
      price,
      cat: classify(title),
      link: dest || safePost, // 검증된 직링크가 있으면 그리로, 없으면 검증된 원문
      direct: !!dest, // 판매처로 바로 가는지 (배지 표시용)
      source: src.name,
      sourceId: src.id,
      date: Number.isFinite(ts) ? new Date(ts).toISOString() : null,
    });
  }
  return out;
}

const all = [];
let okCount = 0;

for (const src of SOURCES) {
  try {
    const xml = await getText(src.url);
    const items = parseItems(xml, src);
    if (!items.length) throw new Error('딜 0건 — RSS 구조가 바뀌었을 수 있습니다');
    all.push(...items);
    okCount++;
    console.log(`${src.name}: ${items.length}건 (${items[0].title.slice(0, 30)}…)`);
  } catch (err) {
    console.error(`${src.name} 실패: ${err.message}`);
  }
  await new Promise((r) => setTimeout(r, 800)); // 요청 간격 (서버 배려)
}

if (!okCount) throw new Error('모든 소스 수집 실패');

// 링크 기준 중복 제거 후 최신순 상위 MAX 개
const seen = new Set();
const deals = all
  .filter((d) => (seen.has(d.link) ? false : (seen.add(d.link), true)))
  .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  .slice(0, MAX);

await writeJSON(OUT, { updatedAt: nowKST(), deals });
console.log(`done: ${deals.length}건 (${okCount}/${SOURCES.length} 소스)`);
