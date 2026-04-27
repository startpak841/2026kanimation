// ============================================================================
// Supabase 클라이언트 초기화
//
// 환경변수 필요 (.env.local 또는 Vercel 환경변수):
// - VITE_SUPABASE_URL:      https://xxxxx.supabase.co
// - VITE_SUPABASE_ANON_KEY: eyJhbGci... (public anon key)
//
// Settings → API 탭에서 복사할 수 있습니다.
// ============================================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    '%c⚠️ Supabase 환경변수가 설정되지 않았습니다.',
    'color: red; font-size: 14px; font-weight: bold;'
  );
  console.error(
    '.env.local 파일에 VITE_SUPABASE_URL과 VITE_SUPABASE_ANON_KEY를 추가하세요.\n' +
    'Vercel에 배포할 때는 Settings → Environment Variables에 추가하세요.'
  );
}

export const supabase = createClient(
  SUPABASE_URL || 'https://missing.supabase.co',
  SUPABASE_ANON_KEY || 'missing-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  }
);

// 연결 여부 확인 헬퍼
export const isSupabaseConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

export default supabase;
