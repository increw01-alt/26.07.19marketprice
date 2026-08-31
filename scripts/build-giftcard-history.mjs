// data/giftcards-dept.json 의 git 이력에서 일별(KST) 마지막 스냅샷을 복원해
// 상품권 이력(data/giftcards-history.json)을 시드합니다.
// (1회성 백필 — 워크플로에 없음. 이후에는 build-runtime-data.mjs 가 매시간 누적합니다.)
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readJSON, writeJSON } from './lib.mjs';

const require = createRequire(import.meta.url);
const HOME_RENDER = require('../assets/home-render.js');

const KEEP_DAYS = 60;

const revs = execFileSync('git', ['rev-list', 'HEAD', '--', 'data/giftcards-dept.json'], {
  encoding: 'utf8',
})
  .trim()
  .split('\n')
  .filter(Boolean);
console.log(`giftcards-dept.json 이력 ${revs.length}개 버전 스캔`);

// rev-list 는 최신순 — 날짜별 '처음 만나는 버전' = 그날의 마지막 스냅샷입니다.
const days = {};
let parsed = 0;
for (const rev of revs) {
  let dept;
  try {
    dept = JSON.parse(
      execFileSync('git', ['show', `${rev}:data/giftcards-dept.json`], {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
      })
    );
  } catch {
    continue;
  }
  parsed += 1;
  const day = String(dept?.updatedAt || '').slice(0, 10);
  if (day.length !== 10 || days[day]) continue;
  const snap = HOME_RENDER.giftSnapshot(dept, null); // 수동 상품권은 이력 내내 미입력이라 제외
  if (Object.keys(snap).length) days[day] = snap;
}

const keys = Object.keys(days).sort();
const kept = keys.slice(-KEEP_DAYS);
const existing = (await readJSON('data/giftcards-history.json', null)) || { days: {} };
const merged = { ...Object.fromEntries(kept.map((k) => [k, days[k]])), ...existing.days };
const mergedKeys = Object.keys(merged).sort().slice(-KEEP_DAYS);
await writeJSON('data/giftcards-history.json', {
  updatedAt: existing.updatedAt || `${mergedKeys.at(-1)}T00:00:00+09:00`,
  days: Object.fromEntries(mergedKeys.map((k) => [k, merged[k]])),
});
console.log(`done: ${parsed}/${revs.length} 버전 → ${mergedKeys.length}일 (${mergedKeys[0]} ~ ${mergedKeys.at(-1)})`);
