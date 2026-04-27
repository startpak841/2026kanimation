-- ============================================================================
-- Migration 004: BUYERS 테이블에 관심 필드 3종 추가 (매칭 엔진 반영용)
-- ============================================================================
-- 실행 방법:
-- 1. Supabase 대시보드 → SQL Editor → New query
-- 2. 아래 내용 복사 → 붙여넣기 → Run
-- ============================================================================

ALTER TABLE buyers
  ADD COLUMN IF NOT EXISTS interested_genres       JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS interested_formats      JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS interested_target_ages  JSONB DEFAULT '[]'::jsonb;

-- 컬럼 설명 (선택)
COMMENT ON COLUMN buyers.interested_genres       IS 'IP × 바이어 매칭 엔진 — 바이어 관심 장르 (GENRE_OPTIONS 내 값, 다중 선택)';
COMMENT ON COLUMN buyers.interested_formats      IS 'IP × 바이어 매칭 엔진 — 바이어 관심 포맷 (FORMAT_OPTIONS 내 값, 다중 선택)';
COMMENT ON COLUMN buyers.interested_target_ages  IS 'IP × 바이어 매칭 엔진 — 바이어 관심 타겟 연령 (TARGET_AGE_OPTIONS 내 값, 다중 선택)';

-- 인덱스: JSONB GIN (배열 검색 최적화)
CREATE INDEX IF NOT EXISTS idx_buyers_interested_genres      ON buyers USING GIN (interested_genres);
CREATE INDEX IF NOT EXISTS idx_buyers_interested_formats     ON buyers USING GIN (interested_formats);
CREATE INDEX IF NOT EXISTS idx_buyers_interested_target_ages ON buyers USING GIN (interested_target_ages);

-- 검증 조회 (실행 후 확인용)
SELECT column_name, data_type, column_default
  FROM information_schema.columns
  WHERE table_name = 'buyers'
    AND column_name LIKE 'interested%'
  ORDER BY column_name;
