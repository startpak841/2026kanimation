-- ============================================================================
-- Migration 007: BUYERS 테이블에 피칭쇼케이스 참석여부 추가
-- ============================================================================
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 복붙 → Run
-- ============================================================================

ALTER TABLE buyers
  ADD COLUMN IF NOT EXISTS pitching_showcase TEXT DEFAULT '';

COMMENT ON COLUMN buyers.pitching_showcase IS
  '피칭쇼케이스 참석 여부 (참석/불참/미정/공백). 비즈니스 미팅 스케줄로 등록된 바이어는 빈 값으로 유지됨.';

-- 검증
SELECT column_name, data_type, column_default
  FROM information_schema.columns
  WHERE table_name = 'buyers'
    AND column_name = 'pitching_showcase';
