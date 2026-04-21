-- ══════════════════════════════════════════════════════════════
-- Financy — 실시간 채팅 테이블 초기 설정
-- Supabase 대시보드 → SQL Editor 에서 실행하세요.
-- ══════════════════════════════════════════════════════════════

-- 1. messages 테이블 생성
CREATE TABLE IF NOT EXISTS messages (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  user_name    text NOT NULL,
  content      text NOT NULL CHECK (char_length(content) <= 500),
  created_at   timestamptz DEFAULT now() NOT NULL
);

-- 성능용 인덱스 (최신순 조회 최적화)
CREATE INDEX IF NOT EXISTS messages_created_at_idx ON messages (created_at DESC);

-- ──────────────────────────────────────────────────────────────
-- 2. Row Level Security (RLS)
-- ──────────────────────────────────────────────────────────────
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- 모든 사람이 메시지 읽기 가능 (공개 채팅방)
CREATE POLICY "messages_select_all"
  ON messages FOR SELECT
  USING (true);

-- 로그인 유저만 본인 user_id로 삽입 가능
CREATE POLICY "messages_insert_own"
  ON messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 본인 메시지만 삭제 가능
CREATE POLICY "messages_delete_own"
  ON messages FOR DELETE
  USING (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────
-- 3. Realtime 활성화
-- ──────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- ══════════════════════════════════════════════════════════════
-- DB 자동 정리 — 저장 공간 절약
-- ══════════════════════════════════════════════════════════════

-- ── 방법 A: INSERT 트리거 (무료 플랜 포함, 항상 최신 500개 유지) ──
-- 새 메시지가 들어올 때마다 500개를 초과하는 오래된 메시지를 삭제합니다.
-- 대화량이 적은 앱에 적합합니다.

CREATE OR REPLACE FUNCTION trim_old_messages()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM messages
  WHERE id IN (
    SELECT id FROM messages
    ORDER BY created_at ASC
    OFFSET 500        -- 최신 500개만 보존
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trim_messages_on_insert
AFTER INSERT ON messages
FOR EACH STATEMENT EXECUTE PROCEDURE trim_old_messages();


-- ── 방법 B: pg_cron (Supabase Pro / 날짜 기준 정리) ──────────
-- 매일 새벽 2시에 7일 이상 된 메시지를 일괄 삭제합니다.
-- Supabase Pro 플랜의 pg_cron 확장이 필요합니다.
--
-- SELECT cron.schedule(
--   'financy-cleanup-chat',
--   '0 2 * * *',
--   $$DELETE FROM messages WHERE created_at < NOW() - INTERVAL '7 days';$$
-- );
--
-- 스케줄 삭제 시:
-- SELECT cron.unschedule('financy-cleanup-chat');
