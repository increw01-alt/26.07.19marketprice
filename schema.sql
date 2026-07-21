-- 모두의 시세 — Cloudflare D1 스키마
-- 대시보드 D1 콘솔이나 wrangler 로 1회 실행합니다.

-- 방문자가 로또 추첨기에서 뽑은 번호 (공개 결과 피드용)
CREATE TABLE IF NOT EXISTS lotto_picks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  round      INTEGER NOT NULL,          -- 대상 회차
  games      TEXT    NOT NULL,          -- JSON: [[n,n,n,n,n,n], ...] 최대 5게임
  best_rank  INTEGER,                   -- NULL=미채점, 0=낙첨, 1~5=등수
  created_at INTEGER NOT NULL           -- epoch ms (뽑은 시각)
);
CREATE INDEX IF NOT EXISTS idx_picks_round ON lotto_picks(round);
CREATE INDEX IF NOT EXISTS idx_picks_rank  ON lotto_picks(best_rank);
CREATE INDEX IF NOT EXISTS idx_picks_at    ON lotto_picks(created_at);
