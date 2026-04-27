-- ============================================================================
-- Migration 002: MIFA 참가사 로그인 ID 변경
-- ============================================================================
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 복붙 → Run
-- ============================================================================

-- 픽스트랜드: pixtrand → pixtrend
UPDATE participants
  SET login_id = 'pixtrend'
  WHERE id = 'EX-MIFA-02' AND login_id = 'pixtrand';

-- 스튜디오애니멀: animall → animal
UPDATE participants
  SET login_id = 'animal'
  WHERE id = 'EX-MIFA-05' AND login_id = 'animall';

-- 검증 조회 (실행 후 결과 확인용)
SELECT id, project, login_id, company_name
  FROM participants
  WHERE project = 'MIFA'
  ORDER BY id;
