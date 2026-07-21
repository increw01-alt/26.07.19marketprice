// 시도 경계 GeoJSON → 인라인 SVG path 로 변환합니다. (빌드 시 1회만 실행)
//
// 원본: https://github.com/southkorea/southkorea-maps  (kostat/2018)
// KOSTAT 출처 데이터는 "Free to share or remix" 조건입니다.
//
// 실행: node scripts/build-korea-map.mjs
// 결과: data/korea-provinces.json  (시도별 SVG path + 법정동 시도코드)
import { writeJSON } from './lib.mjs';

const SRC =
  'https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2018/json/skorea-provinces-2018-geo.json';
const OUT = 'data/korea-provinces.json';

const WIDTH = 700;
const HEIGHT = 900;
const PADDING = 12;
const TOLERANCE = 0.004; // 약 400m — 화면 크기 대비 충분합니다
const MIN_AREA = 0.0006; // 이보다 작은 섬은 버립니다 (제곱도)

/** GeoJSON 의 KOSTAT 코드 → 실거래가 API 가 쓰는 법정동 시도코드(2자리) */
const LAWD_SIDO = {
  11: { lawd: '11', name: '서울', full: '서울특별시' },
  21: { lawd: '26', name: '부산', full: '부산광역시' },
  22: { lawd: '27', name: '대구', full: '대구광역시' },
  23: { lawd: '28', name: '인천', full: '인천광역시' },
  24: { lawd: '29', name: '광주', full: '광주광역시' },
  25: { lawd: '30', name: '대전', full: '대전광역시' },
  26: { lawd: '31', name: '울산', full: '울산광역시' },
  29: { lawd: '36', name: '세종', full: '세종특별자치시' },
  31: { lawd: '41', name: '경기', full: '경기도' },
  32: { lawd: '42', name: '강원', full: '강원특별자치도' },
  33: { lawd: '43', name: '충북', full: '충청북도' },
  34: { lawd: '44', name: '충남', full: '충청남도' },
  35: { lawd: '45', name: '전북', full: '전북특별자치도' },
  36: { lawd: '46', name: '전남', full: '전라남도' },
  37: { lawd: '47', name: '경북', full: '경상북도' },
  38: { lawd: '48', name: '경남', full: '경상남도' },
  39: { lawd: '50', name: '제주', full: '제주특별자치도' },
};

/**
 * 라벨 위치 보정 (SVG 단위).
 * 무게중심을 그대로 쓰면 수도권이 겹칩니다 — 경기도가 서울을 감싸는 도넛 모양이라
 * 경기 무게중심이 서울 한복판에 찍히기 때문입니다. 인천도 바로 옆이라 붙습니다.
 */
const LABEL_OFFSET = {
  11: [-2, -12], // 서울 — 위로
  41: [52, 40], // 경기 — 오른쪽 아래 본체 쪽으로
  28: [-30, 6], // 인천 — 왼쪽으로
  36: [-16, -4], // 세종 — 대전·충북과 떨어뜨림
  30: [6, 8], // 대전
};

// ---------- 기하 유틸 ----------

/** 링의 면적(제곱도) — 작은 섬 제거용 */
function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(a / 2);
}

/** 점-선분 수직거리의 제곱 */
function segDistSq(p, a, b) {
  let x = a[0];
  let y = a[1];
  let dx = b[0] - x;
  let dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = b[0];
      y = b[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = p[0] - x;
  dy = p[1] - y;
  return dx * dx + dy * dy;
}

/** Douglas-Peucker 단순화 */
function simplify(points, tolerance) {
  if (points.length <= 3) return points;
  const sqTol = tolerance * tolerance;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;

  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxSq = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = segDistSq(points[i], points[first], points[last]);
      if (d > maxSq) {
        maxSq = d;
        index = i;
      }
    }
    if (maxSq > sqTol && index > 0) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

// ---------- 실행 ----------

const res = await fetch(SRC, { signal: AbortSignal.timeout(120000) });
if (!res.ok) throw new Error(`GeoJSON 다운로드 실패: HTTP ${res.status}`);
const geo = await res.json();

// 1) 각 시도의 링을 모으고 작은 섬을 걸러냅니다.
const provinces = [];
for (const f of geo.features) {
  const meta = LAWD_SIDO[Number(f.properties.code)];
  if (!meta) {
    console.warn(`매핑 없는 코드 건너뜀: ${f.properties.code} ${f.properties.name}`);
    continue;
  }
  const polys =
    f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;

  // 외곽 링과 구멍 링을 모두 유지합니다. 구멍을 버리면 광주(전남 안 월경지)처럼
  // 다른 시도를 감싸는 도형이 그 지역 위를 덮어, 클릭이 위쪽 도형에 먹힙니다.
  // fill-rule: evenodd 로 그리면 구멍이 실제로 뚫려 클릭이 아래로 통과합니다.
  const rings = polys
    .flat()
    .filter((r) => Array.isArray(r) && r.length > 3 && ringArea(r) >= MIN_AREA);

  if (!rings.length) continue;
  provinces.push({ ...meta, rings });
}

// 2) 투영 범위 계산 (등장방형 + 위도 보정)
let minLon = Infinity;
let maxLon = -Infinity;
let minLat = Infinity;
let maxLat = -Infinity;
for (const p of provinces) {
  for (const r of p.rings) {
    for (const [lon, lat] of r) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
}
const kx = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
const spanX = (maxLon - minLon) * kx;
const spanY = maxLat - minLat;
const scale = Math.min((WIDTH - PADDING * 2) / spanX, (HEIGHT - PADDING * 2) / spanY);
const offX = (WIDTH - spanX * scale) / 2;
const offY = (HEIGHT - spanY * scale) / 2;

const project = ([lon, lat]) => [
  (lon - minLon) * kx * scale + offX,
  (maxLat - lat) * scale + offY, // SVG 는 y 가 아래로 증가
];

// 3) 단순화 후 path 문자열 생성
const round = (n) => Math.round(n * 10) / 10;
const out = provinces.map((p) => {
  const d = p.rings
    .map((ring) => {
      const pts = simplify(ring, TOLERANCE).map(project);
      if (pts.length < 3) return '';
      return (
        `M${round(pts[0][0])} ${round(pts[0][1])}` +
        pts
          .slice(1)
          .map(([x, y]) => `L${round(x)} ${round(y)}`)
          .join('') +
        'Z'
      );
    })
    .filter(Boolean)
    .join('');

  // 라벨 위치 = 가장 큰 링의 무게중심 + 보정값
  const big = p.rings.slice().sort((a, b) => ringArea(b) - ringArea(a))[0];
  const pts = big.map(project);
  const cx = pts.reduce((s, q) => s + q[0], 0) / pts.length;
  const cy = pts.reduce((s, q) => s + q[1], 0) / pts.length;
  const [dx, dy] = LABEL_OFFSET[p.lawd] || [0, 0];

  return {
    lawd: p.lawd,
    name: p.name,
    full: p.full,
    d,
    label: [round(cx + dx), round(cy + dy)],
  };
});

await writeJSON(OUT, { width: WIDTH, height: HEIGHT, source: SRC, provinces: out });

const bytes = out.reduce((s, p) => s + p.d.length, 0);
console.log(`시도 ${out.length}개 | path 총 ${(bytes / 1024).toFixed(1)}KB`);
for (const p of out) console.log(`  ${p.lawd} ${p.name.padEnd(3)} ${(p.d.length / 1024).toFixed(1)}KB`);
