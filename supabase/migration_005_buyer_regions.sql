-- ============================================================================
-- Migration 005: BUYERS 테이블에 관심 권역 컬럼 추가
-- ============================================================================
-- 실행 방법:
-- 1. Supabase 대시보드 → SQL Editor → New query
-- 2. 아래 내용 복사 → 붙여넣기 → Run
-- ============================================================================

ALTER TABLE buyers
  ADD COLUMN IF NOT EXISTS interested_regions JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN buyers.interested_regions IS
  'IP × 바이어 매칭 엔진 — 바이어 관심/활동 권역 (REGIONS key 배열: WW/NA/EU/AS/ME/LA/OC/AF, 다중 선택)';

-- JSONB GIN 인덱스 (배열 검색 최적화)
CREATE INDEX IF NOT EXISTS idx_buyers_interested_regions ON buyers USING GIN (interested_regions);

-- 검증 조회
SELECT column_name, data_type, column_default
  FROM information_schema.columns
  WHERE table_name = 'buyers'
    AND column_name = 'interested_regions';
