// ============================================================================
// KAGS Data Access Layer
// Supabase 테이블 CRUD + snake_case ↔ camelCase 매핑
//
// 기존 코드는 camelCase (b.companyName, e.positionKo)를 사용하지만
// Postgres는 snake_case (company_name, position_ko) 컨벤션.
// 이 레이어가 양쪽을 변환해서 기존 컴포넌트 코드 수정을 최소화합니다.
// ============================================================================

import { supabase } from './supabaseClient.js';

// ============================================================================
// 공통 — 매퍼
// ============================================================================

// DB row → 기존 앱이 쓰는 형태로 변환
function buyerFromRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    project: r.project,
    companyName: r.company_name,
    contactName: r.contact_name,
    position: r.position,
    email: r.email,
    phone: r.phone,
    country: r.country,
    categories: r.categories || [],
    category: r.category,
    companySize: r.company_size,
    interestedProducts: r.interested_products,
    interestedGenres: r.interested_genres || [],
    interestedFormats: r.interested_formats || [],
    interestedTargetAges: r.interested_target_ages || [],
    interestedRegions: r.interested_regions || [],
    pitchingShowcase: r.pitching_showcase || '',
    invitationStatus: r.invitation_status,
    preferredDates: r.preferred_dates || [],
    source: r.source,
  };
}

function buyerToRow(b) {
  return {
    id: b.id,
    project: b.project || null,
    company_name: b.companyName,
    contact_name: b.contactName || null,
    position: b.position || null,
    email: b.email || null,
    phone: b.phone || null,
    country: b.country || null,
    categories: b.categories || [],
    category: b.category || null,
    company_size: b.companySize || null,
    interested_products: b.interestedProducts || null,
    interested_genres: b.interestedGenres || [],
    interested_formats: b.interestedFormats || [],
    interested_target_ages: b.interestedTargetAges || [],
    interested_regions: b.interestedRegions || [],
    pitching_showcase: b.pitchingShowcase || '',
    invitation_status: b.invitationStatus || null,
    preferred_dates: b.preferredDates || [],
    source: b.source || null,
  };
}

function meetingFromRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    exhibitorId: r.participant_id,
    buyerId: r.buyer_id,
    date: r.meeting_date,
    time: r.meeting_time ? r.meeting_time.substring(0, 5) : '',  // HH:MM:SS → HH:MM
    table: r.table_number,
    status: r.status,
    notes: r.notes,
    source: r.source,
    createdBy: r.created_by,
  };
}

function meetingToRow(m) {
  return {
    id: m.id,
    participant_id: m.exhibitorId,
    buyer_id: m.buyerId,
    meeting_date: m.date,
    meeting_time: m.time,
    table_number: m.table || null,
    status: m.status || 'confirmed',
    notes: m.notes || null,
    source: m.source || null,
    created_by: m.createdBy || null,
  };
}

// 참가사는 IP/이미지가 nested라서 별도 페치 후 조립
async function participantFromRow(r, { includeIps = true } = {}) {
  if (!r) return null;
  const base = {
    id: r.id,
    project: r.project,
    loginId: r.login_id,
    password: r.password,
    companyName: r.company_name,
    companyNameEn: r.company_name_en,
    contactName: r.contact_name,
    contactNameEn: r.contact_name_en,
    positionKo: r.position_ko,
    positionEn: r.position_en,
    email: r.email,
    phone: r.phone,
    logoKey: r.logo_path,  // storage path
    logoMeta: r.logo_meta,
    introEn: r.intro_en,
    survey: r.survey || {},
    updatedAt: r.updated_at,
    sectionsUpdatedAt: r.sections_updated_at || {},
    ips: [],
  };

  if (includeIps) {
    const { data: ipsRows } = await supabase
      .from('ips')
      .select('*, ip_images(*)')
      .eq('participant_id', r.id)
      .order('created_at', { ascending: true });

    base.ips = (ipsRows || []).map(ipFromRow);
  }

  return base;
}

function ipFromRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    nameEn: r.name_en,
    introEn: r.intro_en,
    genre: r.genre,
    targetAge: r.target_age,
    format: r.format,
    episodes: r.episodes,
    seasons: r.seasons,
    runtimeMin: r.runtime_min,
    runtimeSec: r.runtime_sec,
    desiredBuyerPriority: r.desired_buyer_priority || [],
    desiredBuyerPriorityOther: r.desired_buyer_priority_other || [],
    regions: r.regions || [],
    images: (r.ip_images || []).map(img => ({
      key: img.storage_path,
      id: img.id,
      name: img.file_name,
      type: img.file_type,
      size: img.file_size,
    })),
  };
}

function ipToRow(ip, participantId) {
  return {
    id: ip.id,
    participant_id: participantId,
    name: ip.name || null,
    name_en: ip.nameEn || null,
    intro_en: ip.introEn || null,
    genre: ip.genre || null,
    target_age: ip.targetAge || null,
    format: ip.format || null,
    episodes: ip.episodes || null,
    seasons: ip.seasons || null,
    runtime_min: ip.runtimeMin || null,
    runtime_sec: ip.runtimeSec || null,
    desired_buyer_priority: ip.desiredBuyerPriority || [],
    desired_buyer_priority_other: ip.desiredBuyerPriorityOther || [],
    regions: ip.regions || [],
  };
}

// ============================================================================
// BUYERS
// ============================================================================
export const buyersAPI = {
  async list() {
    const { data, error } = await supabase.from('buyers').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(buyerFromRow);
  },

  async upsert(buyer) {
    const { data, error } = await supabase.from('buyers').upsert(buyerToRow(buyer)).select().single();
    if (error) throw error;
    return buyerFromRow(data);
  },

  async upsertMany(buyers) {
    if (!buyers.length) return [];
    const { data, error } = await supabase.from('buyers').upsert(buyers.map(buyerToRow)).select();
    if (error) throw error;
    return (data || []).map(buyerFromRow);
  },

  async delete(id) {
    const { error } = await supabase.from('buyers').delete().eq('id', id);
    if (error) throw error;
  },

  async deleteMany(ids) {
    if (!ids.length) return;
    const { error } = await supabase.from('buyers').delete().in('id', ids);
    if (error) throw error;
  },
};

// ============================================================================
// PARTICIPANTS (참가사)
// ============================================================================
export const participantsAPI = {
  async list() {
    const { data, error } = await supabase.from('participants').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    const result = [];
    for (const r of (data || [])) {
      result.push(await participantFromRow(r));
    }
    return result;
  },

  async getByLogin(loginId, password) {
    const { data, error } = await supabase
      .from('participants')
      .select('*')
      .eq('login_id', loginId)
      .eq('password', password)
      .maybeSingle();
    if (error) throw error;
    return data ? await participantFromRow(data) : null;
  },

  async updateProfile(id, fields) {
    // fields: camelCase 키
    const payload = {};
    if (fields.companyName !== undefined)    payload.company_name = fields.companyName;
    if (fields.companyNameEn !== undefined)  payload.company_name_en = fields.companyNameEn;
    if (fields.contactName !== undefined)    payload.contact_name = fields.contactName;
    if (fields.contactNameEn !== undefined)  payload.contact_name_en = fields.contactNameEn;
    if (fields.positionKo !== undefined)     payload.position_ko = fields.positionKo;
    if (fields.positionEn !== undefined)     payload.position_en = fields.positionEn;
    if (fields.email !== undefined)          payload.email = fields.email;
    if (fields.phone !== undefined)          payload.phone = fields.phone;
    if (fields.introEn !== undefined)        payload.intro_en = fields.introEn;
    if (fields.logoKey !== undefined)        payload.logo_path = fields.logoKey;
    if (fields.logoMeta !== undefined)       payload.logo_meta = fields.logoMeta;
    if (fields.survey !== undefined)         payload.survey = fields.survey;
    if (fields.sectionsUpdatedAt !== undefined) payload.sections_updated_at = fields.sectionsUpdatedAt;

    const { data, error } = await supabase.from('participants').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return await participantFromRow(data);
  },
};

// ============================================================================
// IPS
// ============================================================================
export const ipsAPI = {
  async upsert(ip, participantId) {
    const { data, error } = await supabase.from('ips').upsert(ipToRow(ip, participantId)).select().single();
    if (error) throw error;
    // 이미지는 별도로 처리됨
    const merged = ipFromRow(data);
    merged.images = ip.images || [];
    return merged;
  },

  async delete(id) {
    const { error } = await supabase.from('ips').delete().eq('id', id);
    if (error) throw error;
  },
};

// ============================================================================
// IP_IMAGES
// ============================================================================
export const ipImagesAPI = {
  async insert(ipId, { id, storagePath, fileName, fileType, fileSize }) {
    const { data, error } = await supabase.from('ip_images').insert({
      id,
      ip_id: ipId,
      storage_path: storagePath,
      file_name: fileName,
      file_type: fileType,
      file_size: fileSize,
    }).select().single();
    if (error) throw error;
    return data;
  },

  async delete(id) {
    const { error } = await supabase.from('ip_images').delete().eq('id', id);
    if (error) throw error;
  },
};

// ============================================================================
// MEETINGS
// ============================================================================
export const meetingsAPI = {
  async list() {
    const { data, error } = await supabase.from('meetings').select('*').order('meeting_date', { ascending: true });
    if (error) throw error;
    return (data || []).map(meetingFromRow);
  },

  async upsert(m) {
    const { data, error } = await supabase.from('meetings').upsert(meetingToRow(m)).select().single();
    if (error) throw error;
    return meetingFromRow(data);
  },

  async delete(id) {
    const { error } = await supabase.from('meetings').delete().eq('id', id);
    if (error) throw error;
  },
};

// ============================================================================
// STORAGE (이미지 업로드)
// ============================================================================
export const storageAPI = {
  async uploadImage(path, fileOrBlob) {
    const { error } = await supabase.storage.from('images').upload(path, fileOrBlob, {
      cacheControl: '3600',
      upsert: true,
    });
    if (error) throw error;
    return path;
  },

  getPublicUrl(path) {
    if (!path) return null;
    const { data } = supabase.storage.from('images').getPublicUrl(path);
    return data?.publicUrl || null;
  },

  async delete(path) {
    if (!path) return;
    const { error } = await supabase.storage.from('images').remove([path]);
    if (error) throw error;
  },

  // 파일을 읽어 data URL로 반환 (기존 loadBlob 호환)
  async downloadAsDataUrl(path) {
    if (!path) return null;
    const { data, error } = await supabase.storage.from('images').download(path);
    if (error) throw error;
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(data);
    });
  },
};

// ============================================================================
// REALTIME 구독
// 각 테이블의 INSERT/UPDATE/DELETE를 실시간으로 받아서 콜백 호출
// ============================================================================
export function subscribeAll(onTableChange) {
  const channel = supabase.channel('kags-realtime');
  const tables = ['participants', 'ips', 'ip_images', 'buyers', 'meetings'];
  tables.forEach(table => {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
      onTableChange(table, payload);
    });
  });
  channel.subscribe();
  return () => supabase.removeChannel(channel);
}
