-- ============================================================================
-- Migration 008: BUYERS 테이블에 확정 미팅 정보 컬럼 추가
-- ============================================================================
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 복붙 → Run
--
-- 비즈니스 상담 스케줄에서 미팅이 편성/이동되면 해당 바이어의 확정 정보가
-- 자동으로 동기화됩니다. RSVP 회신 페이지에서 희망 일정과 확정 일정을 함께
-- 조회할 수 있습니다.
-- ============================================================================

ALTER TABLE buyers
  ADD COLUMN IF NOT EXISTS confirmed_date TEXT,
  ADD COLUMN IF NOT EXISTS confirmed_time TEXT,
  ADD COLUMN IF NOT EXISTS confirmed_exhibitor_id TEXT;

COMMENT ON COLUMN buyers.confirmed_date IS
  '확정 미팅 날짜 (YYYY-MM-DD). 비즈니스 상담 스케줄에서 편성된 미팅 기준.';
COMMENT ON COLUMN buyers.confirmed_time IS
  '확정 미팅 시간 (HH:MM). 비즈니스 상담 스케줄에서 편성된 미팅 기준.';
COMMENT ON COLUMN buyers.confirmed_exhibitor_id IS
  '확정 매칭 참가사 ID. 비즈니스 상담 스케줄에서 편성된 미팅 기준.';

-- 검증
SELECT column_name, data_type, column_default
  FROM information_schema.columns
  WHERE table_name = 'buyers'
    AND column_name IN ('confirmed_date', 'confirmed_time', 'confirmed_exhibitor_id');
