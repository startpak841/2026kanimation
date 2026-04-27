-- ============================================================================
-- K-ANIMATION GLOBAL SHOWCASE · Buyer Matching Platform
-- Supabase Schema v1.0
-- ============================================================================
-- 실행 방법:
-- 1. Supabase 대시보드 → SQL Editor → New query
-- 2. 이 파일 전체를 복사해서 붙여넣기
-- 3. 우하단 "Run" 클릭
-- ============================================================================

-- ============================================================================
-- 1. PARTICIPANTS (참가사) 테이블
-- ============================================================================
CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL CHECK (project IN ('MIFA','MIPCOM','CANADA')),

  -- 로그인 (Supabase Auth 연동 전 임시 유지 — 나중에 auth.users로 옮김)
  login_id TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,  -- 임시. 향후 supabase auth로 마이그레이션

  -- 기본 정보
  company_name TEXT,
  company_name_en TEXT,
  contact_name TEXT,
  contact_name_en TEXT,
  position_ko TEXT,
  position_en TEXT,
  email TEXT,
  phone TEXT,

  -- 로고 (Supabase Storage 파일 경로 참조)
  logo_path TEXT,
  logo_meta JSONB,  -- { name, type, size }

  -- 회사 소개
  intro_en TEXT,

  -- 수요조사 (전체를 JSON으로 저장 — 유연한 구조)
  survey JSONB DEFAULT '{}'::jsonb,

  -- 타임스탬프
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  sections_updated_at JSONB DEFAULT '{}'::jsonb  -- { profile, intro, ips, survey }
);

CREATE INDEX IF NOT EXISTS idx_participants_project ON participants(project);
CREATE INDEX IF NOT EXISTS idx_participants_login ON participants(login_id);

-- ============================================================================
-- 2. IPS (지적재산권) 테이블 — 참가사별 여러 IP 소유
-- ============================================================================
CREATE TABLE IF NOT EXISTS ips (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,

  -- 기본 정보
  name TEXT,
  name_en TEXT,
  genre TEXT,
  target_age TEXT,
  format TEXT,
  episodes INT,
  seasons INT,
  runtime_min INT,
  runtime_sec INT,

  -- 희망 바이어 우선순위 (JSON 배열)
  desired_buyer_priority JSONB DEFAULT '[]'::jsonb,       -- ['OTT...', 'Broadcaster...', ...]
  desired_buyer_priority_other JSONB DEFAULT '[]'::jsonb, -- 기타 카테고리 설명

  -- 타겟 권역
  regions JSONB DEFAULT '[]'::jsonb,  -- ['WW', 'NA', 'EU', ...]

  -- 타임스탬프
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ips_participant ON ips(participant_id);

-- ============================================================================
-- 3. IP_IMAGES 테이블 — IP별 이미지 (Storage 경로 참조)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ip_images (
  id TEXT PRIMARY KEY,
  ip_id TEXT NOT NULL REFERENCES ips(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,  -- storage bucket 내 경로
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ip_images_ip ON ip_images(ip_id);

-- ============================================================================
-- 4. BUYERS (바이어) 테이블
-- ============================================================================
CREATE TABLE IF NOT EXISTS buyers (
  id TEXT PRIMARY KEY,
  project TEXT CHECK (project IN ('MIFA','MIPCOM','CANADA')),

  -- 기본 정보
  company_name TEXT NOT NULL,
  contact_name TEXT,
  position TEXT,
  email TEXT,
  phone TEXT,
  country TEXT,

  -- 분류 (다중 카테고리)
  categories JSONB DEFAULT '[]'::jsonb,  -- ['Broadcaster (방송사)', 'Streaming / OTT 플랫폼', ...]
  category TEXT,  -- 레거시 단일 카테고리 (호환성 유지)
  company_size TEXT,
  interested_products TEXT,
  -- 매칭 엔진 반영 필드 (IP × 바이어 스코어링에 사용)
  interested_genres JSONB DEFAULT '[]'::jsonb,
  interested_formats JSONB DEFAULT '[]'::jsonb,
  interested_target_ages JSONB DEFAULT '[]'::jsonb,
  interested_regions JSONB DEFAULT '[]'::jsonb,

  -- 초청 & RSVP
  invitation_status TEXT CHECK (invitation_status IN ('sent','pending','accepted','declined') OR invitation_status IS NULL),
  preferred_dates JSONB DEFAULT '[]'::jsonb,
  source TEXT,  -- 'google_form', 'exhibitor_added', 'admin_added', 'rsvp_manual'

  -- 타임스탬프
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_buyers_project ON buyers(project);
CREATE INDEX IF NOT EXISTS idx_buyers_status ON buyers(invitation_status);
CREATE INDEX IF NOT EXISTS idx_buyers_source ON buyers(source);

-- ============================================================================
-- 5. MEETINGS (비즈니스 미팅) 테이블
-- ============================================================================
CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  buyer_id TEXT NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,

  -- 스케줄
  meeting_date DATE NOT NULL,
  meeting_time TIME NOT NULL,
  table_number TEXT,
  status TEXT DEFAULT 'confirmed',
  notes TEXT,

  -- 출처
  source TEXT,  -- 'rsvp_match', 'exhibitor_self', 'admin_manual', 'admin_added', 'exhibitor_added'
  created_by TEXT,  -- 'admin' or participant_id

  -- 타임스탬프
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meetings_participant ON meetings(participant_id);
CREATE INDEX IF NOT EXISTS idx_meetings_buyer ON meetings(buyer_id);
CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(meeting_date, meeting_time);

-- ============================================================================
-- 6. RSVP_SHEET_SYNC — 구글 스프레드시트 동기화 시각 기록
-- ============================================================================
CREATE TABLE IF NOT EXISTS rsvp_sheet_sync (
  project TEXT PRIMARY KEY CHECK (project IN ('MIFA','MIPCOM','CANADA')),
  last_synced_at TIMESTAMPTZ,
  last_result JSONB  -- { added: 5, updated: 2, via: 'file' 등 }
);

-- ============================================================================
-- 7. INVITATION_LOG — 초청 발송 이력
-- ============================================================================
CREATE TABLE IF NOT EXISTS invitation_log (
  id BIGSERIAL PRIMARY KEY,
  buyer_id TEXT REFERENCES buyers(id) ON DELETE SET NULL,
  action TEXT,  -- 'sent', 'resent' 등
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  sent_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_invitation_log_buyer ON invitation_log(buyer_id);

-- ============================================================================
-- 8. UPDATED_AT 자동 갱신 트리거
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_participants_updated ON participants;
CREATE TRIGGER trg_participants_updated
  BEFORE UPDATE ON participants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_ips_updated ON ips;
CREATE TRIGGER trg_ips_updated
  BEFORE UPDATE ON ips
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_buyers_updated ON buyers;
CREATE TRIGGER trg_buyers_updated
  BEFORE UPDATE ON buyers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_meetings_updated ON meetings;
CREATE TRIGGER trg_meetings_updated
  BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 9. REALTIME 활성화 — 실시간 구독
-- ============================================================================
-- 각 테이블의 변경 사항이 실시간으로 클라이언트에 푸시됨
ALTER PUBLICATION supabase_realtime ADD TABLE participants;
ALTER PUBLICATION supabase_realtime ADD TABLE ips;
ALTER PUBLICATION supabase_realtime ADD TABLE ip_images;
ALTER PUBLICATION supabase_realtime ADD TABLE buyers;
ALTER PUBLICATION supabase_realtime ADD TABLE meetings;
ALTER PUBLICATION supabase_realtime ADD TABLE rsvp_sheet_sync;
ALTER PUBLICATION supabase_realtime ADD TABLE invitation_log;

-- ============================================================================
-- 10. RLS (Row Level Security) — 간단한 초기 정책
-- ============================================================================
-- ⚠️ 초기에는 모든 테이블에 공개 읽기/쓰기 허용 (운영 초기 데모 단계)
-- 향후 Supabase Auth 연동 후 각 테이블별 세밀한 권한 제어로 전환 예정
--
-- 예시 (향후 적용):
--   참가사는 본인 레코드만 UPDATE 가능
--   바이어 DB는 관리자만 INSERT/UPDATE/DELETE
--   미팅은 본인 관련만 SELECT
-- ============================================================================
ALTER TABLE participants     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ips              ENABLE ROW LEVEL SECURITY;
ALTER TABLE ip_images        ENABLE ROW LEVEL SECURITY;
ALTER TABLE buyers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE rsvp_sheet_sync  ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitation_log   ENABLE ROW LEVEL SECURITY;

-- 초기 단계: anon(비인증) 사용자도 전체 CRUD 허용
-- ⚠️ 프로덕션에서는 이 부분을 반드시 제한적 정책으로 교체
CREATE POLICY "Allow all for anon" ON participants
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON ips
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON ip_images
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON buyers
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON meetings
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON rsvp_sheet_sync
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON invitation_log
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- 11. 초기 참가사 6개 시드 데이터 (현재 하드코딩된 계정 그대로)
-- ============================================================================
INSERT INTO participants (id, project, login_id, password, company_name) VALUES
  ('EX-MIFA-01',   'MIFA',   'climax',     '4728', '클라이맥스 스튜디오'),
  ('EX-MIFA-02',   'MIFA',   'pixtrend',   '3165', '픽스트랜드'),
  ('EX-MIFA-03',   'MIFA',   'devsisters', '8492', '데브시스터즈'),
  ('EX-MIFA-04',   'MIFA',   'shelter',    '5037', '스튜디오쉘터'),
  ('EX-MIFA-05',   'MIFA',   'animal',     '9184', '스튜디오애니멀')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 완료!
-- 다음 단계:
-- 1. Storage에서 "images" 버킷을 public으로 생성
-- 2. Settings → API에서 URL과 anon key 확보
-- 3. Vercel 환경변수에 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 추가
-- ============================================================================
