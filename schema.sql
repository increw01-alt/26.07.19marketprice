-- 모두의시세 — Cloudflare D1 스키마
-- D1 Console 또는 Wrangler로 한 번 실행합니다.

-- 방문자가 로또 추첨기에서 뽑은 번호 (당첨 결과 공개 피드용)
CREATE TABLE IF NOT EXISTS lotto_picks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  round      INTEGER NOT NULL CHECK (round BETWEEN 1 AND 99999),
  games      TEXT    NOT NULL,
  best_rank  INTEGER CHECK (best_rank IS NULL OR best_rank BETWEEN 0 AND 5),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_picks_round ON lotto_picks(round);
CREATE INDEX IF NOT EXISTS idx_picks_rank  ON lotto_picks(best_rank);
CREATE INDEX IF NOT EXISTS idx_picks_at    ON lotto_picks(created_at);
CREATE INDEX IF NOT EXISTS idx_picks_pending_round_at
  ON lotto_picks(round, created_at) WHERE best_rank IS NULL;
CREATE INDEX IF NOT EXISTS idx_picks_rank_at
  ON lotto_picks(best_rank, created_at);

-- 원본 IP는 저장하지 않고, 일 단위로 회전하는 SHA-256 지문만 짧게 보관합니다.
CREATE TABLE IF NOT EXISTS lotto_rate_limits (
  fingerprint  TEXT    NOT NULL,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count >= 1),
  expires_at   INTEGER NOT NULL,
  PRIMARY KEY (fingerprint, window_start)
);
CREATE INDEX IF NOT EXISTS idx_lotto_rate_expiry ON lotto_rate_limits(expires_at);

-- 같은 방문자가 같은 번호 묶음을 반복 저장하는 것을 15분 동안 막습니다.
CREATE TABLE IF NOT EXISTS lotto_submission_guard (
  fingerprint TEXT    NOT NULL,
  payload_hash TEXT   NOT NULL,
  expires_at  INTEGER NOT NULL,
  PRIMARY KEY (fingerprint, payload_hash)
);
CREATE INDEX IF NOT EXISTS idx_lotto_guard_expiry ON lotto_submission_guard(expires_at);

-- GET 통계가 lotto_picks 전체를 반복 스캔하지 않도록 채점 시 누적하는 1행 카운터입니다.
CREATE TABLE IF NOT EXISTS lotto_public_stats (
  singleton    INTEGER PRIMARY KEY CHECK (singleton = 1),
  total_scored INTEGER NOT NULL DEFAULT 0,
  wins         INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO lotto_public_stats (singleton, total_scored, wins)
SELECT 1,
       COUNT(*),
       COALESCE(SUM(CASE WHEN best_rank BETWEEN 1 AND 5 THEN 1 ELSE 0 END), 0)
  FROM lotto_picks
 WHERE best_rank IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS trg_lotto_score_stats
AFTER UPDATE OF best_rank ON lotto_picks
WHEN OLD.best_rank IS NULL AND NEW.best_rank IS NOT NULL
BEGIN
  UPDATE lotto_public_stats
     SET total_scored = total_scored + 1,
         wins = wins + CASE WHEN NEW.best_rank BETWEEN 1 AND 5 THEN 1 ELSE 0 END
   WHERE singleton = 1;
END;
