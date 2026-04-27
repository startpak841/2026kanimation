// ============================================================================
// Supabase 클라이언트 초기화
//
// 환경변수 (권장 · 배포 시):
// - VITE_SUPABASE_URL:      https://xxxxx.supabase.co
// - VITE_SUPABASE_ANON_KEY: eyJhbGci... (public anon key)
//
// 환경변수 없으면 아래 fallback 사용 (개발 편의용)
// ============================================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://cabpmmgqzylurerbnmlh.supabase.co';

const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhYnBtbWdxenlsdXJlcmJubWxoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyNzUwMzMsImV4cCI6MjA5Mjg1MTAzM30._UXQg-yuTdQKYcQSYGrnbYUB90XdLfy5aeomHhUj1Jk';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

export const isSupabaseConfigured = true;

if (typeof window !== 'undefined') {
  window.__supabase = supabase; // 디버깅용
}

export default supabase;
