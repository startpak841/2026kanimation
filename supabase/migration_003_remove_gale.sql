-- ============================================================================
-- Migration 003: MIPCOM 스튜디오 게일 참가사 삭제
-- ============================================================================
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 복붙 → Run
-- ⚠️ 주의: 해당 참가사의 IP/이미지/미팅이 CASCADE로 함께 삭제됩니다.
-- ============================================================================

-- 삭제 전 확인 (연관 데이터 건수 조회)
SELECT
  (SELECT COUNT(*) FROM participants WHERE id = 'EX-MIPCOM-01')   AS participants_count,
  (SELECT COUNT(*) FROM ips          WHERE participant_id = 'EX-MIPCOM-01') AS ips_count,
  (SELECT COUNT(*) FROM meetings     WHERE participant_id = 'EX-MIPCOM-01') AS meetings_count;

-- 삭제 실행 (ON DELETE CASCADE로 연관 ips/meetings/ip_images 자동 삭제)
DELETE FROM participants WHERE id = 'EX-MIPCOM-01';

-- 검증 조회
SELECT id, project, login_id, company_name
  FROM participants
  ORDER BY id;
