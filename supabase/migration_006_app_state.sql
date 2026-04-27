-- ============================================================================
-- Migration 006: app_state 테이블 (전체 앱 상태를 단일 JSON으로 보관)
-- ============================================================================
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 복붙 → Run
--
-- 이 테이블은 KAGS 플랫폼의 모든 데이터(참가사·바이어·미팅·RSVP 등)를
-- 단일 JSON으로 보관하는 핵심 테이블입니다.
-- 이미지는 Storage에 별도 저장됩니다.
-- ============================================================================

CREATE TABLE IF NOT EXISTS app_state (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION app_state_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_app_state_updated ON app_state;
CREATE TRIGGER trg_app_state_updated
  BEFORE UPDATE ON app_state
  FOR EACH ROW EXECUTE FUNCTION app_state_update_timestamp();

-- RLS 활성화 + 누구나 읽고 쓸 수 있는 정책 (초기 단계)
ALTER TABLE app_state ENABLE ROW LEVEL SECURITY;

-- 기존 정책이 있으면 삭제 후 재생성 (재실행 안전성)
DROP POLICY IF EXISTS "Allow all anon" ON app_state;
CREATE POLICY "Allow all anon" ON app_state
  FOR ALL USING (true) WITH CHECK (true);

-- Realtime 활성화 (실시간 동기화)
ALTER PUBLICATION supabase_realtime ADD TABLE app_state;

-- 검증
SELECT key, jsonb_pretty(value)::text AS value_preview, updated_at
  FROM app_state;
