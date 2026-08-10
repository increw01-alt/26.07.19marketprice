// data/news.json 의 git 이력 전체를 병합해 토픽별 뉴스 아카이브를 만듭니다.
// (1회성 백필 — 워크플로에 없음. 이후에는 fetch-news.mjs 가 매시간 누적합니다.)
import { execFileSync } from 'node:child_process';
import { writeJSON, nowKST } from './lib.mjs';

const ARCHIVE_MAX = 100; // fetch-news.mjs 와 동일 상한

const revs = execFileSync('git', ['rev-list', 'HEAD', '--', 'data/news.json'], {
  encoding: 'utf8',
})
  .trim()
  .split('\n')
  .filter(Boolean);
console.log(`news.json 이력 ${revs.length}개 버전 병합 시작`);

const byTopic = {};
let parsed = 0;
for (const rev of revs) {
  let d;
  try {
    d = JSON.parse(
      execFileSync('git', ['show', `${rev}:data/news.json`], {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
      })
    );
  } catch {
    continue; // 초기 형식이 다르거나 깨진 버전은 건너뜀
  }
  parsed++;
  for (const [topic, items] of Object.entries(d.topics || {})) {
    const map = (byTopic[topic] ||= new Map());
    for (const n of items || []) {
      if (n?.link && n?.title && !map.has(n.link)) map.set(n.link, n);
    }
  }
}

for (const [topic, map] of Object.entries(byTopic)) {
  const items = [...map.values()]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, ARCHIVE_MAX);
  await writeJSON(`data/news/${topic}.json`, { updatedAt: nowKST(), topic, items });
  console.log(`${topic}: 누적 ${map.size}건 → 상한 적용 ${items.length}건`);
}
console.log(`done: ${parsed}/${revs.length} 버전 병합`);
