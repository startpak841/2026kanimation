// ============================================================================
// window.storage 폴리필 — Supabase 백엔드 버전
// ----------------------------------------------------------------------------
// 기존 BuyerMatchingPlatform.jsx의 window.storage.{get,set,delete,list} API를
// Supabase로 백엔드 전환. 코드 시그니처는 동일하므로 기존 컴포넌트 100% 호환.
//
// 데이터 저장 전략:
// - 텍스트 데이터(JSON) → Supabase 테이블 app_state(key, value JSONB)
// - 이미지(base64) → Supabase Storage 버킷 'images'
//
// 키 분기 규칙:
// - 키에 'logo:' 또는 'ipimg:' 접두어 있고 value가 base64 data URL이면 → Storage
// - 그 외 → app_state 테이블
//
// 동기화: Supabase Realtime으로 다른 탭/기기에 즉시 전파
// ============================================================================

import { supabase } from './supabaseClient.js';

const TABLE = 'app_state';
const BUCKET = 'images';

// ----- 헬퍼 -----
function isImageKey(key) {
  return /^(logo|ipimg|chunk|cover):/i.test(key);
}

function isDataUrl(value) {
  return typeof value === 'string' && value.startsWith('data:');
}

function isImageMetaJson(value) {
  // 청크 메타데이터 ({name, type, size, chunks: N}) 인지 확인
  if (typeof value !== 'string') return false;
  try {
    const obj = JSON.parse(value);
    return obj && typeof obj === 'object' && 'chunks' in obj && 'name' in obj;
  } catch { return false; }
}

// data URL → Blob 변환
function dataUrlToBlob(dataUrl) {
  const [meta, b64] = dataUrl.split(',');
  const mime = (meta.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// Blob → data URL 변환
async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// 콜론(:) 등 storage path에 부적합한 문자를 안전한 형태로 치환
function safePath(key) {
  // Supabase Storage는 콜론 OK이지만 일부 케이스에서 문제될 수 있어 슬래시로 치환
  return key.replace(/:/g, '/');
}

// ===========================================================================
// 메인 storage API
// ===========================================================================

const storage = {
  // ------------------------------------------------------------------
  // GET
  // ------------------------------------------------------------------
  async get(key, shared = false) {
    try {
      // 1) 이미지 키인 경우 Storage 시도
      if (isImageKey(key)) {
        try {
          const path = safePath(key);
          const { data, error } = await supabase.storage.from(BUCKET).download(path);
          if (!error && data) {
            const dataUrl = await blobToDataUrl(data);
            return { key, value: dataUrl, shared: !!shared };
          }
        } catch (e) {
          // Storage에 없으면 app_state로 fallback (메타데이터일 수 있음)
        }
      }

      // 2) app_state 테이블 조회
      const { data, error } = await supabase
        .from(TABLE)
        .select('value')
        .eq('key', key)
        .maybeSingle();

      if (error) {
        console.error('[storage.get] error:', error);
        return null;
      }
      if (!data) return null;

      // value는 JSONB라서 객체로 옴 → 문자열로 직렬화 (기존 API 호환)
      const v = typeof data.value === 'string' ? data.value : JSON.stringify(data.value);
      return { key, value: v, shared: !!shared };
    } catch (e) {
      console.error('[storage.get] exception:', e);
      return null;
    }
  },

  // ------------------------------------------------------------------
  // SET
  // ------------------------------------------------------------------
  async set(key, value, shared = false) {
    try {
      const str = typeof value === 'string' ? value : String(value);

      // 1) 이미지 키 + data URL → Storage 저장
      if (isImageKey(key) && isDataUrl(str)) {
        try {
          const blob = dataUrlToBlob(str);
          const path = safePath(key);
          const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
            cacheControl: '3600',
            upsert: true,
            contentType: blob.type,
          });
          if (error) {
            console.error('[storage.set] image upload error:', error);
            // Storage 실패 시 app_state로 fallback
          } else {
            return { key, value: str, shared: !!shared };
          }
        } catch (e) {
          console.error('[storage.set] image conversion error:', e);
        }
      }

      // 2) JSON 메타데이터 또는 일반 텍스트 → app_state
      // value를 파싱 시도 — 가능하면 JSONB로 저장
      let jsonValue;
      try {
        jsonValue = JSON.parse(str);
      } catch {
        jsonValue = str;
      }

      const { error } = await supabase
        .from(TABLE)
        .upsert({ key, value: jsonValue }, { onConflict: 'key' });

      if (error) {
        console.error('[storage.set] table upsert error:', error);
        return null;
      }
      return { key, value: str, shared: !!shared };
    } catch (e) {
      console.error('[storage.set] exception:', e);
      return null;
    }
  },

  // ------------------------------------------------------------------
  // DELETE
  // ------------------------------------------------------------------
  async delete(key, shared = false) {
    try {
      // 이미지일 가능성 → Storage에서도 삭제 시도
      if (isImageKey(key)) {
        try {
          const path = safePath(key);
          await supabase.storage.from(BUCKET).remove([path]);
        } catch { /* 무시 */ }
      }

      // app_state에서 삭제
      const { error } = await supabase
        .from(TABLE)
        .delete()
        .eq('key', key);

      if (error) {
        console.error('[storage.delete] error:', error);
        return null;
      }
      return { key, deleted: true, shared: !!shared };
    } catch (e) {
      console.error('[storage.delete] exception:', e);
      return null;
    }
  },

  // ------------------------------------------------------------------
  // LIST
  // ------------------------------------------------------------------
  async list(prefix = '', shared = false) {
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select('key')
        .like('key', `${prefix}%`);

      if (error) {
        console.error('[storage.list] error:', error);
        return null;
      }
      const keys = (data || []).map(r => r.key);
      return { keys, prefix, shared: !!shared };
    } catch (e) {
      console.error('[storage.list] exception:', e);
      return null;
    }
  },
};

// ===========================================================================
// Realtime — 다른 탭/기기에서 변경 시 자동 알림
// ===========================================================================
let realtimeChannel = null;

function setupRealtime() {
  if (realtimeChannel) return;
  try {
    realtimeChannel = supabase.channel('app_state_sync');
    realtimeChannel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: TABLE },
      (payload) => {
        const key = payload.new?.key || payload.old?.key;
        if (!key) return;
        // 메인 state key가 변경되면 window 이벤트 발화
        if (key === 'kags_platform_state_v6') {
          window.dispatchEvent(new CustomEvent('kags-storage-sync', {
            detail: { key, value: null }
          }));
        }
      }
    );
    realtimeChannel.subscribe();
  } catch (e) {
    console.warn('[realtime] setup failed:', e);
  }
}

// ===========================================================================
// 전역 등록
// ===========================================================================
if (typeof window !== 'undefined') {
  window.storage = storage;
  setupRealtime();
}

export default storage;
