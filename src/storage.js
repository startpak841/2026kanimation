// ============================================================================
// window.storage 폴리필 (localStorage 백엔드 + BroadcastChannel 실시간 동기화)
// Claude artifact의 `window.storage` KV API와 동일한 시그니처 제공
// get/set/delete/list 전부 async — 원본 API와 호환
//
// 실시간 동기화:
// - 같은 origin의 여러 탭/창 간 BroadcastChannel로 즉시 알림
// - 각 탭의 React 앱이 'storage' 또는 'kags-storage-sync' 이벤트를 듣고 state 갱신
// ============================================================================

const PREFIX_PRIVATE = '__kv_private__';
const PREFIX_SHARED  = '__kv_shared__';
const CHANNEL_NAME = 'kags_platform_sync';

function prefixOf(shared) {
  return `${shared ? PREFIX_SHARED : PREFIX_PRIVATE}::`;
}

function fullKey(key, shared) {
  return `${prefixOf(shared)}${key}`;
}

// BroadcastChannel - 같은 origin의 모든 탭/iframe에 메시지 전달
let bc = null;
if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
  try {
    bc = new BroadcastChannel(CHANNEL_NAME);
  } catch (e) {
    // BroadcastChannel 미지원 브라우저 — 무시. localStorage storage 이벤트로 대체 동작
  }
}

// 다른 탭에서 온 broadcast 수신 → window CustomEvent로 React 앱에 전달
if (bc) {
  bc.onmessage = (ev) => {
    const { type, key, value } = ev.data || {};
    if (type === 'set' || type === 'delete') {
      window.dispatchEvent(new CustomEvent('kags-storage-sync', {
        detail: { key, value, type }
      }));
    }
  };
}

function broadcast(type, key, value) {
  if (!bc) return;
  try {
    bc.postMessage({ type, key, value });
  } catch (e) {
    // payload가 너무 크거나 문제가 있으면 조용히 실패 (localStorage만으로 동작)
  }
}

const storage = {
  async get(key, shared = false) {
    try {
      const v = localStorage.getItem(fullKey(key, shared));
      if (v === null) return null;
      return { key, value: v, shared: !!shared };
    } catch (e) {
      console.error('[storage.get] failed:', e);
      return null;
    }
  },

  async set(key, value, shared = false) {
    try {
      const str = String(value);
      localStorage.setItem(fullKey(key, shared), str);
      // 다른 탭에 즉시 알림 (2MB 이하만 payload 전달, 크면 알림만)
      if (str.length < 2 * 1024 * 1024) {
        broadcast('set', key, str);
      } else {
        broadcast('set', key, null);
      }
      return { key, value, shared: !!shared };
    } catch (e) {
      console.error('[storage.set] quota exceeded or other error:', e);
      if (!window.__storageQuotaWarned) {
        window.__storageQuotaWarned = true;
        alert(
          '⚠️ 브라우저 저장 용량을 초과했습니다.\n\n' +
          '가능한 조치:\n' +
          '• 이미지 업로드 크기를 줄여주세요 (권장 5MB 이하)\n' +
          '• 바이어 DB를 엑셀로 백업 후 일부 삭제\n' +
          '• 실 운영에는 서버 연동 버전(Supabase)으로 업그레이드 권장'
        );
      }
      return null;
    }
  },

  async delete(key, shared = false) {
    try {
      localStorage.removeItem(fullKey(key, shared));
      broadcast('delete', key, null);
      return { key, deleted: true, shared: !!shared };
    } catch (e) {
      console.error('[storage.delete] failed:', e);
      return null;
    }
  },

  async list(prefix = '', shared = false) {
    try {
      const p = prefixOf(shared);
      const search = `${p}${prefix}`;
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(search)) {
          keys.push(k.substring(p.length));
        }
      }
      return { keys, prefix, shared: !!shared };
    } catch (e) {
      console.error('[storage.list] failed:', e);
      return null;
    }
  },
};

// 전역 등록
if (typeof window !== 'undefined') {
  window.storage = storage;
}

export default storage;
