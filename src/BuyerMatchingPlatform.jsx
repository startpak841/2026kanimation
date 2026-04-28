import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Building2, Users, Calendar, Upload, LogOut, Mail, Sparkles, Target,
  Search, Edit3, Save, X, Check, ChevronRight, Shield, Briefcase,
  Globe, Tag, TrendingUp, AlertCircle, FileSpreadsheet, Send, Filter,
  BarChart3, Clock, MapPin, Award, ArrowUpRight, Plus, Trash2, Eye,
  Film, FileText, ClipboardList, Languages, Plane, Home, MessageSquare, User2,
  ClipboardCheck, Link2, Copy, ExternalLink, Lock
} from 'lucide-react';
import * as XLSX from 'xlsx';

/*  =======================================================================
 *  BUYER MATCHING PLATFORM  —  MICE B2B ENGAGEMENT SUITE
 *  =======================================================================
 *  Editorial Serif × Geometric Sans   |   Deep Navy · Antique Gold · Ivory
 *  Roles:  Exhibitor Portal  /  Administrator Console
 *  Persistence: window.storage  (key-value, JSON)
 *  ======================================================================= */

// ============================ STORAGE LAYER ============================
const DB_KEY = 'kags_platform_state_v6';

const emptySurvey = {
  needsInterpreter: null,
  moderatorIntroEn: '',
  accommodation: '',
  flightInfo: '',
  mailAddress: '',
  additionalTravelers: [],
  pitcherRRN: '',
  feedback: '',
};

const makeExhibitor = (id, project, loginId, password, companyName) => ({
  id, project, loginId, password,
  // 회사 · 담당자 기본 정보
  companyName, companyNameEn: '',
  contactName: '', contactNameEn: '',
  positionKo: '', positionEn: '',
  email: '', phone: '',
  // 회사 소개 (영문 1000자)
  introEn: '',
  // 회사 로고
  logoKey: null,
  logoMeta: null,
  // IP 목록 (여러 개)
  ips: [],
  // 수요조사
  survey: { ...emptySurvey, additionalTravelers: [] },
  // legacy 필드 (매칭 엔진 호환용)
  industry: '애니메이션', country: '대한민국',
  products: [], pitchSummary: '',
  desiredBuyer: { countries: [], industries: [], productKeywords: [], companySizes: [] },
});

const defaultState = {
  exhibitors: [
    makeExhibitor('EX-MIFA-01',   'MIFA',   'climax',     '4728', '클라이맥스 스튜디오'),
    makeExhibitor('EX-MIFA-02',   'MIFA',   'pixtrend',   '3165', '픽스트랜드'),
    makeExhibitor('EX-MIFA-03',   'MIFA',   'devsisters', '8492', '데브시스터즈'),
    makeExhibitor('EX-MIFA-04',   'MIFA',   'shelter',    '5037', '스튜디오쉘터'),
    makeExhibitor('EX-MIFA-05',   'MIFA',   'animal',     '9184', '스튜디오애니멀'),
  ],
  buyers: [],
  meetings: [],
  invitationLog: [],
  rsvpForms: { MIFA: '', MIPCOM: '', CANADA: '' },
  rsvpSheetCsv: { MIFA: '', MIPCOM: '', CANADA: '' }, // 응답 스프레드시트 published CSV URL
  rsvpSheetSync: { MIFA: null, MIPCOM: null, CANADA: null }, // 마지막 동기화 시각 (ISO string)
};

async function loadState() {
  try {
    const res = await window.storage.get(DB_KEY);
    if (res && res.value) return JSON.parse(res.value);
  } catch (e) { /* not initialised */ }
  await window.storage.set(DB_KEY, JSON.stringify(defaultState));
  return defaultState;
}

async function saveState(state) {
  try {
    await window.storage.set(DB_KEY, JSON.stringify(state));
  } catch (e) { console.error('Save failed', e); }
}

// ============================ IMAGE / BLOB STORAGE ============================
// 이미지는 state JSON과 분리 저장: 각 이미지는 고유 storage key에 base64 저장
// window.storage는 value당 5MB 제한이 있어, 큰 파일은 청크 분할 저장:
//   - main key  : { name, type, size, chunks: N }  ← 메타데이터
//   - :chunk:0  : base64 문자열 1번째 토막
//   - :chunk:1  : ...
// 로드 시 모든 chunk를 순서대로 읽어 이어붙여 원본 복원

// Supabase 백엔드로 전환 후 청크 분할은 사실상 불필요 — 큰 값으로 설정하여 청크 분할 회피
const CHUNK_SIZE = 200 * 1024 * 1024; // 200MB — 50MB 한도보다 크게 설정해 청크 1개로 처리

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function saveBlob(key, file, onProgress) {
  const data = await fileToBase64(file);
  // 청크 분할
  const chunks = [];
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    chunks.push(data.slice(i, i + CHUNK_SIZE));
  }
  const meta = { name: file.name, type: file.type, size: file.size, chunks: chunks.length };
  // 기존에 같은 key의 청크가 남아있을 수 있으니 먼저 정리
  await deleteBlob(key).catch(()=>{});
  // 메타 저장
  await window.storage.set(key, JSON.stringify(meta));
  // 청크 순차 저장 (동시성을 낮춰 storage 부하 관리)
  for (let i = 0; i < chunks.length; i++) {
    await window.storage.set(`${key}:chunk:${i}`, chunks[i]);
    onProgress && onProgress(i + 1, chunks.length);
  }
  return { ...meta, data };
}

async function loadBlob(key) {
  try {
    const res = await window.storage.get(key);
    if (!res || !res.value) return null;
    const meta = JSON.parse(res.value);
    // 구버전 호환 (data 직접 저장)
    if (meta.data) return meta;
    // 청크 조합
    if (typeof meta.chunks === 'number' && meta.chunks > 0) {
      const parts = [];
      for (let i = 0; i < meta.chunks; i++) {
        const r = await window.storage.get(`${key}:chunk:${i}`);
        if (!r || !r.value) throw new Error(`chunk ${i} missing`);
        parts.push(r.value);
      }
      return { ...meta, data: parts.join('') };
    }
    return meta;
  } catch { return null; }
}

async function deleteBlob(key) {
  try {
    let meta = null;
    try {
      const res = await window.storage.get(key);
      if (res && res.value) meta = JSON.parse(res.value);
    } catch {}
    if (meta && typeof meta.chunks === 'number') {
      for (let i = 0; i < meta.chunks; i++) {
        try { await window.storage.delete(`${key}:chunk:${i}`); } catch {}
      }
    }
    try { await window.storage.delete(key); } catch {}
  } catch {}
}

function downloadBlob(payload) {
  if (!payload || !payload.data) return;
  const a = document.createElement('a');
  a.href = payload.data;
  a.download = payload.name || 'download';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function downloadAllImages(images, prefix='') {
  for (const img of (images || [])) {
    const data = await loadBlob(img.key);
    if (data) {
      const renamed = prefix ? { ...data, name: `${prefix}_${data.name}` } : data;
      downloadBlob(renamed);
      await new Promise(r => setTimeout(r, 180));
    }
  }
}

function formatBytes(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024*1024) return (n/1024).toFixed(1) + ' KB';
  return (n/1024/1024).toFixed(1) + ' MB';
}

const MAX_IMG_BYTES = 50 * 1024 * 1024; // 50MB per file (Supabase Storage 버킷 한도와 일치)

// IP 포맷 세부 정보 요약 (chip으로 표시)
function formatRuntimeSummary(ip){
  if (!ip) return [];
  const out = [];
  if (ip.episodes)   out.push(`에피소드 ${ip.episodes}개`);
  if (ip.seasons)    out.push(`시즌 ${ip.seasons}기`);
  const m = parseInt(ip.runtimeMin||0, 10);
  const s = parseInt(ip.runtimeSec||0, 10);
  if (m || s) {
    if (m && s)      out.push(`회당 ${m}분 ${s}초`);
    else if (m)      out.push(`회당 ${m}분`);
    else             out.push(`회당 ${s}초`);
  }
  return out;
}

// ============================ DOMAIN CONSTANTS ============================
const BUYER_CATEGORIES = [
  'Broadcaster (방송사)',
  'Streaming / OTT 플랫폼',
  'Production (제작사)',
  'Distributor (배급사)',
  'Licensee (MD · 출판 · 상품화)',
  'Co-Production Partner (공동제작)',
  'Investor (투자사)',
  'Publisher (퍼블리셔)',
  'Global Sales Agent (세일즈 에이전트)',
  'Localization (로컬라이제이션 · 더빙)',
  'Merchandising Partner (머천다이징)',
  '기타 (Others)',
];

const REGIONS = [
  { key:'WW',  label:'Global' },
  { key:'NA',  label:'North America · 북미' },
  { key:'EU',  label:'Europe · 유럽' },
  { key:'AS',  label:'Asia · 아시아' },
  { key:'ME',  label:'Middle East · 중동' },
  { key:'LA',  label:'Latin America · 중남미' },
  { key:'OC',  label:'Oceania · 오세아니아' },
  { key:'AF',  label:'Africa · 아프리카' },
];

// 국가 → 권역 매핑 (바이어 country 문자열을 권역 key로 변환)
const COUNTRY_TO_REGION = {
  // North America
  'usa':'NA','us':'NA','united states':'NA','america':'NA','미국':'NA',
  'canada':'NA','ca':'NA','캐나다':'NA',
  'mexico':'NA','mx':'NA','멕시코':'NA',
  // Europe
  'france':'EU','fr':'EU','프랑스':'EU',
  'germany':'EU','de':'EU','독일':'EU',
  'uk':'EU','united kingdom':'EU','england':'EU','britain':'EU','gb':'EU','영국':'EU',
  'italy':'EU','it':'EU','이탈리아':'EU',
  'spain':'EU','es':'EU','스페인':'EU',
  'netherlands':'EU','nl':'EU','네덜란드':'EU','holland':'EU',
  'belgium':'EU','be':'EU','벨기에':'EU',
  'portugal':'EU','pt':'EU','포르투갈':'EU',
  'sweden':'EU','se':'EU','스웨덴':'EU',
  'norway':'EU','no':'EU','노르웨이':'EU',
  'denmark':'EU','dk':'EU','덴마크':'EU',
  'finland':'EU','fi':'EU','핀란드':'EU',
  'poland':'EU','pl':'EU','폴란드':'EU',
  'czech republic':'EU','cz':'EU','체코':'EU',
  'austria':'EU','at':'EU','오스트리아':'EU',
  'switzerland':'EU','ch':'EU','스위스':'EU',
  'ireland':'EU','ie':'EU','아일랜드':'EU',
  'greece':'EU','gr':'EU','그리스':'EU',
  'hungary':'EU','hu':'EU','헝가리':'EU',
  'romania':'EU','ro':'EU','루마니아':'EU',
  'russia':'EU','ru':'EU','러시아':'EU',
  'ukraine':'EU','ua':'EU','우크라이나':'EU',
  'turkey':'EU','tr':'EU','튀르키예':'EU','터키':'EU',
  // Asia
  'japan':'AS','jp':'AS','일본':'AS',
  'china':'AS','cn':'AS','중국':'AS',
  'south korea':'AS','korea':'AS','kr':'AS','한국':'AS','대한민국':'AS',
  'taiwan':'AS','tw':'AS','대만':'AS',
  'hong kong':'AS','hk':'AS','홍콩':'AS',
  'singapore':'AS','sg':'AS','싱가포르':'AS',
  'thailand':'AS','th':'AS','태국':'AS',
  'vietnam':'AS','vn':'AS','베트남':'AS',
  'indonesia':'AS','id':'AS','인도네시아':'AS',
  'malaysia':'AS','my':'AS','말레이시아':'AS',
  'philippines':'AS','ph':'AS','필리핀':'AS',
  'india':'AS','in':'AS','인도':'AS',
  'pakistan':'AS','pk':'AS','파키스탄':'AS',
  // Middle East
  'uae':'ME','united arab emirates':'ME','ae':'ME','아랍에미리트':'ME',
  'saudi arabia':'ME','sa':'ME','사우디아라비아':'ME',
  'israel':'ME','il':'ME','이스라엘':'ME',
  'qatar':'ME','qa':'ME','카타르':'ME',
  'kuwait':'ME','kw':'ME','쿠웨이트':'ME',
  'egypt':'ME','eg':'ME','이집트':'ME',
  // Latin America
  'brazil':'LA','br':'LA','브라질':'LA',
  'argentina':'LA','ar':'LA','아르헨티나':'LA',
  'chile':'LA','cl':'LA','칠레':'LA',
  'colombia':'LA','co':'LA','콜롬비아':'LA',
  'peru':'LA','pe':'LA','페루':'LA',
  // Oceania
  'australia':'OC','au':'OC','호주':'OC',
  'new zealand':'OC','nz':'OC','뉴질랜드':'OC',
  // Africa
  'south africa':'AF','za':'AF','남아프리카공화국':'AF',
  'nigeria':'AF','ng':'AF','나이지리아':'AF',
  'kenya':'AF','ke':'AF','케냐':'AF',
  'morocco':'AF','ma':'AF','모로코':'AF',
};

// 바이어 국가명(원본 텍스트) → 권역 key (NA/EU/AS/ME/LA/OC/AF | null)
function getBuyerRegion(country) {
  if (!country) return null;
  const normalized = String(country).trim().toLowerCase().replace(/[.,()]/g, '');
  // 정확 매칭 우선
  if (COUNTRY_TO_REGION[normalized]) return COUNTRY_TO_REGION[normalized];
  // 부분 매칭 (예: "USA (Los Angeles)" → "usa" 추출)
  for (const [key, region] of Object.entries(COUNTRY_TO_REGION)) {
    if (normalized.includes(key)) return region;
  }
  return null;
}

const GENRE_OPTIONS    = ['액션/어드벤처','코미디','드라마','교육/에듀테인먼트','판타지','SF','일상/슬라이스 오브 라이프','뮤지컬','스포츠','호러/스릴러','기타'];
const TARGET_AGE_OPTIONS = ['유아 (0-4)','키즈 (5-8)','패밀리 (All-Ages)','틴 (9-14)','YA (15-18)','성인 (18+)'];
const FORMAT_OPTIONS   = ['TV 시리즈','장편 극장판','단편','디지털 / 숏폼','IP 라이선싱','기획 개발 단계','기타'];

// 바이어 관심 필드 정규화 (배열/단일/누락 대비)
const getBuyerGenres    = (b) => Array.isArray(b?.interestedGenres)    ? b.interestedGenres    : (b?.interestedGenres    ? [b.interestedGenres]    : []);
const getBuyerFormats   = (b) => Array.isArray(b?.interestedFormats)   ? b.interestedFormats   : (b?.interestedFormats   ? [b.interestedFormats]   : []);
const getBuyerTargetAges= (b) => Array.isArray(b?.interestedTargetAges)? b.interestedTargetAges: (b?.interestedTargetAges? [b.interestedTargetAges]: []);
// 바이어 관심 권역 — 명시값 우선, 없으면 국가 기반 자동 도출
const getBuyerInterestedRegions = (b) => {
  if (Array.isArray(b?.interestedRegions) && b.interestedRegions.length > 0) {
    return b.interestedRegions;
  }
  // fallback: 국가로부터 자동 감지
  const auto = getBuyerRegion(b?.country);
  return auto ? [auto] : [];
};

// 프로젝트별 브랜드 컬러 — 카드, 배지, 스위처에 일관 적용
const PROJECT_COLORS = {
  MIFA:   { bg: '#2EC4E6', fg: '#FFFFFF' },  // Cyan Blue (키비주얼 스펙트럼 시작)
  MIPCOM: { bg: '#8B5CF6', fg: '#FFFFFF' },  // Purple (키비주얼 스펙트럼 중앙)
  CANADA: { bg: '#E879F9', fg: '#FFFFFF' },  // Magenta (키비주얼 스펙트럼 끝)
};
const projectColor = (p) => PROJECT_COLORS[p] || { bg: 'var(--ink)', fg: 'var(--ivory)' };

// ============================ EVENT CONFIG ============================
// 행사별 날짜·시간·슬롯 설정. 새 행사 추가 시 이 객체만 확장하면 전 UI가 자동 반영됨
const EVENT_CONFIG = {
  MIFA: {
    label: 'MIFA Annecy 2026',
    dates: [
      { date: '2026-06-23', dow: '화 · Tue' },
      { date: '2026-06-24', dow: '수 · Wed' },
      { date: '2026-06-25', dow: '목 · Thu' },
      { date: '2026-06-26', dow: '금 · Fri' },
    ],
    timeStart: '09:00',
    timeEnd:   '18:00',
    slotMinutes: 30,
  },
  MIPCOM: {
    label: 'MIPCOM 2026',
    dates: [], // 날짜 미확정
    timeStart: '09:00',
    timeEnd:   '18:00',
    slotMinutes: 30,
  },
  CANADA: {
    label: 'Canada Event 2026',
    dates: [],
    timeStart: '09:00',
    timeEnd:   '18:00',
    slotMinutes: 30,
  },
};

function generateTimeSlots(start, end, mins){
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const slots = [];
  let cur = sh*60 + sm;
  const endMin = eh*60 + em;
  while (cur < endMin){
    const h = Math.floor(cur/60);
    const m = cur % 60;
    slots.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
    cur += mins;
  }
  return slots;
}

// ============================ 회사명 → 분야 자동 추정 ============================
const FIELD_KEYWORDS = [
  { keywords:['netflix','disney+','disneyplus','hbo','max','prime video','amazon prime','apple tv','hulu','paramount+','peacock','discovery+','tving','wavve','coupang play','rakuten tv','crunchyroll','viu','iqiyi','iq.com','youku','tencent video'],
    field:'OTT / 스트리밍 플랫폼', category:'Streaming / OTT 플랫폼' },
  { keywords:['bbc','nhk','zdf','ard','arte','rai','cbs','abc','nbc','fox','cbc','cctv','kbs','mbc','sbs','tvn','jtbc','ebs','itv','canal+','france 2','france 3','france 5','tbs ','mediacorp','astro'],
    field:'방송사', category:'Broadcaster (방송사)' },
  { keywords:['distribution','distributor','mediamond','mondo','televisa','mediatoon','banijay','all3media','fremantle','sphere','zodiak','studio 100','cyber group','m6','pgs'],
    field:'배급사', category:'Distributor (배급사)' },
  { keywords:['production','productions','studios','studio','toei','ghibli','pixar','dreamworks','illumination','mappa','wit studio','bones','trigger','dentsu','sunrise','madhouse','kyoto animation','polygon pictures','production ig','aniplex','nippon animation','oriental light','j.c.staff','p.a. works','shaft','ufotable','cloverworks','a-1 pictures','studio 4°c','animation studios','animation production','제작사','프로덕션','스튜디오'],
    field:'제작사 / 애니메이션 스튜디오', category:'Production (제작사)' },
  { keywords:['co-production','co production','coproduction','공동제작','joint production','co-prod'],
    field:'공동제작 파트너', category:'Co-Production Partner (공동제작)' },
  { keywords:['toy','toys','bandai','mattel','hasbro','spin master','lego','takara','tomy','playmates','moose','mga'],
    field:'완구 / 라이선시', category:'Licensee (MD · 출판 · 상품화)' },
  { keywords:['publishing','publisher','kodansha','shueisha','shogakukan','scholastic','penguin','random house','hachette','harper','simon & schuster','bloomsbury'],
    field:'출판 / 퍼블리셔', category:'Publisher (퍼블리셔)' },
  { keywords:['sales','rights','licensing','agent','cake','4k media','sphere entertainment','mondo tv','content asia'],
    field:'글로벌 세일즈', category:'Global Sales Agent (세일즈 에이전트)' },
  { keywords:['ventures','capital','partners','investment','fund ','equity','holdings'],
    field:'투자사', category:'Investor (투자사)' },
  { keywords:['localization','dubbing','subtitle','voice','iyuno','zoo digital','sdi media'],
    field:'로컬라이제이션 / 더빙', category:'Localization (로컬라이제이션 · 더빙)' },
  { keywords:['merchandise','merchandising','brand','consumer products'],
    field:'머천다이징', category:'Merchandising Partner (머천다이징)' },
];

// ============================ 회사명 → 기업 규모 자동 추정 ============================
// 글로벌 주요 기업(대기업) 키워드를 일부 지정, 매칭되지 않으면 관리자가 수동 입력
const SIZE_MAJOR_KEYWORDS = [
  // 글로벌 스트리밍/OTT
  'netflix','disney','disney+','warner','warner bros','universal','universal studios','sony','sony pictures','amazon','amazon prime','apple tv','hulu','paramount','nbc','nbcuniversal','comcast','fox','hbo','peacock','max',
  // 메이저 방송사
  'bbc','nhk','zdf','ard','arte','rai','cbs','abc ','fox corp','itv','canal+','sky','mediaset','rtl',
  // 글로벌 테크/콘텐츠
  'tencent','bytedance','alibaba','google','youtube','meta','facebook','bilibili','iqiyi','youku',
  // 메이저 배급/IP
  'banijay','fremantle','all3media','mediawan','studio 100','cyber group','entertainment one','endemol','mondo tv',
  // 일본 메이저
  'kodansha','shueisha','shogakukan','toei','aniplex','bandai','namco','bandai namco','sanrio','toho','sunrise','mappa','production ig',
  // 완구/라이선싱 메이저
  'hasbro','mattel','lego','spin master','jakks',
  // 한국 메이저
  'cj enm','cj ent','kbs','mbc','sbs','tvn','jtbc','samsung','lg elec','hyundai','lotte','shinsegae','naver','kakao',
  // 유럽/기타 글로벌
  'vivendi','bertelsmann','axel springer','rtl group','prosieben','mediaset','televisa','globo',
];

function guessBuyerSize(companyName){
  if (!companyName) return '';
  const name = companyName.toLowerCase();
  if (SIZE_MAJOR_KEYWORDS.some(k => name.includes(k))) return '대기업';
  // 매칭되지 않으면 빈 값 반환 (관리자가 수동 판단)
  return '';
}

function guessBuyerField(companyName){
  if (!companyName) return null;
  const name = companyName.toLowerCase();
  for (const entry of FIELD_KEYWORDS){
    if (entry.keywords.some(k => name.includes(k))) {
      return { field: entry.field, category: entry.category };
    }
  }
  return null;
}

// 다중 카테고리 추정 — 회사명에 매칭되는 모든 카테고리를 반환
// 예: Disney → ['Streaming / OTT 플랫폼', 'Licensee (MD · 출판 · 상품화)', 'Co-Production Partner (공동제작)']
function guessBuyerCategories(companyName){
  if (!companyName) return [];
  const name = companyName.toLowerCase();
  const categories = [];
  for (const entry of FIELD_KEYWORDS){
    if (entry.keywords.some(k => name.includes(k))) {
      if (!categories.includes(entry.category)) {
        categories.push(entry.category);
      }
    }
  }
  return categories;
}

// 레거시 호환 유틸 — b.categories 우선, 없으면 b.category 단일 문자열을 배열로 변환
function getBuyerCategories(b){
  if (Array.isArray(b?.categories) && b.categories.length > 0) return b.categories;
  if (b?.category) return [b.category];
  return [];
}

// 다양한 형식의 날짜 문자열을 YYYY-MM-DD로 정규화
function parseDateString(s){
  if (!s) return null;
  const str = String(s).trim();
  if (!str) return null;
  // YYYY-MM-DD (혹은 시간 포함)
  const m0 = str.match(/^(\d{4})[-\/\.](\d{1,2})[-\/\.](\d{1,2})/);
  if (m0) return `${m0[1]}-${m0[2].padStart(2,'0')}-${m0[3].padStart(2,'0')}`;
  // M/D/YYYY (미국식)
  const m1 = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (m1) return `${m1[3]}-${m1[1].padStart(2,'0')}-${m1[2].padStart(2,'0')}`;
  // YYYY년 M월 D일
  const m2 = str.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  if (m2) return `${m2[1]}-${m2[2].padStart(2,'0')}-${m2[3].padStart(2,'0')}`;
  // Date 객체 파싱 시도 (영문 형식 등)
  try {
    const d = new Date(str);
    if (!isNaN(d.getTime()) && d.getFullYear() >= 2024 && d.getFullYear() <= 2030) {
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
  } catch(e) {}
  return null;
}

// 구글폼 응답의 "미팅 희망 회사" 영문명을 내부 참가사 ID로 매핑
// 반환: 'NOT_INTERESTED' | exhibitor.id | null
function mapExhibitorNameToId(name, exhibitors, pKey){
  if (!name) return null;
  const n = String(name).toLowerCase().trim();
  if (!n) return null;
  // Not interested는 미팅 편성 제외
  if (n === 'not interested' || n.includes('not interested') || n.includes('관심 없음') || n.includes('관심없음')) {
    return 'NOT_INTERESTED';
  }
  // 명시적 영문→loginId 매핑 (사용자 지정)
  const EXHIBITOR_KEY_MAP = {
    'climax studio':   'climax',
    'pixtrend':        'pixtrand',
    'devsisters':      'devsisters',
    'studio shelter':  'shelter',
    'studio animal':   'animall',
  };
  const loginId = EXHIBITOR_KEY_MAP[n];
  if (loginId) {
    const ex = exhibitors.find(e => e.loginId === loginId && (!pKey || e.project === pKey));
    if (ex) return ex.id;
  }
  // fallback: 회사명/영문명 유사 매칭
  const ex = exhibitors.find(e =>
    (!pKey || e.project === pKey) && (
      (e.companyNameEn && e.companyNameEn.toLowerCase() === n) ||
      (e.companyName && e.companyName.toLowerCase() === n) ||
      (e.companyNameEn && n.includes(e.companyNameEn.toLowerCase())) ||
      (e.companyName && n.includes(e.companyName.toLowerCase()))
    )
  );
  return ex ? ex.id : null;
}

// 해당 참가사 + 날짜에서 가장 이른(오전부터) 빈 시간 슬롯 찾기
function findFirstAvailableSlot(exhibitorId, date, meetings, eventConfig){
  if (!eventConfig) return null;
  const slots = generateTimeSlots(eventConfig.timeStart, eventConfig.timeEnd, eventConfig.slotMinutes);
  const used = new Set(meetings
    .filter(m => m.exhibitorId === exhibitorId && m.date === date)
    .map(m => m.time));
  return slots.find(t => !used.has(t)) || null;
}

function ProjectBadge({project, size='sm'}){
  if (!project) return <span style={{color:'var(--muted-2)', fontSize:11}}>—</span>;
  const c = projectColor(project);
  const pad = size==='lg' ? '4px 12px' : '3px 10px';
  const fontSize = size==='lg' ? 12 : 10.5;
  return (
    <span style={{
      display:'inline-flex', alignItems:'center',
      padding: pad, fontSize, fontWeight:600,
      background: c.bg, color: c.fg,
      borderRadius:999, letterSpacing:'0.02em',
      border:'1px solid '+c.bg,
    }}>{project}</span>
  );
}

// ============================ MATCHING ENGINE ============================
/*  가중치 기반 매칭 점수 (0~100)
 *  국가 30  /  업종 30  /  제품 키워드 30  /  기업 규모 10
 *  결과:  Strong(≥75) / Moderate(50–74) / Weak(<50)
 */
function matchScore(exhibitor, buyer) {
  const d = exhibitor?.desiredBuyer || {};
  const countries = d.countries || [];
  const industries = d.industries || [];
  const productKeywords = d.productKeywords || [];
  const companySizes = d.companySizes || [];
  let score = 0;
  const reasons = [];

  if (countries.includes(buyer.country)) { score += 30; reasons.push(`국가 일치 (${buyer.country})`); }
  // 다중 카테고리 매칭 — 참가사 희망 카테고리와 바이어 카테고리 교집합
  const buyerCats = getBuyerCategories(buyer);
  const catMatches = buyerCats.filter(c => industries.includes(c));
  if (catMatches.length) {
    score += Math.min(40, 30 + (catMatches.length - 1) * 5); // 1개 일치 30점, 추가 일치마다 +5점 (최대 40)
    reasons.push(`카테고리 ${catMatches.length}건 일치 (${catMatches.join(', ')})`);
  }
  if (companySizes.includes(buyer.companySize)) { score += 10; reasons.push(`규모 일치 (${buyer.companySize})`); }

  const buyerText = `${buyerCats.join(' ')} ${buyer.interestedProducts||''}`.toLowerCase();
  const hit = productKeywords.filter(k => k && buyerText.includes(k.toLowerCase()));
  if (hit.length) {
    score += Math.min(30, hit.length * 15);
    reasons.push(`키워드 ${hit.length}건 일치 (${hit.join(', ')})`);
  }

  return { score: Math.min(100, score), reasons };
}

function matchTier(score) {
  if (score >= 75) return { label: 'Strong', color: '#1F4D3D', bg: '#DCE8E2' };
  if (score >= 50) return { label: 'Moderate', color: '#8A6B1F', bg: '#F4E9CF' };
  return { label: 'Weak', color: '#7A2E2E', bg: '#F0D9D9' };
}

// ============================================================================
// IP × 바이어 매칭 스코어링 엔진 v2
// ----------------------------------------------------------------------------
// RAW 점수 배분 (최대 105 → 100점 기준 백분율로 정규화):
//   [A] 희망 카테고리 매칭 (최대 60 + 보너스 5)
//       1순위 일치 60 / 2순위 45 / 3순위 30 / 4순위 15 / 없음 0
//       2개 이상 순위 중복 일치 시 +5 보너스
//   [B] 권역 Region (10점)
//       IP regions(WW/지역)과 바이어 국가 권역 매칭
//   [C] 장르 Genre (10점)
//       IP 장르(단일)가 바이어 interestedGenres(다중)에 포함
//   [D] 포맷 Format (10점)
//       IP 포맷(단일)이 바이어 interestedFormats(다중)에 포함
//   [E] 타겟 연령 (10점)
//       IP targetAge(단일)가 바이어 interestedTargetAges(다중)에 포함
//
// 최종 점수 = round(raw * 100 / 105) — 백분율 변환으로 100점 만점 기준 제공
// ============================================================================
function ipBuyerMatchScore(ip, buyer) {
  const reasons = [];
  const MAX_RAW = 105;
  const detail = {
    priority: null,
    priorityScore: 0,
    priorityBonus: 0,
    region: false,
    regionScore: 0,
    genre: false,
    genreScore: 0,
    genreMatches: [],
    format: false,
    formatScore: 0,
    formatMatches: [],
    targetAge: false,
    targetAgeScore: 0,
    targetAgeMatches: [],
  };

  const buyerCats = getBuyerCategories(buyer);
  const priorities = ip.desiredBuyerPriority || ['','','',''];
  const PRIO_POINTS = [60, 45, 30, 15];

  // [A] 희망 카테고리 매칭
  let scoreA = 0;
  const matchedPriorities = [];
  for (let i = 0; i < 4; i++) {
    const wanted = priorities[i];
    if (!wanted) continue;
    const hit = buyerCats.some(bc => {
      if (bc === wanted) return true;
      const a = (bc || '').toLowerCase();
      const b = (wanted || '').toLowerCase();
      const firstTokenA = a.split(/[\s(·]/)[0];
      const firstTokenB = b.split(/[\s(·]/)[0];
      return firstTokenA && firstTokenA === firstTokenB;
    });
    if (hit) matchedPriorities.push(i);
  }

  if (matchedPriorities.length > 0) {
    const topPriority = matchedPriorities[0];
    scoreA += PRIO_POINTS[topPriority];
    detail.priority = topPriority + 1;
    detail.priorityScore = PRIO_POINTS[topPriority];
    const matchedLabel = priorities[topPriority];
    reasons.push(`${detail.priority}순위 카테고리 일치 · ${matchedLabel} (+${PRIO_POINTS[topPriority]})`);

    if (matchedPriorities.length >= 2) {
      scoreA += 5;
      detail.priorityBonus = 5;
      reasons.push(`복수 순위 중복 일치 (+5 보너스)`);
    }
  }

  // [B] 권역 — 바이어 명시 권역 우선, 없으면 국가 기반 자동 도출
  let scoreB = 0;
  const buyerRegions = getBuyerInterestedRegions(buyer);  // 명시값 있으면 배열, 없으면 국가 자동
  const ipRegions = ip.regions || [];
  if (ipRegions.includes('WW')) {
    scoreB += 10;
    detail.region = true;
    detail.regionScore = 10;
    reasons.push(`타겟 권역 Global (+10)`);
  } else if (buyerRegions.includes('WW')) {
    // 바이어가 Global로 활동한다고 명시한 경우 어떤 IP 권역과도 매칭
    scoreB += 10;
    detail.region = true;
    detail.regionScore = 10;
    reasons.push(`바이어 활동 권역 Global (+10)`);
  } else {
    const matched = buyerRegions.find(r => ipRegions.includes(r));
    if (matched) {
      scoreB += 10;
      detail.region = true;
      detail.regionScore = 10;
      const regionLabel = (REGIONS.find(r => r.key === matched) || {}).label || matched;
      reasons.push(`권역 일치 · ${regionLabel} (+10)`);
    }
  }

  // [C] 장르 — IP 단일값 vs 바이어 다중값
  let scoreC = 0;
  const buyerGenres = getBuyerGenres(buyer);
  if (ip.genre && buyerGenres.length > 0) {
    if (buyerGenres.includes(ip.genre)) {
      scoreC += 10;
      detail.genre = true;
      detail.genreScore = 10;
      detail.genreMatches = [ip.genre];
      reasons.push(`장르 일치 · ${ip.genre} (+10)`);
    }
  }

  // [D] 포맷 — IP 단일값 vs 바이어 다중값
  let scoreD = 0;
  const buyerFormats = getBuyerFormats(buyer);
  if (ip.format && buyerFormats.length > 0) {
    if (buyerFormats.includes(ip.format)) {
      scoreD += 10;
      detail.format = true;
      detail.formatScore = 10;
      detail.formatMatches = [ip.format];
      reasons.push(`포맷 일치 · ${ip.format} (+10)`);
    }
  }

  // [E] 타겟 연령 — IP 단일값 vs 바이어 다중값
  let scoreE = 0;
  const buyerTargetAges = getBuyerTargetAges(buyer);
  if (ip.targetAge && buyerTargetAges.length > 0) {
    if (buyerTargetAges.includes(ip.targetAge)) {
      scoreE += 10;
      detail.targetAge = true;
      detail.targetAgeScore = 10;
      detail.targetAgeMatches = [ip.targetAge];
      reasons.push(`타겟 연령 일치 · ${ip.targetAge} (+10)`);
    }
  }

  // Raw 합산
  const raw = scoreA + scoreB + scoreC + scoreD + scoreE;

  // 100점 기준 백분율 변환
  const score = Math.round((raw * 100) / MAX_RAW);

  return {
    score,
    raw,
    maxRaw: MAX_RAW,
    // 개별 breakdown (raw 점수) — UI 표시용
    scoreA, scoreB, scoreC, scoreD, scoreE,
    detail,
    reasons,
  };
}

// 점수 구간 (IP × 바이어 매칭용) — 100점 기준
function ipMatchTier(score) {
  if (score >= 80) return { label: 'Excellent', bg:'#8B5CF6', fg:'#fff', glow:'rgba(139,92,246,0.35)' };
  if (score >= 60) return { label: 'Strong',    bg:'#A78BFA', fg:'#fff', glow:'rgba(167,139,250,0.28)' };
  if (score >= 40) return { label: 'Moderate',  bg:'#DDD6FE', fg:'#4C1D95', glow:'rgba(221,214,254,0.4)' };
  if (score >= 20) return { label: 'Weak',      bg:'#EDE9FE', fg:'#6D28D9', glow:'none' };
  return               { label: 'No Match',  bg:'#F5F3FF', fg:'#A5A5BF', glow:'none' };
}

// ============================ UI TOKENS ============================
const css = `
  @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css');
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&display=swap');

  :root{
    /* ===== RESPONSIVE SPACING & FONT (clamp 기반 자동 반응형) ===== */
    --pad-page: clamp(16px, 4vw, 40px);      /* 페이지 좌우 padding */
    --pad-section: clamp(20px, 4vw, 40px);   /* 섹션 padding */
    --pad-card: clamp(14px, 3vw, 24px);      /* 카드 padding */
    --gap-md: clamp(8px, 2vw, 16px);
    --gap-lg: clamp(12px, 3vw, 24px);

    --fs-h1: clamp(20px, 4.5vw, 32px);
    --fs-h2: clamp(17px, 3.5vw, 24px);
    --fs-h3: clamp(15px, 2.8vw, 18px);
    --fs-body: clamp(13px, 2.2vw, 14.5px);
    --fs-small: clamp(11px, 1.8vw, 12.5px);
    --fs-tiny: clamp(10px, 1.5vw, 11px);

    /* ===== KAGS 2026 KEY VISUAL PALETTE — Cyan × Purple × Magenta Gradient ===== */
    --bg:#F8F9FE;            /* 거의 흰 배경 (그라데이션이 워낙 강해서 베이스는 밝게) */
    --paper:#FFFFFF;         /* 카드 기본 배경 */
    --ivory:#FAFAFF;         /* 보조 밝은 배경 */
    --ivory-2:#F1F3FB;       /* 카드 내부 세컨드 배경 (라벤더 화이트) */

    /* Primary Ink — 깊은 인디고 (텍스트 가독성 유지) */
    --ink:#1E1B4B;           /* Indigo 950 — 본문/제목 */
    --ink-2:#312E81;         /* Indigo 800 — 서브 텍스트 */

    /* Muted — 연보라톤 그레이 */
    --muted:#6B6B8A;
    --muted-2:#A5A5BF;

    /* Lines — 연보라 구분선 */
    --line:#E4E4F0;
    --line-2:#EFEFF7;

    /* Dark surface — 네이비 그라데이션 */
    --navy:#1E1B4B;
    --navy-2:#312E81;

    /* ===== KEY VISUAL CORE COLORS ===== */
    --cyan:#2EC4E6;          /* 시아니 블루 */
    --cyan-dk:#0891B2;
    --cyan-lt:#CFFAFE;

    --purple:#8B5CF6;        /* 메인 퍼플 */
    --purple-dk:#6D28D9;
    --purple-lt:#EDE9FE;

    --magenta:#E879F9;       /* 마젠타 핑크 */
    --magenta-dk:#C026D3;
    --magenta-lt:#FAE8FF;

    --pink:#F472B6;          /* 로즈 핑크 */
    --pink-dk:#DB2777;

    /* Gold → Purple로 리맵 (기존 gold 변수를 쓰는 코드들이 자동으로 퍼플로) */
    --gold:#8B5CF6;
    --gold-dk:#6D28D9;
    --gold-lt:#EDE9FE;

    --indigo:#6366F1;
    --indigo-lt:#E0E7FF;

    /* Gradients — 키비주얼 핵심 */
    --grad-primary:linear-gradient(135deg, #2EC4E6 0%, #8B5CF6 50%, #E879F9 100%);
    --grad-primary-soft:linear-gradient(135deg, rgba(46,196,230,0.08) 0%, rgba(139,92,246,0.08) 50%, rgba(232,121,249,0.08) 100%);
    --grad-cta:linear-gradient(135deg, #8B5CF6 0%, #E879F9 100%);
    --grad-cta-hover:linear-gradient(135deg, #6D28D9 0%, #C026D3 100%);

    /* Semantic */
    --green:#10B981;
    --red:#EF4444;
    --amber:#F59E0B;

    --radius:12px;
    --radius-sm:8px;
    --shadow-sm:0 1px 3px rgba(30,27,75,0.08);
    --shadow-md:0 4px 20px rgba(139,92,246,0.12);
    --shadow-lg:0 12px 40px rgba(139,92,246,0.18);
  }

  .mice-root, .mice-root *{box-sizing:border-box}
  .mice-root{
    font-family:'Pretendard Variable','Pretendard','Noto Sans KR',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
    color:var(--ink);
    background:var(--bg);
    min-height:100vh;
    -webkit-font-smoothing:antialiased;
    -moz-osx-font-smoothing:grayscale;
    letter-spacing:-0.005em;
  }
  .serif{font-family:inherit; font-weight:600; letter-spacing:-0.025em;}
  .mono{font-family:'Geist Mono',ui-monospace,SFMono-Regular,Menlo,'Pretendard Variable','Pretendard',monospace; font-feature-settings:'zero';}

  .mice-root h1,.mice-root h2,.mice-root h3,.mice-root h4{
    font-family:inherit; font-weight:600; letter-spacing:-0.025em; margin:0; color:var(--ink);
  }

  .btn{
    display:inline-flex; align-items:center; gap:7px; padding:9px 15px;
    border-radius:var(--radius-sm); font-size:13px; font-weight:500;
    letter-spacing:-0.005em; cursor:pointer; transition:all .2s ease;
    border:1px solid transparent; font-family:inherit; line-height:1.2;
    white-space:nowrap;
  }
  .btn:disabled{cursor:not-allowed; opacity:.45;}

  /* Primary — 퍼플 그라데이션 CTA */
  .btn-primary{
    background:var(--grad-cta); color:#fff; border:none;
    box-shadow:0 4px 14px rgba(139,92,246,0.35);
    font-weight:600;
  }
  .btn-primary:hover:not(:disabled){
    background:var(--grad-cta-hover);
    box-shadow:0 6px 20px rgba(139,92,246,0.5);
    transform:translateY(-1px);
  }

  /* Gold (alias to primary) — 기존 gold 클래스도 같은 톤 */
  .btn-gold{
    background:var(--grad-cta); color:#fff; border:none;
    box-shadow:0 4px 14px rgba(139,92,246,0.35);
    font-weight:600;
  }
  .btn-gold:hover:not(:disabled){
    background:var(--grad-cta-hover);
    box-shadow:0 6px 20px rgba(139,92,246,0.5);
  }

  .btn-ghost{background:var(--paper); color:var(--ink); border-color:var(--line);}
  .btn-ghost:hover:not(:disabled){background:var(--ivory-2); border-color:var(--purple);}

  .btn-danger{background:var(--paper); color:var(--red); border-color:var(--line);}
  .btn-danger:hover:not(:disabled){background:#FEE2E2; border-color:var(--red);}

  .btn-dark-ghost{background:rgba(255,255,255,0.1); color:#fff; border-color:rgba(255,255,255,0.3); backdrop-filter:blur(8px);}
  .btn-dark-ghost:hover:not(:disabled){background:rgba(255,255,255,0.2); border-color:rgba(255,255,255,0.5);}

  .input, .select, .textarea{
    width:100%; padding:10px 13px; border:1px solid var(--line);
    background:var(--paper); font-family:inherit; font-size:13.5px; color:var(--ink);
    border-radius:var(--radius-sm); transition:border-color .15s, box-shadow .15s;
    line-height:1.4; letter-spacing:-0.005em;
  }
  .input:focus, .select:focus, .textarea:focus{
    outline:none; border-color:var(--purple);
    box-shadow:0 0 0 3px rgba(139,92,246,0.15);
  }
  .label{
    font-size:11px; font-weight:600; color:var(--muted);
    margin-bottom:6px; display:block; letter-spacing:0.04em;
    text-transform:uppercase;
  }

  .card{
    background:var(--paper); border:1px solid var(--line);
    border-radius:var(--radius); box-shadow:var(--shadow-sm);
  }
  .card-hover{transition:all .2s;}
  .card-hover:hover{border-color:var(--purple); box-shadow:var(--shadow-md); transform:translateY(-2px);}

  .chip{
    display:inline-flex; align-items:center; gap:5px; padding:3px 10px;
    font-size:11.5px; font-weight:500; background:var(--ivory-2);
    border:1px solid var(--line); border-radius:999px; color:var(--ink-2);
  }
  .chip-removable{cursor:pointer; transition:all .12s;}
  .chip-removable:hover{background:#FEE2E2; color:var(--red); border-color:#FCA5A5;}

  .rule{height:1px; background:var(--line); border:none; margin:0;}
  .rule-gold{height:3px; background:var(--grad-cta); border:none; margin:0; width:48px; border-radius:3px;}

  .grid{display:grid; gap:16px;}
  .tabular{font-variant-numeric:tabular-nums;}

  .fade-in{animation:fadeIn .3s ease;}
  @keyframes fadeIn{from{opacity:0; transform:translateY(4px)} to{opacity:1; transform:none}}
  @keyframes spin{from{transform:rotate(0deg)} to{transform:rotate(360deg)}}
  @keyframes float{
    0%,100%{transform:translate(0, 0)}
    50%{transform:translate(10px, -15px)}
  }
  @keyframes gradientShift{
    0%,100%{background-position:0% 50%}
    50%{background-position:100% 50%}
  }

  .stagger>*{animation:fadeIn .4s ease backwards;}
  .stagger>*:nth-child(1){animation-delay:.04s}
  .stagger>*:nth-child(2){animation-delay:.08s}
  .stagger>*:nth-child(3){animation-delay:.12s}
  .stagger>*:nth-child(4){animation-delay:.16s}
  .stagger>*:nth-child(5){animation-delay:.2s}
  .stagger>*:nth-child(6){animation-delay:.24s}

  table.mice-table{width:100%; border-collapse:collapse; font-size:13px;}
  table.mice-table th{
    text-align:left; padding:12px 14px;
    background:linear-gradient(90deg, rgba(139,92,246,0.04), rgba(232,121,249,0.04));
    color:var(--ink-2);
    font-weight:600; font-size:10.5px; letter-spacing:0.06em;
    border-bottom:1px solid var(--line); text-transform:uppercase;
  }
  table.mice-table td{
    padding:12px 14px; border-bottom:1px solid var(--line-2);
    vertical-align:middle; color:var(--ink-2);
  }
  table.mice-table tbody tr{transition:background .15s;}
  table.mice-table tbody tr:hover{background:var(--ivory-2);}

  .dot{width:6px; height:6px; border-radius:50%; display:inline-block;}
  .dot-green{background:var(--green);}
  .dot-gold{background:var(--purple);}
  .dot-red{background:var(--red);}
  .dot-muted{background:var(--muted-2);}

  .scroll-x{overflow-x:auto;}
  .scroll-x::-webkit-scrollbar{height:8px; width:8px;}
  .scroll-x::-webkit-scrollbar-track{background:var(--ivory-2);}
  .scroll-x::-webkit-scrollbar-thumb{background:linear-gradient(180deg, var(--purple), var(--magenta)); border-radius:4px;}
  .scroll-x::-webkit-scrollbar-thumb:hover{background:linear-gradient(180deg, var(--purple-dk), var(--magenta-dk));}

  /* ===== KEY VISUAL GRADIENT BACKGROUND ===== */
  .kv-gradient-bg{
    background:linear-gradient(135deg, #2EC4E6 0%, #8B5CF6 45%, #E879F9 75%, #F472B6 100%);
    background-size:200% 200%;
    animation:gradientShift 15s ease infinite;
  }
  .kv-gradient-text{
    background:var(--grad-cta);
    -webkit-background-clip:text;
    background-clip:text;
    -webkit-text-fill-color:transparent;
    color:transparent;
  }
  .kv-orb{
    position:absolute; border-radius:50%; filter:blur(40px); pointer-events:none;
    animation:float 8s ease-in-out infinite;
  }

  /* ============================ RESPONSIVE LAYOUT ============================ */
  /* 한국어 단어 단위 줄바꿈 - 본문 텍스트 한정 (제목·인라인 칩 제외) */
  p, .desc-text, [data-section-desc] {
    word-break: keep-all;
    overflow-wrap: break-word;
  }
  /* 코드·긴 영문 강제 끊기 필요한 곳은 명시적으로 .force-break */
  .force-break { word-break: break-all !important; }

  /* ============================ MOBILE OPTIMIZATION ============================ */
  @media (max-width: 767px) {
    /* 대시보드 KPI 카드 — 5열을 2열로 */
    .kpi-grid-5 { grid-template-columns: repeat(2, 1fr) !important; }
    /* 대시보드 2칼럼 섹션 — 모바일 1열 */
    .kpi-grid-2 { grid-template-columns: 1fr !important; }
    /* 메인 컨테이너 padding 축소 */
    main { padding: 24px 16px !important; }

    /* 섹션 헤더 글자 크기 모바일 */
    .serif { line-height: 1.3; }

    /* 그리드를 1열로 (그리드 사용한 곳들) */
    [style*="gridTemplateColumns"][style*="repeat(2"],
    [style*="gridTemplateColumns"][style*="repeat(3"],
    [style*="gridTemplateColumns"][style*="repeat(4"] {
      grid-template-columns: 1fr !important;
    }

    /* 2칼럼 그리드 — 1칼럼 */
    [style*="grid-template-columns: 1fr 1fr"],
    [style*="gridTemplateColumns: '1fr 1fr'"] {
      grid-template-columns: 1fr !important;
    }

    /* 테이블은 가로 스크롤 컨테이너 안에서 */
    .mice-table {
      min-width: max-content;
    }
    .mice-table-wrap, [data-table-wrap] {
      overflow-x: auto !important;
      -webkit-overflow-scrolling: touch;
      max-width: 100vw;
    }

    /* 모달 풀스크린 */
    .mice-modal {
      width: 100vw !important;
      max-width: 100vw !important;
      height: 100vh !important;
      max-height: 100vh !important;
      border-radius: 0 !important;
      margin: 0 !important;
    }

    /* 헤더 좌우 여백 축소 */
    .portal-header { padding: 14px 16px !important; }

    /* 탭 네비게이션 가로 스크롤 */
    nav[role="tablist"], nav > div[style*="display:flex"] {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      flex-wrap: nowrap !important;
    }

    /* 버튼 모바일 최적 사이즈 */
    .btn {
      min-height: 38px;
      padding: 9px 14px;
      font-size: 13px;
    }

    /* 입력 필드 자동 줌 방지 (16px 이상 필수) */
    .input, .select, .textarea, input, select, textarea {
      font-size: 16px !important;
      min-height: 42px;
    }

    /* 카드·박스 padding 축소 */
    .mice-card { padding: 16px !important; }

    /* 큰 헤딩 모바일 사이즈 */
    h1, .h1 { font-size: 22px !important; }
    h2, .h2 { font-size: 18px !important; }

    /* 큰 글자 클래스 모바일 사이즈 */
    [style*="fontSize:32"], [style*="fontSize:36"], [style*="fontSize:40"], [style*="fontSize:48"], [style*="fontSize:56"] {
      font-size: 24px !important;
    }
    [style*="fontSize:28"], [style*="fontSize:30"] {
      font-size: 20px !important;
    }
    [style*="fontSize:24"], [style*="fontSize:26"] {
      font-size: 18px !important;
    }

    /* SectionHeader desc 모바일 폰트 */
    [data-section-desc] {
      font-size: 12.5px !important;
      line-height: 1.6 !important;
    }

    /* 큰 padding 모바일에서 축소 */
    [style*="padding:40px"], [style*="padding: 40px"] {
      padding: 20px !important;
    }
    [style*="padding:32px"], [style*="padding: 32px"] {
      padding: 18px !important;
    }
    [style*="padding:24px"], [style*="padding: 24px"] {
      padding: 16px !important;
    }

    /* 키비주얼 영역 높이 축소 */
    .kv-hero { min-height: 60vh !important; padding: 40px 20px !important; }
    .kv-orb { display: none; } /* 무거운 효과 모바일에서 제거 */

    /* 로그인 카드 너비 */
    .login-card { width: calc(100vw - 32px) !important; max-width: 420px !important; }

    /* PC 권장 안내문 — 모바일에서만 강제 표시 */
    .desktop-recommended {
      display: block !important;
      padding: 12px 16px;
      background: rgba(245, 158, 11, 0.1);
      border: 1px solid rgba(245, 158, 11, 0.3);
      border-radius: 6px;
      font-size: 12px;
      color: #92400e;
      margin-bottom: 16px;
      line-height: 1.5;
    }
    .desktop-recommended::before {
      content: "💻 ";
    }

    /* === 모바일에서만 인라인 큰 값들 자동 축소 (PC 디자인 유지) === */
    /* maxWidth 1360 같은 큰 값만 100%로 (그 외는 그대로) */
    [style*="maxWidth:1360"], [style*="maxWidth: 1360"] {
      max-width: 100% !important;
    }
    /* main 태그 안의 인라인 padding 무력화 (헤더·메뉴는 그대로) */
    body main {
      padding-left: 16px !important;
      padding-right: 16px !important;
    }
  }

  /* 작은 폰 (≤380px) */
  @media (max-width: 380px) {
    body main { padding: 20px 12px !important; }
    .btn { padding: 8px 12px !important; font-size: 12.5px !important; }
    .mice-card { padding: 14px !important; }
  }
`;

// ============================ APP SHELL ============================
export default function BuyerMatchingPlatform() {
  const [state, setState] = useState(null);
  const [auth, setAuth] = useState(null); // {role:'exhibitor'|'admin', userId?}
  const [syncIndicator, setSyncIndicator] = useState(null); // 동기화 피드백 UI

  useEffect(() => { loadState().then(setState); }, []);

  // 실시간 동기화 — 다른 탭에서 저장이 발생하면 자동 감지
  useEffect(() => {
    if (!state) return;

    // 공통 처리 — localStorage에서 최신 state 읽어서 갱신
    const refreshFromStorage = async () => {
      try {
        const res = await window.storage.get(DB_KEY);
        if (!res || !res.value) return;
        const fresh = JSON.parse(res.value);
        setState(prev => {
          if (!prev) return fresh;
          if (JSON.stringify(prev) !== JSON.stringify(fresh)) {
            setSyncIndicator(Date.now());
            setTimeout(() => setSyncIndicator(null), 1500);
            return fresh;
          }
          return prev;
        });
      } catch (err) { /* silent */ }
    };

    // (1) BroadcastChannel 이벤트 — 같은 브라우저의 다른 탭에서 저장 발생 시 즉시
    const handleBroadcast = (e) => {
      const { key } = e.detail || {};
      if (key !== DB_KEY) return;
      refreshFromStorage();
    };
    window.addEventListener('kags-storage-sync', handleBroadcast);

    // (2) storage 이벤트 — BroadcastChannel 미지원 브라우저 대비
    const handleStorageChange = (e) => {
      if (e.key !== '__kv_private__::' + DB_KEY && e.key !== DB_KEY) return;
      refreshFromStorage();
    };
    window.addEventListener('storage', handleStorageChange);

    // (3) 10초 폴링 백업 — 이벤트가 모두 실패하는 엣지 케이스 대비
    const pollInterval = setInterval(refreshFromStorage, 10000);

    // (4) 탭 포커스 복귀 시 즉시 최신 로드
    const handleFocus = () => refreshFromStorage();
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('kags-storage-sync', handleBroadcast);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('focus', handleFocus);
      clearInterval(pollInterval);
    };
  }, [state === null]);

  const update = (fn) => {
    setState(prev => {
      const next = fn(prev);
      saveState(next);
      return next;
    });
  };

  if (!state) {
    return (
      <div className="mice-root" style={{display:'grid', placeItems:'center', minHeight:'100vh'}}>
        <style>{css}</style>
        <div className="serif" style={{fontSize:22, color:'var(--muted)'}}>Loading platform…</div>
      </div>
    );
  }

  return (
    <div className="mice-root">
      <style>{css}</style>
      {!auth && <LoginScreen state={state} onAuth={setAuth} />}
      {auth?.role === 'exhibitor' && (
        <ExhibitorPortal state={state} update={update} userId={auth.userId} onLogout={()=>setAuth(null)} />
      )}
      {auth?.role === 'admin' && (
        <AdminConsole state={state} update={update} viewerMode={auth.viewerMode} onLogout={()=>setAuth(null)} />
      )}

      {/* 실시간 동기화 인디케이터 */}
      {syncIndicator && (
        <div style={{
          position:'fixed', bottom:24, right:24, zIndex:1000,
          padding:'10px 16px',
          background:'var(--ink)', color:'#fff',
          borderRadius:999,
          boxShadow:'0 8px 24px rgba(11,37,69,0.18)',
          fontSize:12, fontWeight:500,
          display:'flex', alignItems:'center', gap:8,
          animation:'fadeIn 0.2s ease',
          letterSpacing:'-0.005em',
        }}>
          <span style={{width:6, height:6, borderRadius:'50%', background:'#16A34A', boxShadow:'0 0 8px #16A34A', animation:'spin 1s ease-in-out infinite alternate'}}/>
          동기화됨
        </div>
      )}
    </div>
  );
}

// ============================ LOGIN ============================
function LoginScreen({ state, onAuth }) {
  const [mode, setMode] = useState(null);
  const [loginId, setLoginId] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');

  const tryLogin = () => {
    setErr('');
    const id = (loginId || '').trim();
    const password = (pw || '').trim();

    if (!id || !password) {
      setErr('ID와 Password를 모두 입력해주세요.');
      return;
    }

    if (mode === 'admin') {
      // 풀 권한 관리자
      if (id.toLowerCase() === 'admin' && password === 'stella0608') {
        onAuth({ role: 'admin', viewerMode: null });
        return;
      }
      // KOCCA 뷰어 전용 (읽기 전용 + 제한된 4개 탭)
      if (id.toLowerCase() === 'kocca' && password === '0258') {
        onAuth({ role: 'admin', viewerMode: 'kocca' });
        return;
      }
      setErr('관리자 계정 정보가 일치하지 않습니다.');
      return;
    }
    const ex = state.exhibitors.find(e =>
      e.loginId.toLowerCase() === id.toLowerCase() && e.password === password
    );
    if (ex) onAuth({ role: 'exhibitor', userId: ex.id });
    else setErr('참가사 계정 정보가 일치하지 않습니다.');
  };

  return (
    <div style={{minHeight:'100vh', display:'flex', flexDirection:'column', position:'relative', overflow:'hidden'}}>
      {/* === 키비주얼 그라데이션 배경 === */}
      <div className="kv-gradient-bg" style={{
        position:'absolute', inset:0, zIndex:0,
      }}/>

      {/* === 플로팅 오브 (키비주얼 DNA) === */}
      <div className="kv-orb" style={{
        top:'8%', right:'12%', width:'280px', height:'280px',
        background:'radial-gradient(circle, rgba(244,114,182,0.55) 0%, rgba(232,121,249,0.2) 40%, transparent 70%)',
        animationDelay:'0s',
      }}/>
      <div className="kv-orb" style={{
        bottom:'15%', left:'8%', width:'320px', height:'320px',
        background:'radial-gradient(circle, rgba(139,92,246,0.45) 0%, rgba(99,102,241,0.18) 40%, transparent 70%)',
        animationDelay:'-3s',
      }}/>
      <div className="kv-orb" style={{
        top:'40%', left:'35%', width:'200px', height:'200px',
        background:'radial-gradient(circle, rgba(46,196,230,0.4) 0%, rgba(46,196,230,0.1) 50%, transparent 80%)',
        animationDelay:'-6s',
      }}/>

      {/* === 수직 라이팅 라인 (키비주얼 스테이지 조명 효과) === */}
      <div style={{
        position:'absolute', inset:0, zIndex:1, pointerEvents:'none',
        background: `
          linear-gradient(90deg, transparent 19%, rgba(255,255,255,0.08) 20%, transparent 21%),
          linear-gradient(90deg, transparent 49%, rgba(255,255,255,0.1) 50%, transparent 51%),
          linear-gradient(90deg, transparent 79%, rgba(255,255,255,0.08) 80%, transparent 81%)
        `,
      }}/>

      {/* === 상단 브랜드 바 === */}
      <header style={{padding:'28px 48px', display:'flex', alignItems:'center', justifyContent:'space-between', position:'relative', zIndex:2}}>
        <div style={{display:'flex', alignItems:'center', gap:12}}>
          <div style={{
            width:32, height:32, background:'rgba(255,255,255,0.95)', borderRadius:8,
            display:'grid', placeItems:'center', position:'relative',
            boxShadow:'0 4px 20px rgba(255,255,255,0.4)',
          }}>
            <div style={{width:12, height:12, background:'var(--grad-cta)', borderRadius:3}}/>
          </div>
          <div>
            <div className="mono" style={{fontSize:10, letterSpacing:'0.22em', color:'rgba(255,255,255,0.95)', fontWeight:600, lineHeight:1.2}}>
              K-ANIMATION GLOBAL SHOWCASE
            </div>
            <div className="mono" style={{fontSize:9, letterSpacing:'0.14em', color:'rgba(255,255,255,0.7)', marginTop:2}}>
              BUYER MATCHING PLATFORM
            </div>
          </div>
        </div>
        <div style={{display:'flex', alignItems:'center', gap:10}}>
          <span className="mono" style={{fontSize:10, letterSpacing:'0.15em', color:'rgba(255,255,255,0.8)'}}>
            2026 EDITION
          </span>
          <span style={{width:4, height:4, background:'rgba(255,255,255,0.6)', borderRadius:'50%'}}/>
          <span className="mono" style={{fontSize:10, letterSpacing:'0.15em', color:'rgba(255,255,255,0.8)'}}>
            v1.0
          </span>
        </div>
      </header>

      {/* === 메인 컨텐츠 === */}
      <main style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px 24px 40px', position:'relative', zIndex:2}}>
        <div style={{width:'100%', maxWidth:520}}>

          {/* 이벤트 컨텍스트 스트립 */}
          <div style={{
            display:'flex', alignItems:'center', justifyContent:'center', gap:10,
            padding:'8px 16px',
            background:'rgba(255,255,255,0.2)',
            border:'1px solid rgba(255,255,255,0.3)',
            borderRadius:999,
            backdropFilter:'blur(16px)',
            WebkitBackdropFilter:'blur(16px)',
            width:'fit-content',
            margin:'0 auto 32px',
          }}>
            <EventDot name="MIFA" />
            <span style={{width:3, height:3, background:'rgba(255,255,255,0.5)', borderRadius:'50%'}}/>
            <EventDot name="MIPCOM" />
            <span style={{width:3, height:3, background:'rgba(255,255,255,0.5)', borderRadius:'50%'}}/>
            <EventDot name="CANADA" />
          </div>

          {/* 브랜드 타이틀 */}
          <div style={{textAlign:'center', marginBottom:44}}>
            <div style={{
              display:'inline-flex', alignItems:'center', gap:8,
              padding:'5px 14px', marginBottom:22,
              background:'rgba(255,255,255,0.22)',
              border:'1px solid rgba(255,255,255,0.35)',
              borderRadius:999,
              fontSize:10, fontWeight:600, letterSpacing:'0.18em',
              color:'#fff',
              fontFamily:"'Geist Mono',monospace",
              backdropFilter:'blur(12px)',
              WebkitBackdropFilter:'blur(12px)',
            }}>
              <span style={{width:6, height:6, background:'#fff', borderRadius:'50%', boxShadow:'0 0 10px #fff'}}/>
              GLOBAL ENGAGEMENT SUITE
            </div>
            <h1 className="serif" style={{
              fontSize:48, lineHeight:1.05, margin:0,
              fontWeight:700, letterSpacing:'-0.04em', color:'#fff',
              textShadow:'0 4px 30px rgba(0,0,0,0.15)',
            }}>
              2026
              <br/>
              <span style={{fontSize:44, fontWeight:600, letterSpacing:'-0.035em'}}>
                K-Animation<br/>Global Showcase
              </span>
            </h1>
            <p style={{
              fontSize:13.5, color:'rgba(255,255,255,0.9)', marginTop:18,
              lineHeight:1.65, letterSpacing:'-0.005em',
              maxWidth:420, margin:'18px auto 0',
              textShadow:'0 2px 12px rgba(0,0,0,0.12)',
            }}>
              K-애니메이션 해외진출 기업과 글로벌 바이어를 연결하는<br/>
              통합 비즈니스 매칭 스위트
            </p>
          </div>

          {!mode && (
            <div className="fade-in">
              <div className="grid" style={{gridTemplateColumns:'1fr 1fr', gap:14}}>
                <RoleCard
                  icon={<Briefcase size={20}/>} title="참가사" en="Participant"
                  desc="프로필 · IP · 매칭 · 미팅 일정"
                  onClick={()=>setMode('exhibitor')}
                  accent="var(--cyan)"
                />
                <RoleCard
                  icon={<Shield size={20}/>} title="관리자" en="Administrator"
                  desc="바이어 DB · 초청 · 스케줄 관제"
                  onClick={()=>setMode('admin')}
                  accent="var(--magenta)"
                />
              </div>
              <div style={{textAlign:'center', marginTop:28, fontSize:11, color:'rgba(255,255,255,0.85)', letterSpacing:'0.02em', display:'flex', alignItems:'center', justifyContent:'center', gap:8}}>
                <span style={{width:24, height:1, background:'rgba(255,255,255,0.3)'}}/>
                접속 유형을 선택하세요
                <span style={{width:24, height:1, background:'rgba(255,255,255,0.3)'}}/>
              </div>
            </div>
          )}

          {mode && (
            <div className="fade-in">
              <div style={{
                padding:'38px 38px 32px',
                background:'rgba(255,255,255,0.95)',
                backdropFilter:'blur(24px)',
                WebkitBackdropFilter:'blur(24px)',
                boxShadow:'0 30px 80px rgba(30,27,75,0.25), 0 1px 0 rgba(255,255,255,0.5) inset',
                border:'1px solid rgba(255,255,255,0.5)',
                borderRadius:'var(--radius)',
              }}>
                <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:26}}>
                  <div>
                    <div style={{display:'inline-flex', alignItems:'center', gap:6, marginBottom:8}}>
                      <span style={{
                        width:6, height:6, borderRadius:'50%',
                        background: mode === 'admin' ? 'var(--magenta)' : 'var(--cyan)',
                        boxShadow: mode === 'admin' ? '0 0 10px var(--magenta)' : '0 0 10px var(--cyan)',
                      }}/>
                      <div className="mono kv-gradient-text" style={{fontSize:10, letterSpacing:'0.2em', fontWeight:700}}>
                        {mode === 'admin' ? 'ADMIN LOGIN' : 'PARTICIPANT LOGIN'}
                      </div>
                    </div>
                    <h2 className="serif" style={{fontSize:24, margin:0, fontWeight:600, letterSpacing:'-0.02em'}}>
                      {mode === 'admin' ? '관리자 로그인' : '참가사 로그인'}
                    </h2>
                  </div>
                  <button className="btn btn-ghost" onClick={()=>{setMode(null); setErr('');}} style={{padding:'7px 10px', fontSize:12}} title="돌아가기">
                    <X size={13}/>
                  </button>
                </div>

                <label className="label" style={{fontSize:10.5}}>ID</label>
                <input className="input" autoFocus value={loginId} onChange={e=>setLoginId(e.target.value)} placeholder={mode==='admin'?'admin':'participant ID'} onKeyDown={e=>e.key==='Enter'&&tryLogin()}
                  autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="text"/>
                <div style={{height:14}}/>
                <label className="label" style={{fontSize:10.5}}>Password</label>
                <input className="input" type="password" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==='Enter'&&tryLogin()}
                  autoCapitalize="none" autoCorrect="off" spellCheck={false}/>

                {err && (
                  <div style={{color:'var(--red)', fontSize:12.5, marginTop:14, display:'flex', alignItems:'center', gap:7, padding:'10px 12px', background:'#FEE2E2', borderRadius:'var(--radius-sm)', border:'1px solid #FCA5A5'}}>
                    <AlertCircle size={13} style={{flexShrink:0}}/>{err}
                  </div>
                )}

                <button className="btn btn-primary" onClick={tryLogin} style={{width:'100%', marginTop:22, padding:'14px 22px', fontSize:14, justifyContent:'center', letterSpacing:'-0.005em'}}>
                  접속하기 <ChevronRight size={16}/>
                </button>

                <div style={{marginTop:18, paddingTop:18, borderTop:'1px solid var(--line-2)', fontSize:10.5, color:'var(--muted-2)', textAlign:'center', lineHeight:1.6, letterSpacing:'0.01em'}}>
                  계정 문의: 운영 사무국으로 연락
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* === 하단 footer === */}
      <footer style={{padding:'20px 48px', display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:10.5, color:'rgba(255,255,255,0.75)', letterSpacing:'0.02em', position:'relative', zIndex:2, borderTop:'1px solid rgba(255,255,255,0.15)'}}>
        <span className="mono">© 2026 KAGS OPERATIONS</span>
        <div style={{display:'flex', alignItems:'center', gap:10}}>
          <span className="mono" style={{display:'inline-flex', alignItems:'center', gap:4}}>
            <span style={{width:5, height:5, background:'#4ADE80', borderRadius:'50%', boxShadow:'0 0 8px #4ADE80'}}/>
            SECURE
          </span>
          <span style={{width:3, height:3, background:'rgba(255,255,255,0.5)', borderRadius:'50%'}}/>
          <span className="mono">WEB-BASED</span>
          <span style={{width:3, height:3, background:'rgba(255,255,255,0.5)', borderRadius:'50%'}}/>
          <span className="mono">CLOUD-NATIVE</span>
        </div>
      </footer>
    </div>
  );
}

// 이벤트 도트 — 로그인 헤더 스트립
function EventDot({name}){
  const c = PROJECT_COLORS[name] || { bg:'var(--muted)' };
  return (
    <span style={{display:'inline-flex', alignItems:'center', gap:6, fontSize:10.5, fontWeight:600, letterSpacing:'0.08em', color:'#fff', textShadow:'0 1px 4px rgba(0,0,0,0.2)'}}>
      <span style={{width:8, height:8, borderRadius:'50%', background:c.bg, boxShadow:`0 0 10px ${c.bg}, 0 0 2px #fff`}}/>
      {name}
    </span>
  );
}

function RoleCard({icon, title, en, desc, onClick, accent}){
  return (
    <button onClick={onClick} style={{
      textAlign:'left', padding:22, cursor:'pointer',
      background:'rgba(255,255,255,0.92)',
      backdropFilter:'blur(20px)',
      WebkitBackdropFilter:'blur(20px)',
      display:'flex', flexDirection:'column', gap:14,
      minHeight:160, fontFamily:'inherit',
      border:'1px solid rgba(255,255,255,0.5)',
      borderRadius:'var(--radius)',
      position:'relative',
      overflow:'hidden',
      boxShadow:'0 20px 50px rgba(30,27,75,0.15)',
      transition:'all .25s ease',
    }}
    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 30px 60px rgba(30,27,75,0.22)'; }}
    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 20px 50px rgba(30,27,75,0.15)'; }}
    >
      {/* 상단 액센트 스트립 */}
      {accent && (
        <span style={{
          position:'absolute', top:0, left:0, right:0, height:3,
          background:accent,
        }}/>
      )}
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
        <div style={{
          width:42, height:42,
          background:accent || 'var(--ivory-2)', color:'#fff',
          borderRadius:10,
          display:'grid', placeItems:'center',
          boxShadow:`0 4px 14px ${accent ? accent + '40' : 'rgba(139,92,246,0.2)'}`,
        }}>{icon}</div>
        <ArrowUpRight size={15} style={{color:'var(--muted-2)'}}/>
      </div>
      <div>
        <div className="mono" style={{fontSize:9.5, letterSpacing:'0.2em', color:'var(--muted)', fontWeight:600}}>{en.toUpperCase()}</div>
        <div className="serif" style={{fontSize:18, fontWeight:600, marginTop:3, letterSpacing:'-0.02em'}}>{title}</div>
      </div>
      <p style={{fontSize:11.5, color:'var(--muted)', lineHeight:1.55, margin:0}}>{desc}</p>
    </button>
  );
}

// ============================ EXHIBITOR PORTAL ============================
function ExhibitorPortal({ state, update, userId, onLogout }) {
  const me = state.exhibitors.find(e => e.id === userId);
  const [tab, setTab] = useState('profile');

  const myMeetings = state.meetings.filter(m => m.exhibitorId === userId);
  const ipCount = (me.ips || []).length;

  const matches = useMemo(() => {
    return state.buyers
      .filter(b => ['accepted','pending','sent'].includes(b.invitationStatus))
      .map(b => ({ buyer: b, ...matchScore(me, b) }))
      .sort((a,b) => b.score - a.score);
  }, [state.buyers, me]);

  return (
    <div>
      <PortalHeader
        role={`PARTICIPANT PORTAL · ${me.project}`}
        name={me.companyName}
        sub={me.companyNameEn || '—'}
        onLogout={onLogout}
      />

      <nav style={{background:'linear-gradient(180deg, #1E1B4B 0%, #312E81 100%)', borderBottom:'1px solid rgba(139,92,246,0.3)'}}>
        <div style={{maxWidth:1360, margin:'0 auto', padding:'0 40px', display:'flex', gap:4, overflowX:'auto'}}>
          {[
            {k:'profile',  l:'회사 정보',  i:<Building2 size={15}/>},
            {k:'intro',    l:'회사 소개',  i:<FileText size={15}/>},
            {k:'ips',      l:'IP 관리',   i:<Film size={15}/>, badge: ipCount},
            {k:'survey',   l:'수요조사',   i:<ClipboardList size={15}/>},
            {k:'meetings', l:'미팅 스케줄', i:<Calendar size={15}/>, badge: myMeetings.length},
          ].map(t => (
            <button key={t.k} onClick={()=>setTab(t.k)}
              style={{
                padding:'16px 20px', background:'transparent', border:'none', cursor:'pointer',
                color: tab===t.k ? '#fff' : 'rgba(255,255,255,0.75)',
                fontFamily:'inherit', fontSize:13.5, fontWeight: tab===t.k ? 600 : 500, letterSpacing:'-0.005em',
                borderBottom: tab===t.k ? '2px solid #E879F9' : '2px solid transparent',
                display:'flex', alignItems:'center', gap:8, transition:'all .15s',
                whiteSpace:'nowrap',
                textShadow: tab===t.k ? '0 0 12px rgba(232,121,249,0.5)' : 'none',
              }}
              onMouseEnter={e => { if (tab!==t.k) e.currentTarget.style.color = 'rgba(255,255,255,0.95)'; }}
              onMouseLeave={e => { if (tab!==t.k) e.currentTarget.style.color = 'rgba(255,255,255,0.75)'; }}
            >
              {t.i}{t.l}
              {t.badge !== undefined && t.badge > 0 && (
                <span className="mono" style={{fontSize:10, padding:'2px 7px', background:'var(--grad-cta)', color:'#fff', borderRadius:999, fontWeight:700, boxShadow:'0 0 10px rgba(232,121,249,0.4)'}}>{t.badge}</span>
              )}
            </button>
          ))}
        </div>
      </nav>

      <main style={{maxWidth:1360, margin:'0 auto', padding:'40px'}}>
        {tab === 'profile'  && <ProfileTab me={me} update={update}/>}
        {tab === 'intro'    && <IntroTab me={me} update={update}/>}
        {tab === 'ips'      && <IPsTab me={me} update={update}/>}
        {tab === 'survey'   && <SurveyTab me={me} update={update}/>}
        {tab === 'meetings' && <MyMeetingsTab state={state} update={update} me={me}/>}
      </main>
    </div>
  );
}

function PortalHeader({role, name, sub, onLogout}){
  return (
    <header style={{
      background:'linear-gradient(135deg, #2EC4E6 0%, #8B5CF6 50%, #E879F9 100%)',
      color:'#fff', padding:'22px 40px',
      display:'flex', justifyContent:'space-between', alignItems:'center',
      position:'relative', overflow:'hidden',
      boxShadow:'0 4px 20px rgba(139,92,246,0.25)',
    }}>
      {/* 헤더 내 플로팅 오브 */}
      <div style={{position:'absolute', top:'-40px', right:'15%', width:'200px', height:'200px', background:'radial-gradient(circle, rgba(244,114,182,0.35) 0%, transparent 70%)', filter:'blur(30px)', pointerEvents:'none'}}/>
      <div style={{position:'absolute', bottom:'-60px', left:'25%', width:'180px', height:'180px', background:'radial-gradient(circle, rgba(46,196,230,0.3) 0%, transparent 70%)', filter:'blur(30px)', pointerEvents:'none'}}/>

      <div style={{display:'flex', alignItems:'center', gap:16, position:'relative', zIndex:1}}>
        <div style={{width:30, height:30, background:'rgba(255,255,255,0.95)', borderRadius:7, display:'grid', placeItems:'center', boxShadow:'0 4px 14px rgba(255,255,255,0.35)'}}>
          <div style={{width:11, height:11, background:'var(--grad-cta)', borderRadius:3}}/>
        </div>
        <div>
          <div className="mono" style={{fontSize:10, letterSpacing:'0.22em', color:'#fff', fontWeight:700, textShadow:'0 1px 4px rgba(0,0,0,0.15)'}}>{role}</div>
          <div style={{fontSize:14, marginTop:2, fontWeight:500}}>{name} <span style={{opacity:0.8, marginLeft:8, fontSize:12}}>{sub}</span></div>
        </div>
      </div>
      <button className="btn btn-dark-ghost" onClick={onLogout} style={{position:'relative', zIndex:1}}>
        <LogOut size={14}/>로그아웃
      </button>
    </header>
  );
}

// ---------------- PROFILE TAB — 회사 · 담당자 기본 정보 ----------------
function ProfileTab({me, update}){
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState(me);

  useEffect(()=>setForm(me), [me.id]);

  const save = () => {
    const now = new Date().toISOString();
    update(s => ({...s, exhibitors: s.exhibitors.map(e => e.id===me.id ? {
      ...form,
      updatedAt: now,
      sectionsUpdatedAt: {...(form.sectionsUpdatedAt || {}), profile: now},
    } : e)}));
    setEdit(false);
  };

  const field = (key, label, placeholder='', type='text') => (
    <div>
      <label className="label">{label}</label>
      {edit
        ? <input className="input" type={type} value={form[key]||''} placeholder={placeholder}
                 onChange={e=>setForm({...form, [key]:e.target.value})}/>
        : <div style={{fontSize:14, padding:'10px 0', borderBottom:'1px solid var(--line-2)', minHeight:40, color: me[key] ? 'var(--ink)' : 'var(--muted-2)'}}>
            {me[key] || '—'}
          </div>
      }
    </div>
  );

  return (
    <div className="fade-in">
      <SectionHeader eyebrow="SECTION 01" title="회사 · 담당자 정보"
        desc="해외 바이어 커뮤니케이션 및 공식 서류에 사용되는 정보입니다. 영문 항목은 피칭 덱·명함·초대장에 그대로 노출되므로 정확하게 기입해주세요." />

      <div style={{display:'flex', justifyContent:'flex-end', marginTop:20}}>
        {!edit
          ? <button className="btn btn-ghost" onClick={()=>setEdit(true)}><Edit3 size={14}/>전체 수정</button>
          : <div style={{display:'flex', gap:8}}>
              <button className="btn btn-ghost" onClick={()=>{setForm(me); setEdit(false);}}><X size={14}/>취소</button>
              <button className="btn btn-primary" onClick={save}><Save size={14}/>저장</button>
            </div>}
      </div>

      <div className="card" style={{padding:28, marginTop:14}}>
        <div className="serif" style={{fontSize:17, fontWeight:600, marginBottom:18, display:'flex', alignItems:'center', gap:8}}>
          <Building2 size={16}/> 회사
        </div>
        <div className="grid stagger" style={{gridTemplateColumns:'1fr 1fr', gap:20}}>
          {field('companyName',    '회사명 (국문)', '예: 클라이맥스 스튜디오')}
          {field('companyNameEn',  'Company Name (English)', 'e.g., Climax Studio')}
        </div>
      </div>

      <div className="card" style={{padding:28, marginTop:16}}>
        <div className="serif" style={{fontSize:17, fontWeight:600, marginBottom:18, display:'flex', alignItems:'center', gap:8}}>
          <User2 size={16}/> 담당자
        </div>
        <div className="grid stagger" style={{gridTemplateColumns:'1fr 1fr', gap:20}}>
          {field('contactName',    '담당자명 (국문)', '예: 홍길동')}
          {field('contactNameEn',  'Contact Name (English)', 'e.g., Gil-dong Hong')}
          {field('positionKo',     '직급 (국문)', '예: 대표')}
          {field('positionEn',     'Position (English)', 'e.g., CEO / Producer')}
          {field('email',          '이메일', 'contact@example.com', 'email')}
          {field('phone',          '연락처', '+82-10-1234-5678', 'tel')}
        </div>
      </div>
    </div>
  );
}

// ---------------- INTRO TAB — 영문 회사 소개 ----------------
function IntroTab({me, update}){
  const MAX = 1000;
  const [val, setVal] = useState(me.introEn || '');
  const [saved, setSaved] = useState(false);
  useEffect(()=>setVal(me.introEn || ''), [me.id]);

  const count = val.length;
  const over = count > MAX;
  const remaining = MAX - count;

  const save = () => {
    const now = new Date().toISOString();
    update(s => ({...s, exhibitors: s.exhibitors.map(e => e.id===me.id ? {
      ...e, introEn: val,
      updatedAt: now,
      sectionsUpdatedAt: {...(e.sectionsUpdatedAt || {}), intro: now},
    } : e)}));
    setSaved(true); setTimeout(()=>setSaved(false), 2000);
  };

  return (
    <div className="fade-in">
      <SectionHeader eyebrow="SECTION 02" title="회사 소개 (Company Introduction)"
        desc="글로벌 바이어에게 배포되는 공식 회사 소개문입니다. 영문으로 1,000자 이내 작성해주세요. 피칭 쇼케이스 프로그램북 및 홍보 자료에 활용됩니다." />

      {/* Company Logo */}
      <div className="card" style={{padding:28, marginTop:24}}>
        <div className="serif" style={{fontSize:17, fontWeight:600, marginBottom:16, display:'flex', alignItems:'center', gap:8}}>
          <Building2 size={16}/> 회사 로고
          <span style={{fontSize:11.5, color:'var(--muted)', fontWeight:400, fontFamily:'inherit', letterSpacing:'normal'}}>PNG, JPG, SVG · 50MB 이하</span>
        </div>
        <LogoUploader me={me} update={update}/>
      </div>

      {/* Company Intro */}
      <div className="card" style={{padding:28, marginTop:16}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
          <label className="label" style={{margin:0}}>Company Introduction (English)</label>
          <div className="mono tabular" style={{fontSize:11.5, color: over ? 'var(--red)' : (remaining < 100 ? 'var(--amber)' : 'var(--muted)')}}>
            {count.toLocaleString()} / {MAX.toLocaleString()}
          </div>
        </div>
        <textarea className="textarea" rows={16} value={val}
                  onChange={e=>setVal(e.target.value)}
                  style={{lineHeight:1.8, resize:'vertical', fontSize:13.5}}
                  placeholder="Write your company introduction in English within 1,000 characters. Include your core strengths, representative IPs, international achievements, and strategic direction. e.g., 'Founded in 2015, Climax Studio is a Seoul-based animation production house specializing in premium kids and family IPs...'"/>

        <div style={{marginTop:18, display:'flex', justifyContent:'space-between', alignItems:'center', gap:16}}>
          <div style={{fontSize:11.5, color:'var(--muted)'}}>
            <Shield size={11} style={{display:'inline', marginRight:4, marginBottom:-1}}/>
            이 소개문은 바이어 초청 메일, 쇼케이스 카탈로그에 그대로 노출됩니다.
          </div>
          <div style={{display:'flex', alignItems:'center', gap:14}}>
            {saved && <span style={{color:'var(--green)', fontSize:13, display:'flex', alignItems:'center', gap:6}}><Check size={14}/>저장되었습니다</span>}
            {over && <span style={{color:'var(--red)', fontSize:12, display:'flex', alignItems:'center', gap:4}}><AlertCircle size={12}/>글자 수 초과</span>}
            <button className="btn btn-primary" onClick={save} disabled={over}><Save size={14}/>저장</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------- IPs TAB — IP 관리 (CRUD) ----------------
function IPsTab({me, update}){
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(null);

  const ips = me.ips || [];

  const openNew = () => {
    const id = 'IP-' + Date.now();
    setForm({
      id, name:'', nameEn:'', introEn:'', genre:'', targetAge:'', format:'',
      desiredBuyerPriority:['','','',''],
      regions:[],
    });
    setEditingId(id);
  };

  const openEdit = (ip) => {
    setForm({
      ...ip,
      desiredBuyerPriority: ip.desiredBuyerPriority || ['','','',''],
      regions: ip.regions || [],
    });
    setEditingId(ip.id);
  };

  const save = () => {
    const exists = ips.find(x => x.id === form.id);
    const next = exists ? ips.map(x => x.id === form.id ? form : x) : [...ips, form];
    const now = new Date().toISOString();
    update(s => ({...s, exhibitors: s.exhibitors.map(e => e.id===me.id ? {
      ...e, ips: next,
      updatedAt: now,
      sectionsUpdatedAt: {...(e.sectionsUpdatedAt || {}), ips: now},
    } : e)}));
    setEditingId(null); setForm(null);
  };

  const del = (id) => {
    if (!confirm('해당 IP를 삭제하시겠습니까? 복구할 수 없습니다.')) return;
    const now = new Date().toISOString();
    update(s => ({...s, exhibitors: s.exhibitors.map(e => e.id===me.id ? {
      ...e, ips: (e.ips||[]).filter(x => x.id !== id),
      updatedAt: now,
      sectionsUpdatedAt: {...(e.sectionsUpdatedAt || {}), ips: now},
    } : e)}));
  };

  const toggleRegion = (key) => {
    const cur = new Set(form.regions || []);
    if (cur.has(key)) cur.delete(key); else cur.add(key);
    setForm({...form, regions: Array.from(cur)});
  };

  const setPriority = (idx, v) => {
    const p = [...(form.desiredBuyerPriority || ['','','',''])];
    p[idx] = v;
    // 기타가 아닌 값을 선택하면 other 텍스트 자동 초기화
    const o = [...(form.desiredBuyerPriorityOther || ['','','',''])];
    if (v !== '기타 (Others)') o[idx] = '';
    setForm({...form, desiredBuyerPriority: p, desiredBuyerPriorityOther: o});
  };

  const setPriorityOther = (idx, v) => {
    const o = [...(form.desiredBuyerPriorityOther || ['','','',''])];
    o[idx] = v;
    setForm({...form, desiredBuyerPriorityOther: o});
  };

  return (
    <div className="fade-in">
      <SectionHeader eyebrow="SECTION 03" title="IP 소개 · 희망 바이어 설정"
        desc="참가사 보유 IP를 개별 등록하고, 각 IP별로 장르·포맷·타겟을 기입해주세요. IP 영문 제목과 영문 소개(400자 이내)는 글로벌 바이어에게 배포될 프로그램북에 그대로 노출되므로 영문으로 정확히 작성해주세요. 희망 바이어 카테고리(1~4순위)와 타겟 권역은 매칭 엔진에 즉시 반영됩니다." />

      {/* 영문 작성 안내 배너 */}
      <div style={{
        marginTop:20, padding:'12px 16px',
        background:'var(--gold-lt)',
        border:'1px solid rgba(212,160,92,0.35)',
        borderRadius:'var(--radius-sm)',
        fontSize:12.5, lineHeight:1.65, color:'var(--gold-dk)',
        display:'flex', alignItems:'flex-start', gap:10,
      }}>
        <Languages size={14} style={{marginTop:2, flexShrink:0}}/>
        <div>
          <strong>Please write in English · 영문 작성 필수</strong>
          <div style={{fontSize:11.5, color:'var(--ink-2)', marginTop:3}}>
            IP Name (English), IP Introduction (400 characters max in English) will be shared with global buyers in official program book & pitching materials.
            <br/>IP 영문명과 영문 소개(400자 이내)는 글로벌 바이어 배포용 공식 프로그램북·피칭 자료에 직접 게재됩니다.
          </div>
        </div>
      </div>

      <div style={{marginTop:24, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div className="mono" style={{fontSize:11, color:'var(--muted)', letterSpacing:'0.12em'}}>
          REGISTERED IPs · <span className="tabular" style={{color:'var(--ink)', fontWeight:700}}>{ips.length}</span>
        </div>
        <button className="btn btn-primary" onClick={openNew}><Plus size={14}/>IP 추가</button>
      </div>

      <div className="grid stagger" style={{gridTemplateColumns:'1fr', gap:12, marginTop:16}}>
        {ips.length === 0 && (
          <div className="card" style={{padding:48, textAlign:'center', color:'var(--muted)', fontSize:13.5}}>
            등록된 IP가 없습니다.<br/>
            <span style={{fontSize:12, color:'var(--muted-2)'}}>우측 상단 "IP 추가" 버튼으로 첫 번째 IP를 등록해보세요.</span>
          </div>
        )}
        {ips.map((ip, idx) => (
          <div key={ip.id} className="card" style={{padding:24}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:16, marginBottom:16}}>
              <div style={{flex:1, minWidth:0}}>
                <div className="mono" style={{fontSize:10, letterSpacing:'0.18em', color:'var(--muted)', marginBottom:4}}>IP #{String(idx+1).padStart(2,'0')}</div>
                <div style={{display:'flex', alignItems:'baseline', gap:12, flexWrap:'wrap'}}>
                  <div className="serif" style={{fontSize:22, fontWeight:600, letterSpacing:'-0.02em'}}>
                    {ip.name || <span style={{color:'var(--muted-2)'}}>제목 미입력</span>}
                  </div>
                  {ip.nameEn && <div style={{fontSize:14, color:'var(--muted)', fontStyle:'normal'}}>/ {ip.nameEn}</div>}
                </div>
                <div style={{display:'flex', gap:6, flexWrap:'wrap', marginTop:12}}>
                  {ip.genre     && <span className="chip">{ip.genre}</span>}
                  {ip.format    && <span className="chip">{ip.format}</span>}
                  {ip.targetAge && <span className="chip">{ip.targetAge}</span>}
                  {formatRuntimeSummary(ip).map((s,i) => <span key={i} className="chip" style={{background:'var(--paper)', borderColor:'var(--line)'}}>{s}</span>)}
                </div>
              </div>
              <div style={{display:'flex', gap:6}}>
                <button className="btn btn-ghost" style={{padding:'6px 10px', fontSize:12}} onClick={()=>openEdit(ip)}><Edit3 size={12}/>수정</button>
                <button className="btn btn-danger" style={{padding:'6px 10px', fontSize:12}} onClick={()=>del(ip.id)}><Trash2 size={12}/></button>
              </div>
            </div>

            <hr className="rule"/>

            {/* IP Introduction (영문) */}
            {ip.introEn && (
              <div style={{marginTop:16, padding:'14px 16px', background:'var(--ivory-2)', borderRadius:'var(--radius-sm)', border:'1px solid var(--line-2)'}}>
                <div className="mono" style={{fontSize:9.5, letterSpacing:'0.15em', color:'var(--muted)', marginBottom:6, fontWeight:600}}>
                  IP INTRODUCTION · ENGLISH
                </div>
                <div style={{fontSize:13, lineHeight:1.65, color:'var(--ink-2)', whiteSpace:'pre-wrap'}}>
                  {ip.introEn}
                </div>
              </div>
            )}

            <div className="grid" style={{gridTemplateColumns:'1.2fr 1fr', gap:28, marginTop:16}}>
              <div>
                <div className="label" style={{marginBottom:10}}>희망 바이어 카테고리</div>
                <div style={{display:'flex', flexDirection:'column', gap:6}}>
                  {(ip.desiredBuyerPriority||['','','','']).map((c, i) => {
                    const otherText = ip.desiredBuyerPriorityOther?.[i];
                    const isOther = c === '기타 (Others)';
                    const display = !c ? '미설정'
                      : isOther ? (otherText ? `기타 · ${otherText}` : '기타 (미입력)')
                      : c;
                    return (
                      <div key={i} style={{display:'flex', alignItems:'center', gap:10, fontSize:12.8}}>
                        <span className="mono" style={{fontSize:10, padding:'2px 8px', background: c ? 'var(--ink)' : 'var(--ivory-2)', color: c ? 'var(--ivory)' : 'var(--muted)', borderRadius:3, fontWeight:600, minWidth:40, textAlign:'center'}}>{i+1}순위</span>
                        <span style={{color: c ? 'var(--ink)' : 'var(--muted-2)'}}>{display}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="label" style={{marginBottom:10}}>타겟 권역</div>
                <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
                  {(ip.regions||[]).map(r => {
                    const reg = REGIONS.find(x => x.key === r);
                    const ww = r === 'WW';
                    return (
                      <span key={r} className="chip" style={{
                        background: ww ? 'var(--ink)' : 'var(--ivory-2)',
                        color: ww ? 'var(--ivory)' : 'var(--ink)',
                        borderColor: ww ? 'var(--ink)' : 'var(--line)',
                        fontWeight: ww ? 600 : 500
                      }}>{reg?.label || r}</span>
                    );
                  })}
                  {(ip.regions||[]).length === 0 && <span style={{fontSize:12, color:'var(--muted-2)'}}>미설정</span>}
                </div>
              </div>
            </div>

            {/* Images preview row */}
            {(ip.images || []).length > 0 && (
              <div style={{marginTop:16, paddingTop:16, borderTop:'1px solid var(--line-2)'}}>
                <div className="label" style={{marginBottom:10}}>IP 이미지 <span style={{color:'var(--muted)', fontWeight:400, marginLeft:4}}>· {ip.images.length}장</span></div>
                <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
                  {ip.images.slice(0, 8).map(img => <AsyncThumb key={img.key} imgKey={img.key} size={56}/>)}
                  {ip.images.length > 8 && (
                    <div style={{width:56, height:56, background:'var(--ivory-2)', borderRadius:'var(--radius-sm)', display:'grid', placeItems:'center', fontSize:11, color:'var(--muted)', fontWeight:500}}>+{ip.images.length - 8}</div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {editingId && form && (
        <Modal title={ips.find(x=>x.id===form.id) ? 'IP 정보 수정' : '새 IP 등록'} onClose={()=>{setEditingId(null); setForm(null);}}>
          <div className="grid" style={{gridTemplateColumns:'1fr 1fr', gap:16}}>
            <div>
              <label className="label">IP 이름 (국문)</label>
              <input className="input" value={form.name||''} onChange={e=>setForm({...form, name:e.target.value})} placeholder="예: 마법 학교의 신입생"/>
            </div>
            <div>
              <label className="label">IP Name (English)</label>
              <input className="input" value={form.nameEn||''} onChange={e=>setForm({...form, nameEn:e.target.value})} placeholder="e.g., New Student of the Magic School"/>
            </div>
            <div style={{gridColumn:'1 / -1'}}>
              <label className="label" style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                <span>IP Introduction <span style={{color:'var(--muted)', fontWeight:400, marginLeft:4}}>· 영문 400자 이내 작성</span></span>
                {(() => {
                  const count = (form.introEn || '').length;
                  const over = count > 400;
                  const warning = !over && count > 350;
                  return (
                    <span className="mono tabular" style={{fontSize:10.5, fontWeight:500, color: over ? 'var(--red)' : (warning ? 'var(--amber)' : 'var(--muted)')}}>
                      {count} / 400
                    </span>
                  );
                })()}
              </label>
              <textarea
                className="textarea"
                rows={5}
                value={form.introEn || ''}
                onChange={e => setForm({...form, introEn: e.target.value})}
                placeholder="Brief English synopsis of your IP for global buyers. e.g., A heart-warming fantasy series following a 12-year-old girl entering a magical boarding school where every student discovers their unique elemental power..."
                style={{lineHeight:1.7, resize:'vertical'}}
              />
              <div style={{fontSize:10.5, color:'var(--muted-2)', marginTop:4, lineHeight:1.5}}>
                This introduction will be displayed in the official program book distributed to global buyers.
                글로벌 바이어 배포용 프로그램북에 그대로 노출됩니다.
              </div>
            </div>
            <div>
              <label className="label">장르 (Genre)</label>
              <select className="select" value={form.genre||''} onChange={e=>setForm({...form, genre:e.target.value})}>
                <option value="">선택하세요</option>
                {GENRE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="label">타겟 연령 (Target Age)</label>
              <select className="select" value={form.targetAge||''} onChange={e=>setForm({...form, targetAge:e.target.value})}>
                <option value="">선택하세요</option>
                {TARGET_AGE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div style={{gridColumn:'1 / -1'}}>
              <label className="label">포맷</label>
              <select className="select" value={form.format||''} onChange={e=>setForm({...form, format:e.target.value})}>
                <option value="">선택하세요</option>
                {FORMAT_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div style={{gridColumn:'1 / -1'}}>
              <label className="label">세부 사항 <span style={{color:'var(--muted)', fontWeight:400, marginLeft:6}}>(해당 항목만 기입)</span></label>
              <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:10}}>
                <NumberWithHint value={form.episodes}   onChange={v=>setForm({...form, episodes:v})}   placeholder="0" hint="에피소드 수"  unit="개"/>
                <NumberWithHint value={form.seasons}    onChange={v=>setForm({...form, seasons:v})}    placeholder="0" hint="시즌 수"     unit="기"/>
                <NumberWithHint value={form.runtimeMin} onChange={v=>setForm({...form, runtimeMin:v})} placeholder="0" hint="회당 러닝타임" unit="분"/>
                <NumberWithHint value={form.runtimeSec} onChange={v=>setForm({...form, runtimeSec:v})} placeholder="0" hint=""              unit="초" max={59}/>
              </div>
            </div>
          </div>

          <hr className="rule" style={{margin:'24px 0'}}/>

          <div className="label" style={{marginBottom:10}}>희망 바이어 카테고리</div>
          <div style={{display:'flex', flexDirection:'column', gap:10}}>
            {[0,1,2,3].map(i => {
              const selected = form.desiredBuyerPriority?.[i] || '';
              const isOther = selected === '기타 (Others)';
              return (
                <div key={i}>
                  <div style={{display:'grid', gridTemplateColumns:'70px 1fr', gap:10, alignItems:'center'}}>
                    <div className="mono" style={{fontSize:11, color:'var(--muted)', letterSpacing:'0.08em'}}>{i+1}순위</div>
                    <select className="select" value={selected} onChange={e=>setPriority(i, e.target.value)}>
                      <option value="">선택하세요</option>
                      {BUYER_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  {isOther && (
                    <div style={{display:'grid', gridTemplateColumns:'70px 1fr', gap:10, marginTop:6}}>
                      <div/>
                      <input className="input" placeholder="기타 카테고리를 직접 입력하세요"
                             value={form.desiredBuyerPriorityOther?.[i] || ''}
                             onChange={e=>setPriorityOther(i, e.target.value)}/>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <hr className="rule" style={{margin:'24px 0'}}/>

          <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:10}}>
            <div className="label" style={{margin:0}}>타겟 권역</div>
            <div style={{fontSize:11, color:'var(--muted-2)'}}>복수 선택 가능 · 글로벌 선택 시 전 권역 대응</div>
          </div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
            {REGIONS.map(r => {
              const active = (form.regions||[]).includes(r.key);
              const ww = r.key === 'WW';
              return (
                <button key={r.key} onClick={()=>toggleRegion(r.key)}
                  style={{
                    padding:'11px 14px', borderRadius:'var(--radius-sm)', cursor:'pointer',
                    border: active ? '1px solid var(--ink)' : '1px solid var(--line)',
                    background: active ? 'var(--ink)' : 'var(--paper)',
                    color: active ? 'var(--ivory)' : 'var(--ink)',
                    fontSize:13, fontFamily:'inherit', fontWeight: ww ? 600 : 500,
                    display:'flex', alignItems:'center', gap:8, justifyContent:'space-between',
                    transition:'all .15s',
                    gridColumn: ww ? '1 / -1' : 'auto',
                  }}>
                  <span style={{display:'flex', alignItems:'center', gap:8}}>
                    {ww && <Globe size={14}/>}
                    {r.label}
                  </span>
                  {active && <Check size={14}/>}
                </button>
              );
            })}
          </div>

          <hr className="rule" style={{margin:'24px 0'}}/>

          <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:10}}>
            <div className="label" style={{margin:0}}>IP 이미지</div>
            <div style={{fontSize:11, color:'var(--muted-2)'}}>복수 업로드 · PNG, JPG, WebP · 파일당 50MB 이하</div>
          </div>
          <IPImageUploader form={form} setForm={setForm}/>

          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:24, gap:12}}>
            <div style={{fontSize:11, color: (form.introEn || '').length > 400 ? 'var(--red)' : 'var(--muted-2)', lineHeight:1.5}}>
              {(form.introEn || '').length > 400
                ? `⚠️ IP Introduction이 400자를 ${(form.introEn || '').length - 400}자 초과했습니다.`
                : '모든 입력 내용은 저장 후 운영 사무국 및 글로벌 바이어에게 공유됩니다.'}
            </div>
            <div style={{display:'flex', gap:8}}>
              <button className="btn btn-ghost" onClick={()=>{setEditingId(null); setForm(null);}}>취소</button>
              <button className="btn btn-primary" onClick={save} disabled={(form.introEn || '').length > 400}>
                <Save size={14}/>저장
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------------- SURVEY TAB — 수요조사 ----------------
function SurveyTab({me, update}){
  const initial = me.survey || { needsInterpreter:null, moderatorIntroEn:'', accommodation:'', flightInfo:'', mailAddress:'', additionalTravelers:[], pitcherRRN:'', feedback:'' };
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(false);
  useEffect(()=>setForm(me.survey || initial), [me.id]);

  const save = () => {
    const now = new Date().toISOString();
    update(s => ({...s, exhibitors: s.exhibitors.map(e => e.id===me.id ? {
      ...e, survey: form,
      updatedAt: now,
      sectionsUpdatedAt: {...(e.sectionsUpdatedAt || {}), survey: now},
    } : e)}));
    setSaved(true); setTimeout(()=>setSaved(false), 2000);
  };

  const travelers = form.additionalTravelers || [];
  const addTraveler    = () => setForm({...form, additionalTravelers: [...travelers, {name:'', position:''}]});
  const updateTraveler = (i, key, v) => setForm({...form, additionalTravelers: travelers.map((t,j) => j===i ? {...t, [key]:v} : t)});
  const removeTraveler = (i) => setForm({...form, additionalTravelers: travelers.filter((_,j) => j !== i)});

  const QBox = ({num, icon, title, children}) => (
    <div className="card" style={{padding:24, marginTop:16}}>
      <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:14}}>
        <div style={{width:28, height:28, background:'var(--ivory-2)', borderRadius:'var(--radius-sm)', display:'grid', placeItems:'center', color:'var(--muted)'}}>
          {icon}
        </div>
        <div>
          <div className="mono" style={{fontSize:10, color:'var(--muted)', letterSpacing:'0.14em'}}>Q{String(num).padStart(2,'0')}</div>
          <div className="serif" style={{fontSize:15, fontWeight:600, marginTop:1}}>{title}</div>
        </div>
      </div>
      {children}
    </div>
  );

  return (
    <div className="fade-in">
      <SectionHeader eyebrow="SECTION 04" title="참가사 수요조사 (On-site Survey)"
        desc="출장 및 현장 운영을 위한 정보를 수집합니다. 주민등록번호 등 민감정보는 여행자 보험 가입 등 공식 용도에만 사용되며 사업 종료 후 30일 이내 안전하게 파기됩니다." />

      <QBox num={1} icon={<Languages size={14}/>} title="통역 필요 여부">
        <div style={{display:'flex', gap:8}}>
          {[
            {v:'O', label:'필요 (Yes)', icon:<Check size={14}/>},
            {v:'X', label:'불필요 (No)', icon:<X size={14}/>},
          ].map(opt => (
            <button key={opt.v} onClick={()=>setForm({...form, needsInterpreter: opt.v})}
              className={form.needsInterpreter===opt.v ? 'btn btn-primary' : 'btn btn-ghost'}
              style={{flex:1, justifyContent:'center', padding:'11px 24px'}}>
              {opt.icon}{opt.label}
            </button>
          ))}
        </div>
      </QBox>

      <QBox num={2} icon={<MessageSquare size={14}/>} title="피칭 쇼케이스 모더레이터 소개 멘트 (영어)">
        <textarea className="textarea" rows={5} value={form.moderatorIntroEn||''}
                  onChange={e=>setForm({...form, moderatorIntroEn:e.target.value})}
                  placeholder="Write the English introduction script the moderator will read on stage. e.g., 'Next up, we welcome Climax Studio, a Seoul-based animation studio with a portfolio of award-winning kids IPs...'"
                  style={{lineHeight:1.7}}/>
      </QBox>

      <QBox num={3} icon={<Home size={14}/>} title="MIFA 출장 기간 숙소명 및 주소">
        <textarea className="textarea" rows={3} value={form.accommodation||''}
                  onChange={e=>setForm({...form, accommodation:e.target.value})}
                  placeholder="호텔명, 주소, 체크인 / 체크아웃 일자를 기입해주세요. 예) Hôtel Mercure Annecy Centre · 26 Av. du Parmelan · Check-in 2026-06-10 / Check-out 2026-06-15"/>
      </QBox>

      <QBox num={4} icon={<Plane size={14}/>} title="MIFA 출장 항공 정보">
        <textarea className="textarea" rows={3} value={form.flightInfo||''}
                  onChange={e=>setForm({...form, flightInfo:e.target.value})}
                  placeholder="출국·입국 편명과 일시. 예) 출국 KE901 2026-06-09 13:45 ICN → CDG / 입국 KE902 2026-06-16 19:20 CDG → ICN"/>
      </QBox>

      <QBox num={5} icon={<Mail size={14}/>} title="출장자료 우편 수령처 주소">
        <textarea className="textarea" rows={2} value={form.mailAddress||''}
                  onChange={e=>setForm({...form, mailAddress:e.target.value})}
                  placeholder="출장 전 자료를 발송할 국내 주소입니다. 회사 주소 또는 담당자 수령 가능 주소 (우편번호 포함)"/>
      </QBox>

      <QBox num={6} icon={<Users size={14}/>} title="피칭 담당자 외 출장 인원">
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
          <div style={{fontSize:12, color:'var(--muted)'}}>{travelers.length}명 등록됨</div>
          <button className="btn btn-ghost" style={{padding:'6px 12px', fontSize:12}} onClick={addTraveler}><Plus size={12}/>인원 추가</button>
        </div>
        {travelers.length === 0
          ? <div style={{padding:20, background:'var(--ivory-2)', fontSize:12.5, color:'var(--muted)', textAlign:'center', borderRadius:'var(--radius-sm)'}}>
              추가 출장 인원이 있으면 "인원 추가" 버튼으로 등록해주세요. 없으면 비워두셔도 됩니다.
            </div>
          : <div style={{display:'flex', flexDirection:'column', gap:8}}>
              {travelers.map((t, i) => (
                <div key={i} style={{display:'grid', gridTemplateColumns:'1fr 1fr auto', gap:8, alignItems:'end'}}>
                  <div>
                    {i===0 && <label className="label" style={{fontSize:10.5}}>이름</label>}
                    <input className="input" value={t.name||''} onChange={e=>updateTraveler(i, 'name', e.target.value)} placeholder="홍길동"/>
                  </div>
                  <div>
                    {i===0 && <label className="label" style={{fontSize:10.5}}>직함</label>}
                    <input className="input" value={t.position||''} onChange={e=>updateTraveler(i, 'position', e.target.value)} placeholder="프로듀서"/>
                  </div>
                  <button className="btn btn-danger" style={{padding:'9px 12px'}} onClick={()=>removeTraveler(i)}><Trash2 size={12}/></button>
                </div>
              ))}
            </div>
        }
      </QBox>

      <div className="card" style={{padding:24, marginTop:16, borderLeft:'3px solid var(--ink)'}}>
        <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:10}}>
          <div style={{width:28, height:28, background:'var(--ink)', color:'var(--ivory)', borderRadius:'var(--radius-sm)', display:'grid', placeItems:'center'}}>
            <Shield size={14}/>
          </div>
          <div>
            <div className="mono" style={{fontSize:10, color:'var(--muted)', letterSpacing:'0.14em'}}>Q07 · CONFIDENTIAL</div>
            <div className="serif" style={{fontSize:15, fontWeight:600, marginTop:1}}>피칭 담당자 주민등록번호</div>
          </div>
        </div>
        <div style={{fontSize:11.5, color:'var(--muted)', lineHeight:1.6, marginBottom:10, padding:'8px 12px', background:'var(--ivory-2)', borderRadius:'var(--radius-sm)'}}>
          <Shield size={11} style={{display:'inline', marginRight:4, marginBottom:-1}}/>
          여행자 보험 가입 목적으로만 사용됩니다. 사업 종료 후 30일 이내 안전하게 파기되며, 제3자에게 제공되지 않습니다.
        </div>
        <input className="input" value={form.pitcherRRN||''} onChange={e=>setForm({...form, pitcherRRN:e.target.value})}
               placeholder="000000-0000000" style={{letterSpacing:'0.02em'}}/>
      </div>

      <QBox num={8} icon={<MessageSquare size={14}/>} title="피칭 쇼케이스 및 행사 관련 의견 서술">
        <textarea className="textarea" rows={5} value={form.feedback||''}
                  onChange={e=>setForm({...form, feedback:e.target.value})}
                  placeholder="요청사항, 특별 준비사항, 기타 협의하실 내용을 자유롭게 기입해주세요."
                  style={{lineHeight:1.7}}/>
      </QBox>

      <div style={{marginTop:28, display:'flex', justifyContent:'flex-end', alignItems:'center', gap:16}}>
        {saved && <span style={{color:'var(--green)', fontSize:13, display:'flex', alignItems:'center', gap:6}}><Check size={14}/>수요조사가 저장되었습니다</span>}
        <button className="btn btn-primary" onClick={save} style={{padding:'12px 24px'}}><Save size={14}/>수요조사 전체 저장</button>
      </div>
    </div>
  );
}

// ---------------- MATCHES TAB ----------------
function MatchesTab({matches, me}){
  const [filter, setFilter] = useState('all');
  const filtered = matches.filter(m => filter === 'all' ? true : matchTier(m.score).label.toLowerCase() === filter);
  const counts = {
    strong: matches.filter(m=>m.score>=75).length,
    moderate: matches.filter(m=>m.score>=50 && m.score<75).length,
    weak: matches.filter(m=>m.score<50).length,
  };

  return (
    <div className="fade-in">
      <SectionHeader eyebrow="SECTION 03" title="바이어 매칭 분석"
        desc={`희망 조건 기준 ${matches.length}개 바이어가 평가되었습니다. 가중치 — 국가 30 · 업종 30 · 키워드 30 · 규모 10`}/>

      <div className="grid" style={{gridTemplateColumns:'repeat(4,1fr)', gap:12, marginTop:24}}>
        <SummaryTile label="TOTAL"    value={matches.length} onClick={()=>setFilter('all')} active={filter==='all'}/>
        <SummaryTile label="STRONG"   value={counts.strong}   color="#1F4D3D" onClick={()=>setFilter('strong')} active={filter==='strong'}/>
        <SummaryTile label="MODERATE" value={counts.moderate} color="#8A6B1F" onClick={()=>setFilter('moderate')} active={filter==='moderate'}/>
        <SummaryTile label="WEAK"     value={counts.weak}     color="#7A2E2E" onClick={()=>setFilter('weak')} active={filter==='weak'}/>
      </div>

      <div className="grid stagger" style={{gridTemplateColumns:'1fr', gap:12, marginTop:24}}>
        {filtered.map(({buyer, score, reasons}) => {
          const tier = matchTier(score);
          return (
            <div key={buyer.id} className="card" style={{padding:24, display:'grid', gridTemplateColumns:'80px 1fr 240px', gap:24, alignItems:'center'}}>
              {/* score ring */}
              <div style={{position:'relative', width:80, height:80, display:'grid', placeItems:'center'}}>
                <svg width="80" height="80" viewBox="0 0 80 80" style={{position:'absolute', transform:'rotate(-90deg)'}}>
                  <circle cx="40" cy="40" r="34" fill="none" stroke="var(--line-2)" strokeWidth="4"/>
                  <circle cx="40" cy="40" r="34" fill="none" stroke={tier.color} strokeWidth="4"
                          strokeDasharray={`${(score/100)*213.6} 213.6`} strokeLinecap="round"/>
                </svg>
                <div style={{textAlign:'center'}}>
                  <div className="serif tabular" style={{fontSize:22, fontWeight:600, color:tier.color, lineHeight:1}}>{score}</div>
                  <div className="mono" style={{fontSize:8, letterSpacing:'0.15em', color:'var(--muted)'}}>SCORE</div>
                </div>
              </div>

              <div>
                <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:6}}>
                  <span className="mono" style={{fontSize:10, color:'var(--muted)'}}>{buyer.id}</span>
                  <span style={{fontSize:10, padding:'2px 8px', background:tier.bg, color:tier.color, borderRadius:999, fontWeight:600, letterSpacing:'0.08em'}}>{tier.label.toUpperCase()}</span>
                  <InvitationBadge status={buyer.invitationStatus}/>
                </div>
                <div className="serif" style={{fontSize:20, fontWeight:500, marginBottom:4}}>{buyer.companyName}</div>
                <div style={{fontSize:12.5, color:'var(--muted)', marginBottom:10}}>
                  <Globe size={11} style={{display:'inline', marginRight:4, marginBottom:-1}}/>{buyer.country}
                  <span style={{margin:'0 8px'}}>·</span>
                  <Briefcase size={11} style={{display:'inline', marginRight:4, marginBottom:-1}}/>{getBuyerCategories(buyer).join(', ') || '—'}
                  <span style={{margin:'0 8px'}}>·</span>
                  {buyer.companySize}
                </div>
                <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
                  {reasons.length === 0 ? <span style={{fontSize:12, color:'var(--muted)'}}>일치 항목 없음</span>
                    : reasons.map((r,i)=><span key={i} className="chip" style={{fontSize:10.5, background:'var(--ivory)'}}><Check size={10} style={{color:tier.color}}/>{r}</span>)}
                </div>
              </div>

              <div style={{borderLeft:'1px solid var(--line-2)', paddingLeft:20}}>
                <div className="label" style={{marginBottom:8}}>관심 품목</div>
                <div style={{fontSize:12.5, lineHeight:1.6, color:'var(--ink)'}}>{buyer.interestedProducts}</div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <div style={{padding:40, textAlign:'center', color:'var(--muted)'}}>해당 등급의 바이어가 없습니다.</div>}
      </div>
    </div>
  );
}

function SummaryTile({label, value, color, onClick, active}){
  return (
    <button onClick={onClick} className="card card-hover" style={{padding:20, textAlign:'left', cursor:'pointer', fontFamily:'inherit', background: active?'var(--navy)':'var(--paper)', color:active?'var(--ivory)':'var(--ink)', borderColor:active?'var(--navy)':'var(--line)'}}>
      <div className="mono" style={{fontSize:10, letterSpacing:'0.18em', color:active?'var(--gold)':'var(--muted)'}}>{label}</div>
      <div className="serif tabular" style={{fontSize:42, fontWeight:500, lineHeight:1.05, marginTop:6, color: color && !active ? color : 'inherit'}}>{value}</div>
    </button>
  );
}

function InvitationBadge({status}){
  const map = {
    accepted: {dot:'dot-green',  label:'참가확정'},
    pending:  {dot:'dot-gold',   label:'회신대기'},
    sent:     {dot:'dot-muted',  label:'초청발송'},
    declined: {dot:'dot-red',    label:'참가불가'},
    null:     {dot:'dot-muted',  label:'미발송'},
  };
  const m = map[status] || map.null;
  return (
    <span style={{display:'inline-flex', alignItems:'center', gap:6, fontSize:11, color:'var(--muted)'}}>
      <span className={`dot ${m.dot}`}/>{m.label}
    </span>
  );
}

// 바이어 구분(Grade) 뱃지 — VIP / Key / Active / Potential / Watch / Cold
function GradeBadge({grade}){
  if (!grade) return <span style={{fontSize:11.5, color:'var(--muted-2)'}}>—</span>;
  const info = getGradeInfo(grade);
  if (!info) return <span style={{fontSize:11.5, color:'var(--muted-2)'}}>{grade}</span>;
  return (
    <span style={{
      display:'inline-flex', alignItems:'center',
      padding:'2px 9px', borderRadius:3, fontSize:10.5, fontWeight:700,
      letterSpacing:'0.04em',
      background: info.bg, color: info.color,
      border: `1px solid ${info.color}30`,
    }}>
      {info.label}
    </span>
  );
}

// 선호 콘텐츠 간결 요약 — RSVP 리스트·바이어 DB 테이블 셀용
// 각 차원의 첫 값 + 추가 개수만 표시
function PreferredContentSummary({buyer, emptyLabel='—'}){
  const ta = getBuyerTargetAges(buyer);
  const gn = getBuyerGenres(buyer);
  const fm = getBuyerFormats(buyer);
  const rg = getBuyerInterestedRegions(buyer);
  const hasAny = ta.length || gn.length || fm.length || rg.length;
  if (!hasAny) return <span style={{fontSize:11.5, color:'var(--muted-2)'}}>{emptyLabel}</span>;

  const regionLabel = (k) => (REGIONS.find(r => r.key === k) || {}).label?.split(' · ')[0] || k;
  const isAutoRegion = !Array.isArray(buyer.interestedRegions) || buyer.interestedRegions.length === 0;

  const Chip = ({icon, primary, count, title, auto}) => (
    <span
      title={title}
      style={{
        display:'inline-flex', alignItems:'center', gap:3,
        fontSize:10.5, padding:'2px 7px', borderRadius:3,
        background: auto ? 'rgba(139,92,246,0.06)' : 'var(--purple-lt)',
        border: auto ? '1px dashed rgba(139,92,246,0.35)' : '1px solid rgba(139,92,246,0.25)',
        color:'var(--purple-dk)', fontWeight:600,
        maxWidth:140, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
      }}
    >
      {icon}
      <span style={{overflow:'hidden', textOverflow:'ellipsis'}}>{primary}</span>
      {count > 0 && <span className="mono" style={{fontSize:9.5, opacity:0.75}}>+{count}</span>}
    </span>
  );

  return (
    <div style={{display:'flex', gap:4, flexWrap:'wrap', alignItems:'center'}}>
      {ta.length > 0 && (
        <Chip icon={<span style={{fontSize:9}}>👥</span>} primary={ta[0]} count={ta.length - 1} title={`타겟 연령: ${ta.join(', ')}`}/>
      )}
      {gn.length > 0 && (
        <Chip icon={<span style={{fontSize:9}}>🎬</span>} primary={gn[0]} count={gn.length - 1} title={`장르: ${gn.join(', ')}`}/>
      )}
      {fm.length > 0 && (
        <Chip icon={<span style={{fontSize:9}}>📺</span>} primary={fm[0]} count={fm.length - 1} title={`포맷: ${fm.join(', ')}`}/>
      )}
      {rg.length > 0 && (
        <Chip icon={<span style={{fontSize:9}}>🌐</span>} primary={regionLabel(rg[0])} count={rg.length - 1} title={`권역: ${rg.map(regionLabel).join(', ')}${isAutoRegion ? ' (국가 자동 감지)' : ''}`} auto={isAutoRegion}/>
      )}
    </div>
  );
}

// 선호 콘텐츠 전체 표시 — 미팅 추가 모달 등 넓은 공간용
function PreferredContentFull({buyer, compact=false}){
  const ta = getBuyerTargetAges(buyer);
  const gn = getBuyerGenres(buyer);
  const fm = getBuyerFormats(buyer);
  const rg = getBuyerInterestedRegions(buyer);
  const isAutoRegion = !Array.isArray(buyer.interestedRegions) || buyer.interestedRegions.length === 0;
  const hasAny = ta.length || gn.length || fm.length || rg.length;
  if (!hasAny) return null;

  const regionLabel = (k) => (REGIONS.find(r => r.key === k) || {}).label?.split(' · ')[0] || k;

  const Row = ({label, values, autoHint}) => {
    if (values.length === 0) return null;
    return (
      <div style={{display:'flex', alignItems:'flex-start', gap:10, marginBottom: compact ? 4 : 6}}>
        <div style={{
          fontSize:10, fontWeight:700, color:'var(--purple-dk)', letterSpacing:'0.08em',
          minWidth:60, paddingTop:3, textTransform:'uppercase',
        }}>
          {label}
          {autoHint && <div style={{fontSize:8.5, fontWeight:500, color:'var(--muted)', marginTop:1, letterSpacing:0, textTransform:'none'}}>자동감지</div>}
        </div>
        <div style={{display:'flex', flexWrap:'wrap', gap:4, flex:1}}>
          {values.map(v => (
            <span key={v} style={{
              padding:'2px 8px', fontSize:10.5, fontWeight:600,
              background:'#fff', border:'1px solid rgba(139,92,246,0.4)',
              color:'var(--purple-dk)', borderRadius:999,
            }}>{v}</span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div style={{
      padding:'10px 14px',
      background:'var(--purple-lt)',
      border:'1px solid rgba(139,92,246,0.3)',
      borderRadius:'var(--radius-sm)',
    }}>
      <div className="mono" style={{fontSize:9.5, letterSpacing:'0.15em', color:'var(--purple-dk)', fontWeight:700, marginBottom:8}}>
        PREFERRED CONTENT · 선호 콘텐츠
      </div>
      <Row label="타겟" values={ta}/>
      <Row label="장르" values={gn}/>
      <Row label="포맷" values={fm}/>
      <Row label="권역" values={rg.map(regionLabel)} autoHint={isAutoRegion}/>
    </div>
  );
}

// ---------------- MY MEETINGS TAB ----------------
function MyMeetingsTab({state, update, me}){
  const project = me.project;
  const config = EVENT_CONFIG[project] || EVENT_CONFIG.MIFA;
  const slots = useMemo(() => generateTimeSlots(config.timeStart, config.timeEnd, config.slotMinutes), [project]);

  const [selectedDate, setSelectedDate] = useState(config.dates[0]?.date || '');
  const [slotAction, setSlotAction] = useState(null);
  // slotAction: null | { type:'create'|'edit', time, meeting?, form:{buyerId, table, notes} }

  useEffect(() => { setSelectedDate(config.dates[0]?.date || ''); }, [project]);

  // 본인 미팅만 필터
  const myMeetings = state.meetings.filter(m => m.exhibitorId === me.id);
  const myMeetingsForDate = myMeetings.filter(m => m.date === selectedDate);

  const meetingsAt = (time) => myMeetingsForDate.filter(m => m.time === time);
  const getBuyer = (id) => state.buyers.find(b => b.id === id);

  // 권한 체크: 본인이 직접 편성한 미팅만 편집 가능
  const canEdit = (m) => m.createdBy === me.id || m.source === 'exhibitor_self';

  // 선택 가능한 바이어: 동일 프로젝트 + 아직 본인과 미팅 없음
  // (RSVP 회신 여부와 무관 — 참가사가 직접 섭외한 바이어도 DB에 있다면 추가 가능)
  const availableBuyers = state.buyers.filter(b =>
    b.project === project &&
    !state.meetings.some(m => m.exhibitorId === me.id && m.buyerId === b.id)
  );

  const openCreate = (time) => {
    setSlotAction({
      type:'create', time,
      form:{companyName:'', contactName:'', position:'', email:'', phone:''},
    });
  };
  const openEdit = (m) => {
    const b = getBuyer(m.buyerId);
    setSlotAction({
      type: canEdit(m) ? 'edit' : 'view',
      time: m.time, meeting: m,
      form: {
        companyName: b?.companyName || '',
        contactName: b?.contactName || '',
        position: b?.position || '',
        email: b?.email || '',
        phone: b?.phone || '',
      },
    });
  };
  const closeAction = () => setSlotAction(null);

  const saveCreate = () => {
    const f = slotAction.form;
    if (!(f.companyName || '').trim()) { alert('회사명을 입력해주세요.'); return; }

    update(s => {
      // 항상 신규 바이어 생성 (수동 입력 방식)
      const seq = s.buyers.length + 1;
      const buyerId = `BU-${project}-${String(seq).padStart(4,'0')}`;
      const guess = guessBuyerField(f.companyName);
      const size = guessBuyerSize(f.companyName);
      const newBuyer = {
        id: buyerId,
        project,
        companyName: f.companyName.trim(),
        contactName: f.contactName || '',
        position: f.position || '',
        email: f.email || '',
        phone: f.phone || '',
        country: '',
        categories: guessBuyerCategories(f.companyName),
        companySize: size || '',
        interestedProducts: '',
        invitationStatus: 'accepted',
        preferredDates: [selectedDate],
        source: 'exhibitor_added',
        pitchingShowcase: '',  // 참가사가 등록한 바이어는 피칭쇼케이스 빈 값
        // 확정 정보 자동 동기화 (RSVP 페이지에서 즉시 표시되도록)
        confirmedDate: selectedDate,
        confirmedTime: slotAction.time,
        confirmedExhibitorId: me.id,
      };

      const newMeeting = {
        id: `MT-SELF-${me.id}-${Date.now()}`,
        exhibitorId: me.id,
        buyerId,
        date: selectedDate,
        time: slotAction.time,
        table: '', // 참가사 모달은 테이블 입력 없음 (운영사가 나중 배정)
        status: 'confirmed',
        notes: '',
        source: 'exhibitor_self',
        createdBy: me.id,
      };

      return {
        ...s,
        buyers: [...s.buyers, newBuyer],
        meetings: [...s.meetings, newMeeting],
      };
    });
    closeAction();
  };

  const saveEdit = () => {
    const f = slotAction.form;
    const mid = slotAction.meeting.id;
    const buyerId = slotAction.meeting.buyerId;
    if (!(f.companyName || '').trim()) { alert('회사명을 입력해주세요.'); return; }
    update(s => ({
      ...s,
      // 바이어 정보(회사명 포함) 업데이트
      buyers: s.buyers.map(b => b.id === buyerId ? {
        ...b,
        companyName: f.companyName.trim(),
        contactName: f.contactName,
        position: f.position,
        email: f.email,
        phone: f.phone,
      } : b),
      // 미팅은 그대로 유지 (table/notes 운영사 관제 대상)
    }));
    closeAction();
  };

  const deleteMeeting = () => {
    const mid = slotAction.meeting.id;
    update(s => ({...s, meetings: s.meetings.filter(m => m.id !== mid)}));
    closeAction();
  };

  const filledCount = myMeetingsForDate.length;
  const editableCount = myMeetingsForDate.filter(canEdit).length;

  return (
    <div className="fade-in">
      <SectionHeader eyebrow="SECTION 06" title="비즈니스 미팅 스케줄"
        desc={`${config.label} 기간 중 본인의 미팅 스케줄입니다. 관리자가 편성한 미팅은 자동 반영되며, 빈 슬롯은 본인이 직접 바이어를 선택해 채울 수 있습니다. 본인이 편성한 미팅만 수정/삭제 가능합니다.`}/>

      {/* 권한 안내 박스 */}
      <div style={{marginTop:20, display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
        <div style={{padding:16, background:'var(--ivory-2)', borderLeft:`3px solid ${projectColor(project).bg}`, borderRadius:'var(--radius-sm)'}}>
          <div className="mono" style={{fontSize:10, letterSpacing:'0.15em', color:'var(--muted)', marginBottom:6}}>SELF-SCHEDULED</div>
          <div style={{fontSize:12.5, lineHeight:1.6, color:'var(--ink)'}}>
            <strong>본인 편성 미팅</strong> — 빈 슬롯을 선택해 바이어와의 미팅을 직접 등록하고, 언제든 내용을 수정·삭제할 수 있습니다.
          </div>
        </div>
        <div style={{padding:16, background:'var(--ivory-2)', borderLeft:'3px solid var(--muted)', borderRadius:'var(--radius-sm)'}}>
          <div className="mono" style={{fontSize:10, letterSpacing:'0.15em', color:'var(--muted)', marginBottom:6}}>ADMIN-SCHEDULED</div>
          <div style={{fontSize:12.5, lineHeight:1.6, color:'var(--ink)'}}>
            <strong>운영사 편성 미팅</strong> — RSVP 매칭으로 자동 편성된 미팅입니다. 변경 문의는 운영사에 연락해주세요.
          </div>
        </div>
      </div>

      {config.dates.length === 0 ? (
        <div className="card" style={{padding:52, textAlign:'center', color:'var(--muted)', marginTop:24}}>
          {project} 행사 일정이 아직 등록되지 않았습니다. 운영사 공지를 확인해주세요.
        </div>
      ) : (
      <>
        {/* 날짜 탭 */}
        <div style={{display:'flex', gap:6, marginTop:22, marginBottom:14, overflowX:'auto', paddingBottom:2}}>
          {config.dates.map(d => {
            const active = selectedDate === d.date;
            const cnt = myMeetings.filter(m => m.date === d.date).length;
            return (
              <button key={d.date} onClick={()=>setSelectedDate(d.date)} style={{
                padding:'10px 16px', borderRadius:'var(--radius-sm)', cursor:'pointer',
                border: active ? '1px solid var(--ink)' : '1px solid var(--line)',
                background: active ? 'var(--ink)' : 'var(--paper)',
                color: active ? 'var(--ivory)' : 'var(--ink-2)',
                fontFamily:'inherit', display:'flex', flexDirection:'column', alignItems:'flex-start', gap:2,
                minWidth:112, transition:'all .15s',
              }}>
                <span className="mono" style={{fontSize:10.5, opacity: active ? 0.7 : 0.55, letterSpacing:'0.05em'}}>{d.dow}</span>
                <span style={{fontSize:14, fontWeight:600}}>{d.date.slice(5)}</span>
                <span className="mono tabular" style={{fontSize:10, opacity: active ? 0.65 : 0.5}}>{cnt}건 편성</span>
              </button>
            );
          })}
        </div>

        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, fontSize:12, color:'var(--muted)'}}>
          <div>
            <span className="mono tabular" style={{color:'var(--ink)', fontWeight:600}}>{filledCount}</span> / {slots.length} 슬롯 편성 ·
            본인 편성 <span className="mono tabular">{editableCount}건</span> · 운영사 편성 <span className="mono tabular">{filledCount - editableCount}건</span>
          </div>
          <div className="mono" style={{fontSize:10.5, letterSpacing:'0.15em'}}>
            {config.timeStart} – {config.timeEnd} · {config.slotMinutes}분 슬롯
          </div>
        </div>

        {/* 시간 슬롯 테이블 */}
        <div className="card" style={{overflow:'hidden'}}>
          <div className="scroll-x">
            <table className="mice-table">
              <thead>
                <tr>
                  <th style={{width:80}}>시간</th>
                  <th>미팅</th>
                </tr>
              </thead>
              <tbody>
                {slots.map(time => {
                  const ms = meetingsAt(time);
                  return (
                    <tr key={time}>
                      <td className="mono tabular" style={{fontSize:12.5, fontWeight:500, color: ms.length > 0 ? 'var(--ink)' : 'var(--muted)', verticalAlign:'top', paddingTop:12}}>
                        {time}
                      </td>
                      <td style={{padding:6}}>
                        <div style={{display:'flex', flexDirection:'column', gap:6}}>
                          {ms.map(m => {
                            const b = getBuyer(m.buyerId);
                            const editable = canEdit(m);
                            const col = projectColor(me.project);
                            return (
                              <div key={m.id} onClick={()=>openEdit(m)}
                                style={{
                                  cursor:'pointer', padding:'10px 14px', borderRadius:'var(--radius-sm)',
                                  background: editable ? col.bg : 'var(--ivory-2)',
                                  color: editable ? col.fg : 'var(--ink)',
                                  border: editable ? `1px solid ${col.bg}` : '1px solid var(--line)',
                                  display:'flex', alignItems:'center', gap:12,
                                  transition:'all .15s',
                                }}
                                title={editable ? '본인 편성 미팅 · 클릭하여 편집/삭제' : '운영사 편성 미팅 · 클릭하여 조회'}>
                                {editable ? (
                                  <span style={{display:'inline-flex', alignItems:'center', gap:4, padding:'3px 9px', fontSize:10.5, fontWeight:600, background:'rgba(255,255,255,0.22)', color: col.fg, borderRadius:999, flexShrink:0}}>
                                    본인 편성
                                  </span>
                                ) : (
                                  <span style={{display:'inline-flex', alignItems:'center', gap:4, padding:'3px 9px', fontSize:10.5, fontWeight:600, background:'var(--paper)', color:'var(--muted)', border:'1px solid var(--line)', borderRadius:999, flexShrink:0}}>
                                    <Lock size={9}/>운영사
                                  </span>
                                )}
                                <span style={{fontSize:13.5, fontWeight:600, flex:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>
                                  {b?.companyName || '—'}
                                </span>
                                <span style={{flexShrink:0, opacity:0.85}}>
                                  {editable ? <Edit3 size={13}/> : <Eye size={13}/>}
                                </span>
                              </div>
                            );
                          })}
                          {/* 항상 표시되는 미팅 추가 버튼 — 관리자 편성과 중복 가능 */}
                          <button onClick={()=>openCreate(time)}
                            style={{
                              width:'100%', padding:'9px 14px',
                              background:'transparent',
                              border:'1px dashed var(--line-2)',
                              borderRadius:'var(--radius-sm)',
                              color:'var(--muted-2)',
                              fontFamily:'inherit', fontSize:11.5,
                              cursor:'pointer',
                              display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                              transition:'all .15s',
                            }}
                            onMouseEnter={e=>{e.currentTarget.style.borderColor = projectColor(project).bg; e.currentTarget.style.color = projectColor(project).bg;}}
                            onMouseLeave={e=>{e.currentTarget.style.borderColor = 'var(--line-2)'; e.currentTarget.style.color = 'var(--muted-2)';}}
                            title={ms.length > 0 ? '이 슬롯에 추가 미팅 편성 (중복 허용)' : '이 슬롯에 미팅 추가'}>
                            <Plus size={11}/>
                            <span>{ms.length > 0 ? '추가 미팅 편성' : '미팅 추가'}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </>
      )}

      {/* 미팅 추가/수정 모달 */}
      {slotAction && (
        <Modal title={
          slotAction.type === 'create' ? `미팅 추가 · ${selectedDate} ${slotAction.time}` :
          slotAction.type === 'view'   ? `미팅 상세 · ${selectedDate} ${slotAction.time}` :
                                          `미팅 수정 · ${selectedDate} ${slotAction.time}`
        } onClose={closeAction}>

          <div style={{padding:'10px 14px', background:'var(--ivory-2)', fontSize:11.5, color:'var(--muted)', marginBottom:18, lineHeight:1.6, borderRadius:'var(--radius-sm)'}}>
            {slotAction.type === 'create' && '미팅할 바이어 정보(회사명·바이어명·직급·이메일·연락처)를 직접 입력하세요. 저장 시 바이어 DB에 자동 등록됩니다.'}
            {slotAction.type === 'edit'   && '본인이 편성한 미팅입니다. 편집 내용은 바이어 DB에도 동시에 반영됩니다.'}
            {slotAction.type === 'view'   && '운영사가 편성한 미팅입니다. 조회만 가능하며 변경 문의는 운영 사무국에 연락해주세요.'}
          </div>

          <div style={{padding:'16px 18px', background:'var(--ivory-2)', borderRadius:'var(--radius-sm)'}}>
            <div className="mono" style={{fontSize:10, letterSpacing:'0.15em', color:'var(--muted)', marginBottom:12}}>BUYER INFO · 수동 입력</div>
            <div className="grid" style={{gridTemplateColumns:'1fr 1fr', gap:12}}>
              <div style={{gridColumn:'1 / -1'}}>
                <label className="label">회사명 <span style={{color:'var(--red)'}}>*</span></label>
                <input className="input" value={slotAction.form.companyName}
                       readOnly={slotAction.type === 'view'}
                       onChange={e=>setSlotAction({...slotAction, form:{...slotAction.form, companyName:e.target.value}})}
                       placeholder="예: Netflix Japan, BBC Studios"
                       style={{background:'var(--paper)'}}
                       autoFocus={slotAction.type === 'create'}/>
              </div>
              <div>
                <label className="label">바이어명 (담당자)</label>
                <input className="input" value={slotAction.form.contactName}
                       readOnly={slotAction.type === 'view'}
                       onChange={e=>setSlotAction({...slotAction, form:{...slotAction.form, contactName:e.target.value}})}
                       placeholder="예: John Doe"
                       style={{background:'var(--paper)'}}/>
              </div>
              <div>
                <label className="label">직급</label>
                <input className="input" value={slotAction.form.position}
                       readOnly={slotAction.type === 'view'}
                       onChange={e=>setSlotAction({...slotAction, form:{...slotAction.form, position:e.target.value}})}
                       placeholder="예: Head of Content"
                       style={{background:'var(--paper)'}}/>
              </div>
              <div>
                <label className="label">이메일</label>
                <input className="input" type="email" value={slotAction.form.email}
                       readOnly={slotAction.type === 'view'}
                       onChange={e=>setSlotAction({...slotAction, form:{...slotAction.form, email:e.target.value}})}
                       placeholder="john@example.com"
                       style={{background:'var(--paper)'}}/>
              </div>
              <div>
                <label className="label">연락처</label>
                <input className="input" value={slotAction.form.phone}
                       readOnly={slotAction.type === 'view'}
                       onChange={e=>setSlotAction({...slotAction, form:{...slotAction.form, phone:e.target.value}})}
                       placeholder="+1-310-555-0100"
                       style={{background:'var(--paper)'}}/>
              </div>
            </div>
          </div>

          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:24, gap:8}}>
            <div>
              {slotAction.type === 'edit' && (
                <button className="btn btn-danger" onClick={deleteMeeting} style={{fontSize:12}}>
                  <Trash2 size={12}/>미팅 삭제
                </button>
              )}
            </div>
            <div style={{display:'flex', gap:8}}>
              <button className="btn btn-ghost" onClick={closeAction}>{slotAction.type === 'view' ? '닫기' : '취소'}</button>
              {slotAction.type !== 'view' && (
                <button className="btn btn-primary"
                        disabled={!(slotAction.form.companyName || '').trim()}
                        onClick={slotAction.type==='create' ? saveCreate : saveEdit}>
                  <Save size={14}/>{slotAction.type==='create' ? '미팅 추가' : '저장'}
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function MeetingStatus({status}){
  const m = {
    confirmed: {dot:'dot-green', label:'확정'},
    tentative: {dot:'dot-gold',  label:'조율중'},
    cancelled: {dot:'dot-red',   label:'취소'},
  }[status] || {dot:'dot-muted', label:'미정'};
  return <span style={{display:'inline-flex', alignItems:'center', gap:6, fontSize:12.5}}><span className={`dot ${m.dot}`}/>{m.label}</span>;
}

function SectionHeader({eyebrow, title, desc}){
  return (
    <div style={{marginBottom:8}}>
      {/* Eyebrow — 작고 은은하게 (보조 정보) */}
      <div className="mono" style={{
        fontSize:10.5,
        letterSpacing:'0.22em',
        color:'var(--muted)',
        fontWeight:600,
        display:'inline-flex',
        alignItems:'center',
        gap:8,
        marginBottom:12,
      }}>
        <span style={{width:14, height:2, background:'var(--grad-cta)', borderRadius:2}}/>
        {eyebrow}
      </div>

      {/* Title — 굵고 진한 본 제목 */}
      <h2 className="serif" style={{
        fontSize:'clamp(20px, 3vw, 32px)',
        fontWeight:700,
        margin:0,
        letterSpacing:'-0.025em',
        color:'var(--ink)',
        lineHeight:1.2,
        wordBreak:'keep-all',
      }}>
        {title}
      </h2>

      {/* Desc — 중간 강도로 */}
      {desc && (
        <p data-section-desc style={{
          color:'var(--ink-2)',
          fontSize:'13.5px',
          lineHeight:1.7,
          maxWidth:720,
          marginTop:14,
          marginBottom:0,
          fontWeight:400,
          wordBreak:'keep-all',
          overflowWrap:'break-word',
        }}>
          {desc}
        </p>
      )}
    </div>
  );
}

function ArrayField({label, placeholder, items, onChange}){
  const [input, setInput] = useState('');
  const add = () => {
    if (!input.trim()) return;
    onChange([...items, input.trim()]);
    setInput('');
  };
  const remove = (i) => onChange(items.filter((_,j) => j !== i));
  return (
    <div className="card" style={{padding:22}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:14}}>
        <div>
          <label className="label">{label}</label>
          <div className="mono" style={{fontSize:10, color:'var(--muted)'}}>{items.length} ITEMS</div>
        </div>
      </div>
      <div style={{display:'flex', gap:8, marginBottom:14}}>
        <input className="input" placeholder={placeholder} value={input}
               onChange={e=>setInput(e.target.value)}
               onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault(); add();}}}/>
        <button className="btn btn-gold" onClick={add}><Plus size={14}/></button>
      </div>
      <div style={{display:'flex', gap:6, flexWrap:'wrap', minHeight:32}}>
        {items.map((v,i)=>(
          <span key={i} className="chip chip-removable" onClick={()=>remove(i)}>
            {v} <X size={11}/>
          </span>
        ))}
        {items.length===0 && <span style={{fontSize:12, color:'var(--muted)'}}>항목을 추가하세요.</span>}
      </div>
    </div>
  );
}

// ============================ ADMIN CONSOLE ============================
function AdminConsole({ state, update, viewerMode, onLogout }) {
  // KOCCA 뷰어는 4개 탭만 허용: 참가사 정보 · 비즈니스 상담 스케줄 · RSVP · 매칭 매트릭스
  const isKoccaViewer = viewerMode === 'kocca';
  const readOnly = isKoccaViewer;  // 읽기 전용 모드 플래그

  // KOCCA 뷰어는 exhibitors 탭부터 시작 (overview 없음)
  const [tab, setTab] = useState(isKoccaViewer ? 'exhibitors' : 'overview');
  const [project, setProject] = useState('ALL');

  // 프로젝트 필터링된 state — 모든 하위 탭이 이 필터 기준으로 동작
  const fstate = useMemo(() => {
    if (project === 'ALL') return state;
    const exhIds = new Set(state.exhibitors.filter(e => e.project === project).map(e => e.id));
    return {
      ...state,
      exhibitors: state.exhibitors.filter(e => e.project === project),
      buyers: state.buyers.filter(b => !b.project || b.project === project),
      meetings: state.meetings.filter(m => exhIds.has(m.exhibitorId)),
      invitationLog: state.invitationLog.filter(log => {
        const buyer = state.buyers.find(b => b.id === log.buyerId);
        return !buyer?.project || buyer.project === project;
      }),
    };
  }, [state, project]);

  // 탭 정의 — KOCCA에게 허용된 탭만 표시
  const ALL_TABS = [
    {k:'overview',  l:'현황 대시보드', i:<BarChart3 size={15}/>, koccaAllowed:false},
    {k:'buyers',    l:'바이어 DB',    i:<Users size={15}/>, badge:fstate.buyers.length, koccaAllowed:false},
    {k:'exhibitors',l:'참가사 관리',   i:<Briefcase size={15}/>, badge:fstate.exhibitors.length, koccaAllowed:true},
    {k:'rsvp',      l:'RSVP',        i:<ClipboardCheck size={15}/>, badge: fstate.buyers.filter(b=>b.invitationStatus==='accepted').length, koccaAllowed:true},
    {k:'schedule',  l:'비즈니스 상담 스케줄', i:<Calendar size={15}/>, badge:fstate.meetings.length, koccaAllowed:true},
    {k:'matrix',    l:'바이어 매칭 매트릭스', i:<Target size={15}/>, koccaAllowed:true},
  ];
  const TABS = isKoccaViewer ? ALL_TABS.filter(t => t.koccaAllowed) : ALL_TABS;

  // 허용되지 않은 탭에 머물러 있을 경우 첫 허용 탭으로 (방어)
  if (isKoccaViewer && !TABS.find(t => t.k === tab)) {
    setTimeout(() => setTab('exhibitors'), 0);
  }

  return (
    <div>
      <PortalHeader
        role={isKoccaViewer ? 'KOCCA VIEWER · READ-ONLY' : 'ADMINISTRATOR CONSOLE'}
        name="K-Animation Global Showcase"
        sub={isKoccaViewer ? 'Read-Only Observation Portal' : 'Global B2B Matching · Admin Control'}
        onLogout={onLogout}
      />

      {/* KOCCA 뷰어 알림 배너 */}
      {isKoccaViewer && (
        <div style={{
          padding:'10px 40px',
          background:'linear-gradient(90deg, rgba(139,92,246,0.1), rgba(232,121,249,0.1))',
          borderBottom:'1px solid rgba(139,92,246,0.25)',
          fontSize:12, color:'var(--ink-2)',
          display:'flex', alignItems:'center', gap:10,
          fontWeight:500,
        }}>
          <Eye size={14} style={{color:'var(--purple-dk)'}}/>
          <span>
            <strong style={{color:'var(--purple-dk)'}}>KOCCA 뷰어 모드</strong>
            {' · '}참가사 정보, 비즈니스 상담 스케줄, RSVP 응답, 매칭 매트릭스를 <strong>열람 전용</strong>으로 접근하고 있습니다. 편집 · 추가 · 삭제 · 다운로드 기능은 제한됩니다.
          </span>
        </div>
      )}

      <ProjectSwitcher state={state} project={project} setProject={setProject}/>

      <nav style={{background:'linear-gradient(180deg, #1E1B4B 0%, #312E81 100%)', borderBottom:'1px solid rgba(139,92,246,0.3)'}}>
        <div style={{maxWidth:1360, margin:'0 auto', padding:'0 40px', display:'flex', gap:4, overflowX:'auto', WebkitOverflowScrolling:'touch'}}>
          {TABS.map(t => (
            <button key={t.k} onClick={()=>setTab(t.k)}
              style={{
                padding:'16px 22px', background:'transparent', border:'none', cursor:'pointer',
                color: tab===t.k ? '#fff' : 'rgba(255,255,255,0.75)',
                fontFamily:'inherit', fontSize:13.5, fontWeight: tab===t.k ? 600 : 500, letterSpacing:'-0.005em',
                borderBottom: tab===t.k ? '2px solid #E879F9' : '2px solid transparent',
                display:'flex', alignItems:'center', gap:8, transition:'all .15s',
                whiteSpace:'nowrap', flexShrink:0,
                textShadow: tab===t.k ? '0 0 12px rgba(232,121,249,0.5)' : 'none',
              }}
              onMouseEnter={e => { if (tab!==t.k) e.currentTarget.style.color = 'rgba(255,255,255,0.95)'; }}
              onMouseLeave={e => { if (tab!==t.k) e.currentTarget.style.color = 'rgba(255,255,255,0.75)'; }}
            >
              {t.i}{t.l}
              {t.badge !== undefined && (
                <span className="mono" style={{fontSize:10, padding:'2px 7px', background:'var(--grad-cta)', color:'#fff', borderRadius:999, fontWeight:700, boxShadow:'0 0 10px rgba(232,121,249,0.4)'}}>{t.badge}</span>
              )}
            </button>
          ))}
        </div>
      </nav>

      <main style={{maxWidth:1360, margin:'0 auto', padding:'40px'}}>
        {tab === 'overview'   && <OverviewTab state={fstate} project={project}/>}
        {tab === 'buyers'     && <BuyersTab state={fstate} fullState={state} update={update} project={project} readOnly={readOnly}/>}
        {tab === 'exhibitors' && <ExhibitorsTab state={fstate} readOnly={readOnly}/>}
        {tab === 'rsvp'       && <RsvpTab state={fstate} fullState={state} update={update} project={project} readOnly={readOnly}/>}
        {tab === 'schedule'   && <AdminScheduleTab state={fstate} fullState={state} update={update} project={project} readOnly={readOnly}/>}
        {tab === 'matrix'     && <MatchMatrixTab state={fstate} fullState={state} project={project}/>}
      </main>
    </div>
  );
}

function ProjectSwitcher({state, project, setProject}){
  const projects = ['ALL','MIFA','MIPCOM','CANADA'];
  const count = p => p === 'ALL' ? state.exhibitors.length : state.exhibitors.filter(e => e.project === p).length;
  return (
    <div style={{background:'var(--navy-2)', borderBottom:'1px solid rgba(255,255,255,0.06)', padding:'12px 40px'}}>
      <div style={{maxWidth:1360, margin:'0 auto', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap'}}>
        <span className="mono" style={{fontSize:10, color:'rgba(255,255,255,0.45)', letterSpacing:'0.15em'}}>PROJECT</span>
        {projects.map(p => {
          const active = project === p;
          const c = count(p);
          const col = p === 'ALL' ? { bg: 'var(--ivory)', fg: 'var(--ink)' } : projectColor(p);
          return (
            <button key={p} onClick={()=>setProject(p)}
              style={{
                padding:'5px 14px', borderRadius:999, cursor:'pointer',
                border: active ? `1px solid ${col.bg}` : '1px solid rgba(255,255,255,0.15)',
                background: active ? col.bg : 'transparent',
                color: active ? col.fg : 'rgba(255,255,255,0.8)',
                fontSize:12, fontWeight:600, fontFamily:'inherit',
                display:'inline-flex', alignItems:'center', gap:7,
                letterSpacing:'-0.005em', transition:'all .15s',
              }}>
              {p}
              <span className="mono tabular" style={{fontSize:10.5, opacity: active ? 0.75 : 0.6, padding:'1px 6px', background: active ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.08)', borderRadius:4}}>{c}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------- OVERVIEW ----------------
function OverviewTab({state, project}){
  const totals = {
    exhibitors: state.exhibitors.length,
    buyers: state.buyers.length,
    accepted: state.buyers.filter(b=>b.invitationStatus==='accepted').length,
    pending:  state.buyers.filter(b=>b.invitationStatus==='pending').length,
    meetings: state.meetings.length,
  };
  const responseRate = state.buyers.length ? Math.round((totals.accepted / state.buyers.length)*100) : 0;

  // matching heat
  const allMatches = [];
  state.exhibitors.forEach(ex => {
    state.buyers.forEach(b => {
      const {score} = matchScore(ex, b);
      allMatches.push(score);
    });
  });
  const strong   = allMatches.filter(s=>s>=75).length;
  const moderate = allMatches.filter(s=>s>=50 && s<75).length;
  const weak     = allMatches.filter(s=>s<50).length;
  const total    = allMatches.length || 1;

  return (
    <div className="fade-in">
      <SectionHeader eyebrow={`MASTER CONTROL${project && project!=='ALL' ? ' · '+project : ''}`} title="현황 대시보드"
        desc={project==='ALL' ? '전체 프로젝트 통합 운영 지표. 실시간 집계 · 자동 갱신.' : `${project} 프로젝트 운영 지표. 상단 프로젝트 스위처로 전환할 수 있습니다.`}/>

      <div className="grid stagger kpi-grid-5" style={{gridTemplateColumns:'repeat(5,1fr)', gap:12, marginTop:24}}>
        <KPI label="PARTICIPANTS" value={totals.exhibitors}/>
        <KPI label="BUYERS"     value={totals.buyers}/>
        <KPI label="ACCEPTED"   value={totals.accepted} accent/>
        <KPI label="PENDING"    value={totals.pending}/>
        <KPI label="MEETINGS"   value={totals.meetings} accent/>
      </div>

      <div className="grid kpi-grid-2" style={{gridTemplateColumns:'1.2fr 1fr', gap:16, marginTop:24}}>
        <div className="card" style={{padding:28}}>
          <div className="mono" style={{fontSize:10, letterSpacing:'0.2em', color:'var(--muted)'}}>SECTION A</div>
          <div className="serif" style={{fontSize:22, fontWeight:500, marginTop:4, marginBottom:18}}>초청 회신율</div>
          <div style={{display:'flex', alignItems:'baseline', gap:12}}>
            <div className="serif tabular" style={{fontSize:72, fontWeight:600, color:'var(--navy)', lineHeight:1}}>{responseRate}</div>
            <div className="serif" style={{fontSize:28, color:'var(--gold)'}}>%</div>
            <div style={{marginLeft:'auto', fontSize:12, color:'var(--muted)', textAlign:'right'}}>
              수락 {totals.accepted} / 총 {totals.buyers}
            </div>
          </div>
          <div style={{height:6, background:'var(--ivory-2)', marginTop:20, position:'relative', overflow:'hidden'}}>
            <div style={{height:'100%', width:`${responseRate}%`, background:'linear-gradient(90deg, var(--gold), var(--gold-dk))'}}/>
          </div>
          <div style={{display:'flex', justifyContent:'space-between', marginTop:10, fontSize:11, color:'var(--muted)'}} className="mono">
            <span>0%</span><span>TARGET 65%</span><span>100%</span>
          </div>
        </div>

        <div className="card" style={{padding:28}}>
          <div className="mono" style={{fontSize:10, letterSpacing:'0.2em', color:'var(--muted)'}}>SECTION B</div>
          <div className="serif" style={{fontSize:22, fontWeight:500, marginTop:4, marginBottom:18}}>매칭 품질 분포</div>
          {[
            {l:'Strong ≥75',   v:strong,   c:'#1F4D3D'},
            {l:'Moderate 50+', v:moderate, c:'#8A6B1F'},
            {l:'Weak <50',     v:weak,     c:'#7A2E2E'},
          ].map((r,i)=>(
            <div key={i} style={{marginBottom:14}}>
              <div style={{display:'flex', justifyContent:'space-between', fontSize:12.5, marginBottom:6}}>
                <span>{r.l}</span>
                <span className="mono tabular"><b>{r.v}</b> <span style={{color:'var(--muted)'}}>· {Math.round(r.v/total*100)}%</span></span>
              </div>
              <div style={{height:4, background:'var(--ivory-2)'}}>
                <div style={{height:'100%', width:`${r.v/total*100}%`, background:r.c}}/>
              </div>
            </div>
          ))}
          <div style={{marginTop:16, padding:12, background:'var(--ivory-2)', fontSize:11.5, color:'var(--muted)', lineHeight:1.6}}>
            전체 {total}개 ({state.exhibitors.length}×{state.buyers.length}) 매칭 쌍 기준.
            Strong 비중은 온사이트 미팅 컨버전의 선행 지표입니다.
          </div>
        </div>
      </div>
    </div>
  );
}

function KPI({label, value, accent}){
  return (
    <div className="card" style={{padding:22, background: accent?'var(--navy)':'var(--paper)', color:accent?'var(--ivory)':'inherit', borderColor: accent?'var(--navy)':'var(--line)'}}>
      <div className="mono" style={{fontSize:10, letterSpacing:'0.2em', color: accent?'var(--gold)':'var(--muted)'}}>{label}</div>
      <div className="serif tabular" style={{fontSize:42, fontWeight:500, lineHeight:1.1, marginTop:8}}>{value}</div>
    </div>
  );
}

// ---------------- BUYERS DB ----------------
const BUYER_COLUMNS = [
  {key:'country',          label:'국가',           width:70},
  {key:'grade',            label:'구분',           width:90},
  {key:'category',         label:'카테고리',       width:220},
  {key:'companyName',      label:'회사명',         width:200},
  {key:'contactName',      label:'담당자',         width:120},
  {key:'position',         label:'직급',           width:160},
  {key:'email',            label:'이메일',         width:200},
  {key:'phone',            label:'연락처',         width:140},
  {key:'companySize',      label:'규모',           width:80},
  {key:'interestedProducts', label:'관심 품목',    width:200},
  {key:'invitationStatus', label:'초청 상태',      width:100},
];

// 구분 (Grade) — 바이어의 우선순위/전략적 중요도
// 값별로 구분되는 컬러 배지로 표시됨
const BUYER_GRADES = [
  { value: 'VIP',     label: 'VIP',     color: '#DC2626', bg: '#FEE2E2' },   // 빨강 - 최우선 전략 타겟
  { value: 'KEY',     label: 'Key',     color: '#EA580C', bg: '#FED7AA' },   // 주황 - 핵심 바이어
  { value: 'ACTIVE',  label: 'Active',  color: '#059669', bg: '#D1FAE5' },   // 녹색 - 활성 거래 중
  { value: 'POTENTIAL', label: 'Potential', color: '#2563EB', bg: '#DBEAFE' }, // 파랑 - 잠재 바이어
  { value: 'WATCH',   label: 'Watch',   color: '#7C3AED', bg: '#EDE9FE' },   // 보라 - 관망
  { value: 'COLD',    label: 'Cold',    color: '#64748B', bg: '#F1F5F9' },   // 회색 - 비활성
];
const getGradeInfo = (grade) => BUYER_GRADES.find(g => g.value === grade);

// 편집 모달에서 추가로 표시되는 라벨 (테이블에는 노출되지 않음)
const BUYER_FIELD_LABELS = {};

function BuyersTab({state, fullState, update, project, readOnly}){
  const fileRef = useRef(null);
  const [uploadReport, setUploadReport] = useState(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(null); // null = 전체
  const [editId, setEditId] = useState(null);
  const [detailBuyer, setDetailBuyer] = useState(null); // 상세 조회 모달용
  const [form, setForm] = useState(null);
  const [confirmData, setConfirmData] = useState(null); // {title, message, onConfirm}

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, {type:'array'});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, {defval:''});

      const headerMap = {
        'id':'id','ID':'id','아이디':'id',
        '프로젝트':'project','Project':'project','project':'project','PROJECT':'project',
        '회사명':'companyName','company':'companyName','Company':'companyName','CompanyName':'companyName',
        '담당자':'contactName','Contact':'contactName','contactName':'contactName','담당자명':'contactName','바이어명':'contactName','이름':'contactName','Name':'contactName',
        '직급':'position','직책':'position','Position':'position','position':'position','Title':'position','title':'position','Role':'position',
        '이메일':'email','Email':'email','email':'email','E-mail':'email',
        '연락처':'phone','전화':'phone','전화번호':'phone','Phone':'phone','phone':'phone','Tel':'phone','Mobile':'phone','휴대폰':'phone',
        '국가':'country','Country':'country','country':'country',
        // 단일 카테고리 컬럼 (레거시 호환 — 쉼표/세미콜론 분리 처리)
        '카테고리':'category','Category':'category','category':'category','CATEGORY':'category','바이어카테고리':'category','Buyer Category':'category',
        '분야':'category','업종':'category','취급품목':'category','제품':'category','분야/업종':'category','Field':'category','field':'category','Industry':'category','industry':'category','Products':'category','products':'category',
        '규모':'companySize','기업규모':'companySize','companySize':'companySize','Size':'companySize',
        '관심품목':'interestedProducts','관심':'interestedProducts','interestedProducts':'interestedProducts','Interested':'interestedProducts',
        // 매칭용 관심 필드 (다중값, 쉼표/세미콜론 분리)
        '관심장르':'interestedGenres','관심 장르':'interestedGenres','Interested Genres':'interestedGenres','interestedGenres':'interestedGenres','Genres':'interestedGenres','genres':'interestedGenres','장르':'interestedGenres',
        '관심포맷':'interestedFormats','관심 포맷':'interestedFormats','Interested Formats':'interestedFormats','interestedFormats':'interestedFormats','Formats':'interestedFormats','formats':'interestedFormats','포맷':'interestedFormats',
        '관심연령':'interestedTargetAges','관심 연령':'interestedTargetAges','관심 타겟 연령':'interestedTargetAges','관심타겟연령':'interestedTargetAges','Interested Target Ages':'interestedTargetAges','interestedTargetAges':'interestedTargetAges','Target Ages':'interestedTargetAges','targetAges':'interestedTargetAges','타겟연령':'interestedTargetAges','타겟 연령':'interestedTargetAges',
        '관심권역':'interestedRegions','관심 권역':'interestedRegions','선호권역':'interestedRegions','선호 권역':'interestedRegions','Interested Regions':'interestedRegions','interestedRegions':'interestedRegions','Regions':'interestedRegions','regions':'interestedRegions','권역':'interestedRegions',
        '주요 사업 요약':'businessSummary','주요사업요약':'businessSummary','사업요약':'businessSummary','Business Summary':'businessSummary','Summary':'businessSummary',
        '상태':'invitationStatus','초청상태':'invitationStatus','invitationStatus':'invitationStatus',
        // 피칭쇼케이스 참석여부 (참가사가 별도로 진행하는 IP 피칭 행사)
        '피칭쇼케이스':'pitchingShowcase','피칭 쇼케이스':'pitchingShowcase','피칭쇼케이스 참석':'pitchingShowcase','피칭쇼케이스 참석여부':'pitchingShowcase','피칭':'pitchingShowcase','Pitching Showcase':'pitchingShowcase','pitchingShowcase':'pitchingShowcase','Pitching':'pitchingShowcase','쇼케이스':'pitchingShowcase','Showcase':'pitchingShowcase',
      };

      // 카테고리 컬럼 감지 매핑 — 헤더 정규화(공백·줄바꿈·특수문자 제거 + 소문자) 후 BUYER_CATEGORIES로 변환
      const CAT_HEADER_MAP = {
        'broadcaster':                      'Broadcaster (방송사)',
        'broadcaster방송사':                  'Broadcaster (방송사)',
        'streamingott':                     'Streaming / OTT 플랫폼',
        'streamingottott플랫폼':              'Streaming / OTT 플랫폼',
        'streamingott플랫폼':                 'Streaming / OTT 플랫폼',
        'ott':                              'Streaming / OTT 플랫폼',
        'ott플랫폼':                         'Streaming / OTT 플랫폼',
        'distributor':                      'Distributor (배급사)',
        'distributor배급사':                  'Distributor (배급사)',
        'production':                       'Production (제작사)',
        'production제작사':                   'Production (제작사)',
        '제작사':                            'Production (제작사)',
        'coproduction':                     'Co-Production Partner (공동제작)',
        'coproduction공동제작':                'Co-Production Partner (공동제작)',
        'coproductionpartner':               'Co-Production Partner (공동제작)',
        'coproductionpartner공동제작':          'Co-Production Partner (공동제작)',
        '공동제작':                          'Co-Production Partner (공동제작)',
        'investor':                         'Investor (투자사)',
        'investor투자사':                     'Investor (투자사)',
        'publisher':                        'Publisher (퍼블리셔)',
        'publisher퍼블리셔':                   'Publisher (퍼블리셔)',
        'globalsalesagent':                  'Global Sales Agent (세일즈 에이전트)',
        'globalsalesagent세일즈에이전트':         'Global Sales Agent (세일즈 에이전트)',
        'licensee':                         'Licensee (MD · 출판 · 상품화)',
        'licenseemd출판상품화':                'Licensee (MD · 출판 · 상품화)',
        'licenseemd·출판·상품화':              'Licensee (MD · 출판 · 상품화)',
        'localization':                     'Localization (로컬라이제이션 · 더빙)',
        'localization로컬라이제이션더빙':         'Localization (로컬라이제이션 · 더빙)',
        'merchandising':                    'Merchandising Partner (머천다이징)',
        'merchandising머천다이징':             'Merchandising Partner (머천다이징)',
        'merchandisingpartner':              'Merchandising Partner (머천다이징)',
        '기타':                              '기타 (Others)',
        '기타others':                         '기타 (Others)',
        'others':                           '기타 (Others)',
      };
      const normalizeCatHeader = (h) => String(h).replace(/[\s\n\t·\-\/\(\)]/g, '').toLowerCase();

      const parsed = rows.map((r,idx) => {
        const o = {};
        // 1차: 기본 필드 매핑 + 카테고리 O 감지
        const oCats = [];
        Object.entries(r).forEach(([k,v]) => {
          // (a) 카테고리 컬럼 O 감지
          const catNorm = normalizeCatHeader(k);
          const catName = CAT_HEADER_MAP[catNorm];
          if (catName) {
            const val = String(v || '').trim().toUpperCase();
            if (val === 'O' || val === '○' || val === '◯') {
              if (!oCats.includes(catName)) oCats.push(catName);
            }
            return; // 카테고리 컬럼은 해당 로직에서만 처리 (다른 필드로 중복 매핑 방지)
          }
          // (b) 일반 필드 매핑
          const mapped = headerMap[k.trim()] || k;
          o[mapped] = typeof v === 'string' ? v.trim() : v;
        });

        // 2차: 카테고리 통합 (O 감지 결과 + 단일 카테고리 컬럼 + 회사명 기반 추정)
        if (o.companyName) {
          const merged = [...oCats];
          // 단일 "카테고리" 컬럼에 값이 있으면 쉼표/세미콜론 분리 후 병합
          if (o.category) {
            String(o.category)
              .split(/[,;]/)
              .map(s => s.trim())
              .filter(Boolean)
              .forEach(c => { if (!merged.includes(c)) merged.push(c); });
          }
          // 회사명 기반 추정 (O 표기나 카테고리 컬럼이 없을 때만 보조적으로 사용)
          if (merged.length === 0) {
            const guessed = guessBuyerCategories(o.companyName);
            for (const g of guessed) {
              if (!merged.includes(g)) merged.push(g);
            }
          }
          o.categories = merged;
          delete o.category;
          if (!o.companySize) {
            const size = guessBuyerSize(o.companyName);
            if (size) o.companySize = size;
          }
        } else {
          o.categories = oCats;
        }

        // 3차: 주요 사업 요약을 interestedProducts에 병합 (관심품목이 비어있을 때만 대체, 있으면 덧붙이기)
        if (o.businessSummary) {
          if (!o.interestedProducts) {
            o.interestedProducts = o.businessSummary;
          } else if (!String(o.interestedProducts).includes(o.businessSummary)) {
            o.interestedProducts = `${o.interestedProducts} · ${o.businessSummary}`;
          }
        }
        delete o.businessSummary;
        delete o.field; // 레거시 제거

        // 관심 장르/포맷/타겟연령 — 쉼표·세미콜론·슬래시 분리로 배열화
        const splitInterestField = (val, options) => {
          if (!val) return [];
          if (Array.isArray(val)) return val.filter(Boolean);
          const tokens = String(val)
            .split(/[,;|\n]+/)
            .map(t => t.trim())
            .filter(Boolean);
          // 원본 옵션에 포함된 경우만 유효 값으로 (정확히 일치 또는 부분 일치 허용)
          const valid = [];
          for (const t of tokens) {
            // 정확 일치 우선
            const exact = options.find(o => o === t);
            if (exact) { if (!valid.includes(exact)) valid.push(exact); continue; }
            // 대소문자 무시 부분 일치
            const partial = options.find(o => o.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(o.toLowerCase().split(' ')[0]));
            if (partial && !valid.includes(partial)) valid.push(partial);
          }
          return valid;
        };
        o.interestedGenres      = splitInterestField(o.interestedGenres,      GENRE_OPTIONS);
        o.interestedFormats     = splitInterestField(o.interestedFormats,     FORMAT_OPTIONS);
        o.interestedTargetAges  = splitInterestField(o.interestedTargetAges,  TARGET_AGE_OPTIONS);

        // 관심 권역 — 문자열을 REGIONS key로 매핑
        const parseRegions = (val) => {
          if (!val) return [];
          if (Array.isArray(val)) return val.filter(v => REGIONS.find(r => r.key === v));
          const tokens = String(val).split(/[,;|\n]+/).map(t => t.trim()).filter(Boolean);
          const result = [];
          for (const t of tokens) {
            const lower = t.toLowerCase();
            // key 직접 매칭
            const byKey = REGIONS.find(r => r.key.toLowerCase() === lower);
            if (byKey) { if (!result.includes(byKey.key)) result.push(byKey.key); continue; }
            // label 매칭 (부분일치)
            const byLabel = REGIONS.find(r => r.label.toLowerCase().includes(lower) || lower.includes(r.label.toLowerCase().split(' ')[0]));
            if (byLabel) { if (!result.includes(byLabel.key)) result.push(byLabel.key); continue; }
            // 특수: 'global', 'worldwide', '글로벌' → WW
            if (['global', 'worldwide', 'world wide', 'ww', '글로벌', '전세계'].includes(lower)) {
              if (!result.includes('WW')) result.push('WW');
            }
          }
          return result;
        };
        o.interestedRegions = parseRegions(o.interestedRegions);
        // 프로젝트 정규화 (대소문자/별칭 인식)
        if (o.project) {
          const pv = String(o.project).trim().toUpperCase();
          if (pv.includes('MIFA')) o.project = 'MIFA';
          else if (pv.includes('MIPCOM') || pv.includes('MIP COM')) o.project = 'MIPCOM';
          else if (pv.includes('CANADA') || pv.includes('CDN') || pv.includes('TIFFCOM')) o.project = 'CANADA';
          else o.project = ''; // 인식 불가 → 자동 할당으로 fallback
        }
        // 프로젝트 자동 할당 (CSV에 명시 안 됐거나 인식 불가)
        if (!o.project && project && project !== 'ALL') o.project = project;
        if (!o.id) {
          const prefix = o.project ? `BU-${o.project}` : 'BU';
          const base = fullState.buyers.length;
          o.id = `${prefix}-${String(base + idx + 1).padStart(4,'0')}`;
        }
        if (!o.invitationStatus) o.invitationStatus = null;
        if (!o.preferredDates) o.preferredDates = [];

        // 피칭쇼케이스 값 정규화 — 다양한 표현을 표준 3가지로 통합
        if (o.pitchingShowcase) {
          const v = String(o.pitchingShowcase).trim().toLowerCase();
          if (['참석','참가','o','y','yes','attend','attending','o','참석함','o표시','참석합니다','참여','참여함'].some(k => v === k || v.includes(k))) {
            o.pitchingShowcase = '참석';
          } else if (['불참','x','n','no','not attend','decline','x','참석안함','불참석','참여안함'].some(k => v === k || v.includes(k))) {
            o.pitchingShowcase = '불참';
          } else if (['미정','tbd','pending','검토중','확인중','?'].some(k => v === k || v.includes(k))) {
            o.pitchingShowcase = '미정';
          } else {
            // 그 외 값은 원본 유지 (혹시 모를 케이스)
            o.pitchingShowcase = String(o.pitchingShowcase).trim();
          }
        } else {
          o.pitchingShowcase = '';  // 명시적 빈 값 (CSV에서 빈 칸이거나 컬럼 자체가 없을 때)
        }
        return o;
      });

      let added=0, updated=0;
      update(s => {
        const byId = new Map(s.buyers.map(b => [b.id, b]));
        parsed.forEach(p => {
          if (byId.has(p.id)) { byId.set(p.id, {...byId.get(p.id), ...p}); updated++; }
          else { byId.set(p.id, p); added++; }
        });
        return {...s, buyers: Array.from(byId.values())};
      });
      setUploadReport({ok:true, added, updated, total:parsed.length, file:file.name});
    } catch (err) {
      setUploadReport({ok:false, message:err.message || '파일을 읽을 수 없습니다.'});
    }
  };

  const downloadTemplate = () => {
    // 업로드 파일 구조 — 프로젝트 + 22개 컬럼
    const headers = [
      '프로젝트\n(MIFA / MIPCOM / CANADA)',
      '국가', '회사명', '담당자', '직급', '연락처', '이메일',
      'Broadcaster\n(방송사)',
      'Streaming/OTT\n(OTT 플랫폼)',
      'Distributor\n(배급사)',
      'Production\n(제작사)',
      'Co-Production\n(공동제작)',
      'Investor\n(투자사)',
      'Publisher\n(퍼블리셔)',
      'Global Sales Agent\n(세일즈 에이전트)',
      'Licensee\n(MD·출판·상품화)',
      'Localization\n(로컬라이제이션·더빙)',
      'Merchandising\n(머천다이징)',
      '기타\n(Others)',
      '주요 사업 요약', '규모', '관심품목',
      '관심장르\n(쉼표구분)', '관심포맷\n(쉼표구분)', '관심연령\n(쉼표구분)',
      '관심권역\n(쉼표구분 · EU, NA, Global 등)',
      '피칭쇼케이스\n(참석/불참/미정)',
      '초청상태',
    ];
    // 샘플 3개 — 다양한 프로젝트·카테고리 조합 시연
    const sample1 = ['MIFA', 'France', 'Sample Broadcaster + OTT', 'Jane Leclerc', 'Head of Acquisitions', '+33-1-4200-0000', 'jane@sample.fr',
      'O', 'O', '',  '', '', '', '', '', '', '', '', '',
      '공영방송 + 자체 OTT 플랫폼 · 키즈 · 애니메이션 편성', '대기업', '시리즈 52x11′',
      '액션/어드벤처, 코미디, 판타지', 'TV 시리즈, 디지털 / 숏폼', '키즈 (5-8), 패밀리 (All-Ages), 틴 (9-14)',
      'EU, NA',
      '참석',
      ''];
    const sample2 = ['MIPCOM', 'Japan', 'Sample Animation Studio', 'Yuki Tanaka', 'Producer', '+81-3-0000-0000', 'tanaka@sample.jp',
      '', '', '',  'O', 'O', '', '', '', '', '', '', '',
      '3D CG 애니메이션 스튜디오 · 공동제작 경험 다수', '중견', '극장판·시리즈 공동제작',
      '액션/어드벤처, SF, 판타지', '장편 극장판, TV 시리즈', '틴 (9-14), YA (15-18)',
      'AS, Global',
      '미정',
      ''];
    const sample3 = ['CANADA', 'USA', 'Sample Licensee + Merchandising', 'John Doe', 'VP Licensing', '+1-310-555-0100', 'john@sample.com',
      '', '', '',  '', '', '', '', '', 'O', '', 'O', '',
      '완구·퍼블리싱·MD 종합 라이선싱', '대기업', '완구·출판·어패럴',
      '코미디, 판타지', 'IP 라이선싱', '유아 (0-4), 키즈 (5-8), 패밀리 (All-Ages)',
      'NA',
      '불참',
      ''];
    const aoa = [headers, sample1, sample2, sample3];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // 컬럼 너비 설정 (프로젝트 컬럼 추가됨)
    ws['!cols'] = [
      {wch:12},  // 프로젝트
      {wch:12}, {wch:36}, {wch:22}, {wch:22}, {wch:16}, {wch:28},
      {wch:12}, {wch:12}, {wch:12}, {wch:12}, {wch:12}, {wch:12},
      {wch:12}, {wch:14}, {wch:14}, {wch:14}, {wch:12}, {wch:10},
      {wch:40}, {wch:10}, {wch:24},
      {wch:26}, {wch:22}, {wch:28}, {wch:24},
      {wch:14},
      {wch:12},
    ];
    // 헤더 행 높이 (줄바꿈 수용)
    ws['!rows'] = [{hpt:30}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Buyers');
    XLSX.writeFile(wb, 'buyer_template.xlsx');
  };

  const filtered = state.buyers.filter(b => {
    // 카테고리 필터
    if (categoryFilter) {
      const cats = getBuyerCategories(b);
      if (!cats.includes(categoryFilter)) return false;
    }
    const s = search.toLowerCase();
    if (!s) return true;
    const cats = getBuyerCategories(b).join(' ').toLowerCase();
    return b.companyName?.toLowerCase().includes(s) ||
      b.country?.toLowerCase().includes(s) ||
      cats.includes(s) ||
      b.contactName?.toLowerCase().includes(s);
  });

  const startEdit = (b) => {
    setEditId(b.id);
    // 레거시 category 자동 → categories 배열로 변환
    const categories = getBuyerCategories(b);
    setForm({...b, categories});
  };
  const saveEdit = () => {
    update(s => ({...s, buyers: s.buyers.map(b => b.id===editId ? form : b)}));
    setEditId(null); setForm(null);
  };
  const deleteBuyer = (id) => {
    const target = fullState.buyers.find(b => b.id === id);
    setConfirmData({
      title: '바이어 삭제',
      message: target ? `"${target.companyName}" 바이어를 삭제하시겠습니까? 관련 미팅도 함께 삭제됩니다.` : '해당 바이어를 삭제하시겠습니까?',
      confirmLabel: '삭제',
      onConfirm: () => {
        update(s => ({
          ...s,
          buyers: s.buyers.filter(b => b.id !== id),
          meetings: s.meetings.filter(m => m.buyerId !== id),
        }));
      },
    });
  };

  const deleteFiltered = () => {
    const ids = new Set(filtered.map(b => b.id));
    if (ids.size === 0) return;
    setConfirmData({
      title: search ? '검색 결과 일괄 삭제' : '전체 일괄 삭제',
      message: search
        ? `검색 결과 ${ids.size}건을 삭제합니다. 관련 미팅도 함께 삭제되며 복구할 수 없습니다.`
        : `현재 화면에 보이는 바이어 ${ids.size}건을 모두 삭제합니다. 관련 미팅도 함께 삭제되며 복구할 수 없습니다.`,
      confirmLabel: `${ids.size}건 삭제`,
      onConfirm: () => {
        update(s => ({
          ...s,
          buyers: s.buyers.filter(b => !ids.has(b.id)),
          meetings: s.meetings.filter(m => !ids.has(m.buyerId)),
        }));
      },
    });
  };

  return (
    <div className="fade-in">
      <SectionHeader eyebrow="DATABASE / BUYERS" title="바이어 DB 관리"
        desc="엑셀 파일을 업로드하면 헤더를 자동 매핑하여 DB가 일괄 갱신됩니다. 동일 ID는 병합(update), 신규 ID는 추가(insert)됩니다."/>

      <div className="grid" style={{gridTemplateColumns:'1.2fr 1fr', gap:16, marginTop:24}}>
        <div className="card" style={{padding:24, display:'flex', alignItems:'center', gap:24}}>
          <div style={{width:56, height:56, background:'var(--navy)', color:'var(--gold)', display:'grid', placeItems:'center', flexShrink:0}}>
            <FileSpreadsheet size={24}/>
          </div>
          <div style={{flex:1}}>
            <div className="serif" style={{fontSize:18, fontWeight:500}}>Excel 일괄 업로드</div>
            <div style={{fontSize:12.5, color:'var(--muted)', marginTop:4, lineHeight:1.5}}>
              지원 컬럼: 회사명·담당자·이메일·국가·업종·취급품목·규모·관심품목·초청상태
            </div>
          </div>
          <div style={{display:'flex', gap:8}}>
            <button className="btn btn-ghost" onClick={downloadTemplate}><Upload size={14} style={{transform:'rotate(180deg)'}}/>템플릿</button>
            <button className="btn btn-gold" onClick={()=>fileRef.current?.click()}><Upload size={14}/>업로드</button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{display:'none'}} onChange={handleUpload}/>
          </div>
        </div>

        <div className="card" style={{padding:24}}>
          {uploadReport ? (
            uploadReport.ok ? (
              <div>
                <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:8}}>
                  <Check size={16} style={{color:'var(--green)'}}/>
                  <span className="serif" style={{fontSize:16, fontWeight:500}}>업로드 완료</span>
                </div>
                <div style={{fontSize:12.5, color:'var(--muted)', lineHeight:1.7}}>
                  파일 · <span className="mono">{uploadReport.file}</span><br/>
                  처리 · 총 {uploadReport.total}건 (신규 {uploadReport.added} · 갱신 {uploadReport.updated})
                </div>
              </div>
            ) : (
              <div>
                <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:8}}>
                  <AlertCircle size={16} style={{color:'var(--red)'}}/>
                  <span className="serif" style={{fontSize:16, fontWeight:500}}>업로드 실패</span>
                </div>
                <div style={{fontSize:12.5, color:'var(--muted)'}}>{uploadReport.message}</div>
              </div>
            )
          ) : (
            <div style={{color:'var(--muted)', fontSize:12.5, lineHeight:1.7}}>
              <Eye size={14} style={{marginBottom:-2}}/> 업로드 결과가 여기에 표시됩니다. 헤더명이 다를 경우 자동 매핑되며, 매핑되지 않은 컬럼은 원본 그대로 보존됩니다.
            </div>
          )}
        </div>
      </div>

      {/* 카테고리별 필터 */}
      <div style={{margin:'28px 0 8px'}}>
        <div className="mono" style={{fontSize:10, letterSpacing:'0.15em', color:'var(--muted)', marginBottom:8}}>FILTER BY CATEGORY</div>
        <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
          {(() => {
            const totalCount = state.buyers.length;
            const allActive = categoryFilter === null;
            return (
              <button onClick={()=>setCategoryFilter(null)}
                style={{
                  padding:'6px 12px', borderRadius:999, cursor:'pointer',
                  border: allActive ? '1px solid var(--ink)' : '1px solid var(--line)',
                  background: allActive ? 'var(--ink)' : 'var(--paper)',
                  color: allActive ? 'var(--ivory)' : 'var(--ink-2)',
                  fontSize:11.5, fontWeight:600, fontFamily:'inherit',
                  display:'inline-flex', alignItems:'center', gap:6,
                  transition:'all .15s',
                }}>
                ALL
                <span className="mono tabular" style={{fontSize:10, opacity: allActive ? 0.75 : 0.55, padding:'1px 6px', background: allActive ? 'rgba(255,255,255,0.18)' : 'var(--ivory-2)', borderRadius:3}}>{totalCount}</span>
              </button>
            );
          })()}
          {BUYER_CATEGORIES.map(c => {
            const cnt = state.buyers.filter(b => getBuyerCategories(b).includes(c)).length;
            const active = categoryFilter === c;
            const bg = CATEGORY_PALETTE[c] || '#475569';
            if (cnt === 0) return null; // 해당 카테고리 바이어 없으면 칩 숨김
            return (
              <button key={c} onClick={()=>setCategoryFilter(active ? null : c)}
                style={{
                  padding:'6px 12px', borderRadius:999, cursor:'pointer',
                  border: active ? `1px solid ${bg}` : '1px solid var(--line)',
                  background: active ? bg : 'var(--paper)',
                  color: active ? '#fff' : 'var(--ink-2)',
                  fontSize:11.5, fontWeight:600, fontFamily:'inherit',
                  display:'inline-flex', alignItems:'center', gap:6,
                  letterSpacing:'-0.005em',
                  transition:'all .15s',
                }}>
                {c}
                <span className="mono tabular" style={{fontSize:10, opacity: active ? 0.85 : 0.55, padding:'1px 6px', background: active ? 'rgba(255,255,255,0.2)' : 'var(--ivory-2)', borderRadius:3}}>{cnt}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', margin:'18px 0 14px', gap:14, flexWrap:'wrap'}}>
        <div style={{position:'relative', width:360}}>
          <Search size={14} style={{position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'var(--muted)'}}/>
          <input className="input" style={{paddingLeft:34}} placeholder="회사명 / 카테고리 / 국가 / 담당자로 검색" value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <div style={{display:'flex', alignItems:'center', gap:14}}>
          <div className="mono" style={{fontSize:11, color:'var(--muted)', letterSpacing:'0.15em'}}>
            {filtered.length} / {state.buyers.length} RESULTS
            {categoryFilter && <span style={{color:'var(--ink)', marginLeft:6}}> · {categoryFilter}</span>}
          </div>
          {filtered.length > 0 && (
            <button className="btn btn-danger" style={{padding:'7px 14px', fontSize:12}} onClick={deleteFiltered}>
              <Trash2 size={12}/>{(search || categoryFilter) ? `필터 결과 ${filtered.length}건 삭제` : `전체 ${filtered.length}건 삭제`}
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{overflow:'hidden'}}>
        <div style={{
          overflowX:'auto', overflowY:'auto',
          maxHeight:'calc(100vh - 320px)', // 상단 헤더/네비/카테고리필터/검색바 제외한 가용 높이
          minHeight:240,
        }}>
          <table className="mice-table" style={{minWidth:1600, whiteSpace:'nowrap'}}>
            <thead style={{position:'sticky', top:0, zIndex:3, background:'var(--ivory-2)', boxShadow:'0 1px 0 var(--line)'}}>
              <tr>
                {BUYER_COLUMNS.map(c => <th key={c.key} style={{width:c.width, whiteSpace:'nowrap', background:'var(--ivory-2)'}}>{c.label}</th>)}
                <th style={{width:110, whiteSpace:'nowrap', background:'var(--ivory-2)'}}>액션</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(b => (
                <tr key={b.id}>
                  <td style={{whiteSpace:'nowrap'}}>{b.country || '—'}</td>
                  <td style={{whiteSpace:'nowrap'}}><GradeBadge grade={b.grade}/></td>
                  <td style={{whiteSpace:'nowrap'}}><CategoriesBadges buyer={b}/></td>
                  <td style={{whiteSpace:'nowrap'}}>
                    <div onClick={()=>setDetailBuyer(b)}
                         className="serif"
                         style={{fontWeight:600, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:6}}
                         title="클릭하여 상세 정보 보기">
                      <span style={{borderBottom:'1px dotted var(--muted)'}}>{b.companyName}</span>
                      <Eye size={11} style={{color:'var(--muted-2)', flexShrink:0}}/>
                    </div>
                  </td>
                  <td style={{fontSize:12.5, whiteSpace:'nowrap'}}>{b.contactName || '—'}</td>
                  <td style={{fontSize:12.5, color:'var(--ink-2)', whiteSpace:'nowrap'}}>{b.position || '—'}</td>
                  <td className="mono" style={{fontSize:11, whiteSpace:'nowrap'}}>{b.email || '—'}</td>
                  <td className="mono" style={{fontSize:11, whiteSpace:'nowrap'}}>{b.phone || '—'}</td>
                  <td style={{whiteSpace:'nowrap'}}>{b.companySize || '—'}</td>
                  <td style={{fontSize:12, color:'var(--muted)', whiteSpace:'nowrap'}}>{b.interestedProducts || '—'}</td>
                  <td style={{whiteSpace:'nowrap'}}><InvitationBadge status={b.invitationStatus}/></td>
                  <td style={{whiteSpace:'nowrap'}}>
                    <div style={{display:'flex', gap:4}}>
                      <button className="btn btn-ghost" style={{padding:'4px 9px', fontSize:11.5}} title="상세 조회" onClick={()=>setDetailBuyer(b)}><Eye size={12}/></button>
                      <button className="btn btn-ghost" style={{padding:'4px 9px', fontSize:11.5}} title="수정" onClick={()=>startEdit(b)}><Edit3 size={12}/></button>
                      <button className="btn btn-danger" style={{padding:'4px 9px', fontSize:11.5}} title="삭제" onClick={()=>deleteBuyer(b.id)}><Trash2 size={12}/></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={12} style={{textAlign:'center', padding:40, color:'var(--muted)'}}>검색 결과가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 바이어 상세 조회 모달 */}
      <BuyerDetailModal
        buyer={detailBuyer}
        fullState={fullState}
        onClose={()=>setDetailBuyer(null)}
        onEdit={()=>{ const bb = detailBuyer; setDetailBuyer(null); startEdit(bb); }}
      />

      {editId && form && (
        <Modal title="바이어 정보 수정" onClose={()=>{setEditId(null); setForm(null);}}>
          <div className="grid" style={{gridTemplateColumns:'1fr 1fr', gap:16}}>
            <div>
              <label className="label">프로젝트</label>
              <select className="select" value={form.project||''} onChange={e=>setForm({...form, project:e.target.value||null})}>
                <option value="">—</option>
                <option value="MIFA">MIFA</option>
                <option value="MIPCOM">MIPCOM</option>
                <option value="CANADA">CANADA</option>
              </select>
            </div>
            <div style={{gridColumn:'1 / -1'}}>
              <label className="label">카테고리 <span style={{fontWeight:400, color:'var(--muted)', fontSize:11}}>(복수 선택 가능)</span></label>
              <div style={{display:'flex', flexWrap:'wrap', gap:6, marginTop:4}}>
                {BUYER_CATEGORIES.map(c => {
                  const selected = (form.categories || []).includes(c);
                  const bg = CATEGORY_PALETTE[c] || '#475569';
                  return (
                    <button key={c} type="button"
                      onClick={()=>{
                        const cur = form.categories || [];
                        const next = cur.includes(c) ? cur.filter(x => x !== c) : [...cur, c];
                        setForm({...form, categories: next, category: next[0] || ''});
                      }}
                      style={{
                        padding:'5px 11px', borderRadius:999, cursor:'pointer',
                        border: selected ? `1px solid ${bg}` : '1px solid var(--line)',
                        background: selected ? bg : 'var(--paper)',
                        color: selected ? '#fff' : 'var(--ink-2)',
                        fontSize:11, fontWeight:600, fontFamily:'inherit',
                        transition:'all .15s',
                      }}>
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="label">초청 상태</label>
              <select className="select" value={form.invitationStatus||''} onChange={e=>setForm({...form, invitationStatus:e.target.value||null})}>
                <option value="">미발송</option>
                <option value="sent">초청발송</option>
                <option value="pending">회신대기</option>
                <option value="accepted">참가확정</option>
                <option value="declined">참가불가</option>
              </select>
            </div>

            <div>
              <label className="label">피칭쇼케이스 참석여부</label>
              <select className="select" value={form.pitchingShowcase||''} onChange={e=>setForm({...form, pitchingShowcase:e.target.value})}>
                <option value="">미입력</option>
                <option value="참석">참석</option>
                <option value="불참">불참</option>
                <option value="미정">미정</option>
              </select>
            </div>

            {/* ======= 선호 콘텐츠 — 매칭 엔진 반영 필드 ======= */}
            <div style={{gridColumn:'1 / -1', padding:'14px 16px', background:'var(--purple-lt)', border:'1px solid var(--purple)', borderRadius:'var(--radius-sm)'}}>
              <div className="mono" style={{fontSize:10, letterSpacing:'0.18em', color:'var(--purple-dk)', fontWeight:700, marginBottom:4}}>
                PREFERRED CONTENT · 선호 콘텐츠
              </div>
              <div style={{fontSize:11, color:'var(--ink-2)', lineHeight:1.5, marginBottom:10}}>
                바이어의 타겟 연령 · 장르 · 포맷 · 권역 선호도를 선택하면 IP × 바이어 매칭 매트릭스에 자동 반영됩니다. 복수 선택 가능합니다.
              </div>

              {/* 관심 타겟 연령 */}
              <label className="label" style={{marginTop:6}}>타겟 연령 <span style={{fontWeight:400, color:'var(--muted)', fontSize:10.5}}>(Target Ages)</span></label>
              <div style={{display:'flex', flexWrap:'wrap', gap:5, marginBottom:12}}>
                {TARGET_AGE_OPTIONS.map(t => {
                  const arr = form.interestedTargetAges || [];
                  const sel = arr.includes(t);
                  return (
                    <button key={t} type="button"
                      onClick={()=>{
                        const next = sel ? arr.filter(x=>x!==t) : [...arr, t];
                        setForm({...form, interestedTargetAges: next});
                      }}
                      style={{
                        padding:'4px 10px', borderRadius:999, cursor:'pointer',
                        border: sel ? '1px solid var(--purple)' : '1px solid var(--line)',
                        background: sel ? 'var(--purple)' : 'var(--paper)',
                        color: sel ? '#fff' : 'var(--ink-2)',
                        fontSize:10.5, fontWeight:600, fontFamily:'inherit',
                        transition:'all .15s',
                      }}>
                      {t}
                    </button>
                  );
                })}
              </div>

              {/* 관심 장르 */}
              <label className="label">장르 <span style={{fontWeight:400, color:'var(--muted)', fontSize:10.5}}>(Genres)</span></label>
              <div style={{display:'flex', flexWrap:'wrap', gap:5, marginBottom:12}}>
                {GENRE_OPTIONS.map(g => {
                  const arr = form.interestedGenres || [];
                  const sel = arr.includes(g);
                  return (
                    <button key={g} type="button"
                      onClick={()=>{
                        const next = sel ? arr.filter(x=>x!==g) : [...arr, g];
                        setForm({...form, interestedGenres: next});
                      }}
                      style={{
                        padding:'4px 10px', borderRadius:999, cursor:'pointer',
                        border: sel ? '1px solid var(--purple)' : '1px solid var(--line)',
                        background: sel ? 'var(--purple)' : 'var(--paper)',
                        color: sel ? '#fff' : 'var(--ink-2)',
                        fontSize:10.5, fontWeight:600, fontFamily:'inherit',
                        transition:'all .15s',
                      }}>
                      {g}
                    </button>
                  );
                })}
              </div>

              {/* 관심 포맷 */}
              <label className="label">포맷 <span style={{fontWeight:400, color:'var(--muted)', fontSize:10.5}}>(Formats)</span></label>
              <div style={{display:'flex', flexWrap:'wrap', gap:5, marginBottom:12}}>
                {FORMAT_OPTIONS.map(f => {
                  const arr = form.interestedFormats || [];
                  const sel = arr.includes(f);
                  return (
                    <button key={f} type="button"
                      onClick={()=>{
                        const next = sel ? arr.filter(x=>x!==f) : [...arr, f];
                        setForm({...form, interestedFormats: next});
                      }}
                      style={{
                        padding:'4px 10px', borderRadius:999, cursor:'pointer',
                        border: sel ? '1px solid var(--purple)' : '1px solid var(--line)',
                        background: sel ? 'var(--purple)' : 'var(--paper)',
                        color: sel ? '#fff' : 'var(--ink-2)',
                        fontSize:10.5, fontWeight:600, fontFamily:'inherit',
                        transition:'all .15s',
                      }}>
                      {f}
                    </button>
                  );
                })}
              </div>

              {/* 관심 권역 — 국가 기반 자동 감지 + 수동 편집 */}
              <label className="label" style={{display:'flex', alignItems:'center', gap:6}}>
                권역 <span style={{fontWeight:400, color:'var(--muted)', fontSize:10.5}}>(Regions)</span>
                {(() => {
                  const autoRegion = getBuyerRegion(form.country);
                  const currentRegions = form.interestedRegions || [];
                  if (autoRegion && currentRegions.length === 0) {
                    const regLabel = (REGIONS.find(r => r.key === autoRegion) || {}).label || autoRegion;
                    return (
                      <span style={{fontSize:10, color:'var(--purple-dk)', fontWeight:600, marginLeft:4, padding:'2px 7px', background:'rgba(255,255,255,0.7)', borderRadius:3}}>
                        <Sparkles size={9} style={{verticalAlign:'middle', marginRight:3}}/>
                        자동 감지: {regLabel.split(' · ')[0]}
                      </span>
                    );
                  }
                  return null;
                })()}
              </label>
              <div style={{display:'flex', flexWrap:'wrap', gap:5}}>
                {REGIONS.map(r => {
                  const arr = form.interestedRegions || [];
                  const sel = arr.includes(r.key);
                  const autoRegion = getBuyerRegion(form.country);
                  const isAuto = autoRegion === r.key && arr.length === 0;
                  return (
                    <button key={r.key} type="button"
                      onClick={()=>{
                        const cur = form.interestedRegions || [];
                        const next = cur.includes(r.key) ? cur.filter(x=>x!==r.key) : [...cur, r.key];
                        setForm({...form, interestedRegions: next});
                      }}
                      style={{
                        padding:'4px 10px', borderRadius:999, cursor:'pointer',
                        border: sel
                          ? '1px solid var(--purple)'
                          : isAuto
                          ? '1px dashed var(--purple)'
                          : '1px solid var(--line)',
                        background: sel ? 'var(--purple)' : isAuto ? 'rgba(139,92,246,0.08)' : 'var(--paper)',
                        color: sel ? '#fff' : isAuto ? 'var(--purple-dk)' : 'var(--ink-2)',
                        fontSize:10.5, fontWeight:600, fontFamily:'inherit',
                        transition:'all .15s',
                      }}
                      title={isAuto ? '국가 기반 자동 감지 — 클릭해서 명시 선택' : undefined}
                    >
                      {r.label.split(' · ')[0]}
                    </button>
                  );
                })}
              </div>
              <div style={{fontSize:10, color:'var(--muted-2)', marginTop:6, lineHeight:1.5}}>
                점선 테두리 = 국가로부터 자동 감지된 권역 (매칭에는 사용됨). 실제 선택 시 클릭하여 선택된 값이 명시 권역으로 저장됩니다. 여러 권역에서 활동하는 바이어는 복수 선택하세요.
              </div>
            </div>

            {['companyName','contactName','position','email','phone','country','companySize','interestedProducts'].map(k => (
              <div key={k}>
                <label className="label">{BUYER_COLUMNS.find(c=>c.key===k)?.label || BUYER_FIELD_LABELS[k] || k}</label>
                <input className="input" value={form[k]||''} onChange={e=>setForm({...form,[k]:e.target.value})}/>
              </div>
            ))}
          </div>
          <div style={{display:'flex', justifyContent:'flex-end', gap:8, marginTop:24}}>
            <button className="btn btn-ghost" onClick={()=>{setEditId(null); setForm(null);}}>취소</button>
            <button className="btn btn-primary" onClick={saveEdit}><Save size={14}/>저장</button>
          </div>
        </Modal>
      )}

      {confirmData && (
        <Modal title={confirmData.title} onClose={()=>setConfirmData(null)}>
          <div style={{fontSize:13.5, lineHeight:1.7, color:'var(--ink-2)', padding:'4px 0 8px'}}>
            {confirmData.message}
          </div>
          <div style={{display:'flex', justifyContent:'flex-end', gap:8, marginTop:24}}>
            <button className="btn btn-ghost" onClick={()=>setConfirmData(null)}>취소</button>
            <button className="btn btn-danger" onClick={()=>{
              try { confirmData.onConfirm(); } finally { setConfirmData(null); }
            }}>
              <Trash2 size={13}/>{confirmData.confirmLabel || '삭제'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({title, children, onClose}){
  return (
    <div style={{position:'fixed', inset:0, background:'rgba(10,22,40,0.6)', zIndex:100, display:'grid', placeItems:'center', padding:20}} onClick={onClose}>
      <div className="card fade-in" style={{background:'var(--paper)', maxWidth:720, width:'100%', maxHeight:'90vh', overflow:'auto', padding:28}} onClick={e=>e.stopPropagation()}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20}}>
          <h3 className="serif" style={{fontSize:22, fontWeight:500, margin:0}}>{title}</h3>
          <button className="btn btn-ghost" style={{padding:6}} onClick={onClose}><X size={16}/></button>
        </div>
        <hr className="rule-gold" style={{margin:'0 0 20px'}}/>
        {children}
      </div>
    </div>
  );
}

// ---------------- EXHIBITORS MANAGEMENT ----------------
function ExhibitorsTab({state, readOnly}){
  const [detailId, setDetailId] = useState(null);
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('ALL'); // ALL/MIFA/MIPCOM/CANADA
  const detail = detailId ? state.exhibitors.find(e => e.id === detailId) : null;

  // 각 섹션 완성도 판정
  const sectionStatus = (e) => {
    const profile = !!(e.companyName && e.contactName && e.email);
    const intro = !!(e.introEn && e.introEn.trim().length >= 50);
    const ips = (e.ips || []).length > 0;
    const survey = e.survey && Object.values(e.survey).some(v =>
      v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)
    );
    return { profile, intro, ips, survey };
  };

  const filtered = state.exhibitors.filter(e => {
    if (projectFilter !== 'ALL' && e.project !== projectFilter) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (e.companyName||'').toLowerCase().includes(s) ||
           (e.companyNameEn||'').toLowerCase().includes(s) ||
           (e.contactName||'').toLowerCase().includes(s) ||
           (e.loginId||'').toLowerCase().includes(s);
  });

  // 최근 수정 시각 포맷 (상대 시간)
  const formatRelative = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return '방금 전';
    if (diff < 3600) return `${Math.floor(diff/60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff/3600)}시간 전`;
    if (diff < 86400 * 7) return `${Math.floor(diff/86400)}일 전`;
    return d.toLocaleDateString('ko-KR', {month:'short', day:'numeric'});
  };

  // 정렬: 최근 수정 먼저
  const sorted = [...filtered].sort((a, b) => {
    const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return tb - ta;
  });

  return (
    <div className="fade-in">
      <SectionHeader eyebrow="DATABASE / PARTICIPANTS" title="참가사 관리"
        desc="등록된 참가사 계정 및 제출 정보 일람. 회사정보·소개·IP·수요조사 4개 섹션의 완성도와 최근 수정 시각을 한눈에 확인할 수 있습니다. 각 행의 '상세' 버튼으로 전체 제출물을 조회·다운로드하세요."/>

      {/* 프로젝트 필터 */}
      <div style={{display:'flex', gap:6, marginTop:24, marginBottom:14, flexWrap:'wrap'}}>
        {['ALL','MIFA','MIPCOM','CANADA'].map(p => {
          const cnt = p === 'ALL'
            ? state.exhibitors.length
            : state.exhibitors.filter(e => e.project === p).length;
          const active = projectFilter === p;
          const bg = p === 'ALL' ? 'var(--ink)' : projectColor(p).bg;
          return (
            <button key={p} onClick={()=>setProjectFilter(p)}
              style={{
                padding:'6px 14px', borderRadius:999, cursor:'pointer',
                border: active ? `1px solid ${bg}` : '1px solid var(--line)',
                background: active ? bg : 'var(--paper)',
                color: active ? '#fff' : 'var(--ink-2)',
                fontSize:11.5, fontWeight:600, fontFamily:'inherit',
                display:'inline-flex', alignItems:'center', gap:6,
                transition:'all .15s',
              }}>
              {p}
              <span className="mono tabular" style={{fontSize:10, opacity: active ? 0.85 : 0.55, padding:'1px 6px', background: active ? 'rgba(255,255,255,0.2)' : 'var(--ivory-2)', borderRadius:3}}>{cnt}</span>
            </button>
          );
        })}
      </div>

      {/* 검색창 */}
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, gap:14}}>
        <div style={{position:'relative', width:360}}>
          <Search size={14} style={{position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'var(--muted)'}}/>
          <input className="input" style={{paddingLeft:34}} placeholder="회사명 / 담당자 / 로그인 ID로 검색" value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <div className="mono" style={{fontSize:11, color:'var(--muted)', letterSpacing:'0.15em'}}>
          {sorted.length} / {state.exhibitors.length} PARTICIPANTS
        </div>
      </div>

      <div className="card" style={{overflow:'hidden'}}>
        <div className="scroll-x" style={{overflowX:'auto'}}>
          <table className="mice-table" style={{minWidth:1200, whiteSpace:'nowrap'}}>
            <thead>
              <tr>
                <th style={{width:80}}>프로젝트</th>
                <th style={{minWidth:220}}>회사</th>
                <th style={{width:180}}>담당자</th>
                <th style={{width:260}}>제출 현황</th>
                <th style={{width:120}}>최근 수정</th>
                <th style={{width:90}}>계정</th>
                <th style={{width:90}}>액션</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(e => {
                const status = sectionStatus(e);
                const completedCount = Object.values(status).filter(Boolean).length;
                const hasLogo = !!e.logoKey;
                const totalImages = (e.ips || []).reduce((acc, ip) => acc + ((ip.images||[]).length), 0);
                return (
                <tr key={e.id}>
                  <td>{e.project ? <ProjectBadge project={e.project}/> : <span style={{color:'var(--muted-2)', fontSize:11}}>—</span>}</td>
                  <td>
                    <div style={{display:'flex', alignItems:'center', gap:8}}>
                      {hasLogo && <div style={{width:5, height:5, borderRadius:'50%', background:'#16A34A', flexShrink:0}} title="로고 업로드됨"/>}
                      <div style={{minWidth:0, flex:1}}>
                        <div className="serif" style={{fontSize:14, fontWeight:600, wordBreak:'keep-all', lineHeight:1.3}}>{e.companyName}</div>
                        <div style={{fontSize:11, color:'var(--muted)', marginTop:2, wordBreak:'break-word', lineHeight:1.3}}>
                          {e.companyNameEn || <span style={{color:'var(--muted-2)'}}>영문명 미입력</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{fontSize:12}}>
                    {e.contactName ? <>
                      <div style={{fontWeight:500}}>{e.contactName}</div>
                      <div style={{fontSize:10.5, color:'var(--muted)', marginTop:1}}>{e.positionKo || '—'}</div>
                    </> : <span style={{color:'var(--muted-2)', fontSize:11}}>미입력</span>}
                  </td>
                  {/* 섹션별 완성도 — 4칸 도트 */}
                  <td>
                    <div style={{display:'flex', gap:6, alignItems:'center'}}>
                      <SectionDot active={status.profile} label="회사"/>
                      <SectionDot active={status.intro} label="소개"/>
                      <SectionDot active={status.ips} label={`IP${(e.ips||[]).length > 0 ? ` ${(e.ips||[]).length}` : ''}`}/>
                      <SectionDot active={status.survey} label="수요조사"/>
                      {totalImages > 0 && (
                        <span style={{marginLeft:6, fontSize:10.5, color:'var(--muted)', padding:'2px 7px', background:'var(--ivory-2)', borderRadius:3}}>
                          🖼 {totalImages}
                        </span>
                      )}
                    </div>
                    <div className="mono" style={{fontSize:9.5, color: completedCount === 4 ? '#16A34A' : 'var(--muted-2)', marginTop:3, letterSpacing:'0.08em'}}>
                      {completedCount} / 4 COMPLETE
                    </div>
                  </td>
                  <td style={{fontSize:11.5}}>
                    {e.updatedAt
                      ? <div>
                          <div style={{fontWeight:500, color:'var(--ink-2)'}}>{formatRelative(e.updatedAt)}</div>
                          <div className="mono" style={{fontSize:9.5, color:'var(--muted-2)', marginTop:1}}>
                            {new Date(e.updatedAt).toLocaleDateString('ko-KR')}
                          </div>
                        </div>
                      : <span style={{color:'var(--muted-2)'}}>—</span>}
                  </td>
                  <td><span className="chip mono" style={{fontSize:10}}>{e.loginId}</span></td>
                  <td>
                    <button className="btn btn-ghost" style={{padding:'5px 10px', fontSize:11.5}} onClick={()=>setDetailId(e.id)}>
                      <Eye size={12}/>상세
                    </button>
                  </td>
                </tr>
              );})}
              {sorted.length === 0 && (
                <tr><td colSpan={7} style={{textAlign:'center', padding:40, color:'var(--muted)'}}>검색 결과가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {detail && <ExhibitorDetailModal exhibitor={detail} onClose={()=>setDetailId(null)} readOnly={readOnly}/>}
    </div>
  );
}

// 섹션 완성도 도트
function SectionDot({active, label}){
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:4,
      fontSize:10, fontWeight:600, letterSpacing:'0.01em',
      padding:'2px 7px', borderRadius:3,
      background: active ? '#16A34A' : 'var(--ivory-2)',
      color: active ? '#fff' : 'var(--muted-2)',
      border: active ? '1px solid #16A34A' : '1px solid var(--line)',
    }}>
      {active && <Check size={8}/>}
      {label}
    </span>
  );
}

// ---------------- INVITATION & RESPONSE ----------------
function InviteTab({state, update}){
  const [selected, setSelected] = useState(new Set());
  const [respondingBuyerId, setRespondingBuyerId] = useState(null);

  const toggle = (id) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };

  const sendInvitations = () => {
    if (selected.size === 0) return;
    const now = new Date().toISOString().replace('T',' ').slice(0,16);
    update(s => ({
      ...s,
      buyers: s.buyers.map(b => selected.has(b.id) ? {...b, invitationStatus:'sent'} : b),
      invitationLog: [
        ...s.invitationLog,
        ...Array.from(selected).map((bid, i) => ({
          id: s.invitationLog.length + i + 1,
          buyerId: bid, sentAt: now, status: 'sent'
        }))
      ],
    }));
    setSelected(new Set());
    alert(`${selected.size}명의 바이어에게 초청 메일을 발송했습니다.\n(실 운영 시 SMTP/SendGrid + 구글폼 링크가 자동 삽입됩니다.)`);
  };

  // Google Form response simulation
  const submitResponse = (buyerId, dates, accept) => {
    const now = new Date().toISOString().replace('T',' ').slice(0,16);
    update(s => {
      const buyer = s.buyers.find(b => b.id === buyerId);
      const newStatus = accept ? 'accepted' : 'declined';

      // auto-schedule: 초청 수락 시, 해당 바이어와 매칭도 가장 높은 참가사를 찾아 첫 희망일에 자동 배정
      let newMeetings = s.meetings;
      if (accept && dates.length) {
        const best = s.exhibitors
          .map(ex => ({ex, ...matchScore(ex, buyer)}))
          .sort((a,b)=>b.score-a.score)[0];
        if (best && best.score > 0) {
          // assign unused timeslot
          const used = new Set(s.meetings.filter(m => m.date===dates[0]).map(m => m.time));
          const slots = ['09:30','10:00','10:30','11:00','11:30','13:30','14:00','14:30','15:00','15:30','16:00'];
          const slot = slots.find(t => !used.has(t)) || '16:30';
          const tableNum = String(s.meetings.length + 1).padStart(2,'0');
          newMeetings = [...s.meetings, {
            id: `MT-${String(s.meetings.length+1).padStart(3,'0')}`,
            exhibitorId: best.ex.id,
            buyerId: buyerId,
            date: dates[0],
            time: slot,
            table: `${['A','B','C','D'][Math.floor(Math.random()*4)]}-${tableNum}`,
            status: 'confirmed',
            notes: '',
            source: 'google_form_response',
          }];
        }
      }

      return {
        ...s,
        buyers: s.buyers.map(b => b.id===buyerId ? {...b, invitationStatus:newStatus, preferredDates:dates} : b),
        meetings: newMeetings,
        invitationLog: [...s.invitationLog, {
          id: s.invitationLog.length + 1,
          buyerId, sentAt: now, status: newStatus
        }],
      };
    });
    setRespondingBuyerId(null);
  };

  return (
    <div className="fade-in">
      <SectionHeader eyebrow="WORKFLOW / INVITATIONS" title="바이어 초청 & 회신 관제"
        desc="초청 메일 발송 → 바이어가 구글폼으로 참석 여부 및 희망 일자 회신 → 최고 매칭 참가사와 자동 스케줄 편성. 본 화면에서 회신 시뮬레이션을 실행할 수 있습니다."/>

      <div className="grid" style={{gridTemplateColumns:'2fr 1fr', gap:16, marginTop:24}}>
        <div className="card" style={{padding:24}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18}}>
            <div>
              <div className="serif" style={{fontSize:20, fontWeight:500}}>초청 대상 선택</div>
              <div style={{fontSize:12, color:'var(--muted)', marginTop:4}}>발송할 바이어를 선택하고 '초청 발송'을 클릭하세요.</div>
            </div>
            <button className="btn btn-primary" disabled={selected.size===0} onClick={sendInvitations}
                    style={{opacity:selected.size===0?0.4:1}}>
              <Send size={14}/>초청 발송 ({selected.size})
            </button>
          </div>
          <hr className="rule"/>
          <div style={{maxHeight:420, overflow:'auto', marginTop:12}}>
            {state.buyers.length === 0 && (
              <div style={{padding:40, textAlign:'center', color:'var(--muted)', fontSize:13}}>
                등록된 바이어가 없습니다. <br/>
                <span style={{fontSize:12, color:'var(--muted-2)'}}>바이어 DB 탭에서 엑셀을 업로드하면 이곳에 자동으로 표시됩니다.</span>
              </div>
            )}
            {state.buyers.map(b => (
              <label key={b.id} style={{display:'grid', gridTemplateColumns:'auto 1fr auto auto', gap:14, alignItems:'center', padding:'12px 4px', borderBottom:'1px solid var(--line-2)', cursor:'pointer'}}>
                <input type="checkbox" checked={selected.has(b.id)} onChange={()=>toggle(b.id)} style={{width:16, height:16, accentColor:'var(--navy)'}}/>
                <div>
                  <div className="serif" style={{fontSize:14, fontWeight:600}}>{b.companyName}</div>
                  <div style={{fontSize:11.5, color:'var(--muted)'}}>{b.country} · {getBuyerCategories(b).join(', ') || '—'} · {b.email}</div>
                </div>
                <InvitationBadge status={b.invitationStatus}/>
                {(b.invitationStatus==='sent' || b.invitationStatus==='pending') && (
                  <button className="btn btn-gold" style={{padding:'6px 12px', fontSize:11}}
                          onClick={(e)=>{e.preventDefault(); setRespondingBuyerId(b.id);}}>
                    회신 시뮬레이션
                  </button>
                )}
              </label>
            ))}
          </div>
        </div>

        <div className="card" style={{padding:24}}>
          <div className="serif" style={{fontSize:20, fontWeight:500, marginBottom:4}}>회신 로그</div>
          <div style={{fontSize:12, color:'var(--muted)', marginBottom:18}}>최근 순</div>
          <hr className="rule"/>
          <div style={{maxHeight:380, overflow:'auto', marginTop:12}}>
            {[...state.invitationLog].reverse().map(log => {
              const b = state.buyers.find(x => x.id === log.buyerId);
              return (
                <div key={log.id} style={{padding:'10px 0', borderBottom:'1px solid var(--line-2)'}}>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                    <div style={{fontSize:13, fontWeight:500}}>{b?.companyName || log.buyerId}</div>
                    <InvitationBadge status={log.status}/>
                  </div>
                  <div className="mono" style={{fontSize:10.5, color:'var(--muted)', marginTop:2}}>{log.sentAt}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* INTEGRATION NOTE */}
      <div style={{marginTop:24, padding:20, background:'var(--navy)', color:'var(--ivory)', borderLeft:'3px solid var(--gold)'}}>
        <div className="mono" style={{fontSize:10, letterSpacing:'0.22em', color:'var(--gold)', marginBottom:6}}>PRODUCTION INTEGRATION NOTE</div>
        <div style={{fontSize:12.5, lineHeight:1.7, opacity:0.9}}>
          본 프로토타입은 클라이언트 내 시뮬레이션으로 구동됩니다. 실 운영 시 <strong>SendGrid/AWS SES</strong>로 개인화 초청 메일이 발송되고,
          바이어는 구글폼/Typeform으로 회신하며 <strong>Webhook → Apps Script/Zapier → 플랫폼 API</strong> 경로로 희망일이 자동 기입됩니다.
          초청 회신 직후 매칭 상위 참가사와 빈 슬롯에 자동 배정되며 운영자는 해당 배정을 검토·확정합니다.
        </div>
      </div>

      {respondingBuyerId && (
        <ResponseSimulator
          buyer={state.buyers.find(b => b.id === respondingBuyerId)}
          onClose={()=>setRespondingBuyerId(null)}
          onSubmit={submitResponse}
        />
      )}
    </div>
  );
}

function ResponseSimulator({buyer, onClose, onSubmit}){
  const [dates, setDates] = useState(['2026-05-14']);
  const [accept, setAccept] = useState(true);
  const availableDates = ['2026-05-14','2026-05-15','2026-05-16'];

  const toggleDate = (d) => {
    setDates(dates.includes(d) ? dates.filter(x=>x!==d) : [...dates, d]);
  };

  return (
    <Modal title={`회신 시뮬레이션 — ${buyer.companyName}`} onClose={onClose}>
      <div style={{padding:'14px 18px', background:'var(--ivory-2)', fontSize:12, color:'var(--muted)', marginBottom:20, lineHeight:1.7}}>
        실 운영에서 바이어가 구글폼을 통해 제출하는 정보와 동일한 데이터를 수동 입력합니다.
        제출 시 매칭 점수 1위 참가사의 빈 슬롯에 자동 배정됩니다.
      </div>

      <div style={{display:'flex', gap:8, marginBottom:20}}>
        <button className={accept?'btn btn-primary':'btn btn-ghost'} style={{flex:1}} onClick={()=>setAccept(true)}>
          <Check size={14}/>참가 수락
        </button>
        <button className={!accept?'btn btn-danger':'btn btn-ghost'} style={{flex:1}} onClick={()=>setAccept(false)}>
          <X size={14}/>참가 불가
        </button>
      </div>

      {accept && (
        <div>
          <label className="label">희망 미팅 일자 (복수 선택 가능)</label>
          <div style={{display:'flex', gap:8}}>
            {availableDates.map(d => (
              <button key={d}
                className={dates.includes(d)?'btn btn-gold':'btn btn-ghost'}
                onClick={()=>toggleDate(d)} style={{flex:1, justifyContent:'center'}}>
                <Calendar size={13}/>{d}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{display:'flex', justifyContent:'flex-end', gap:8, marginTop:24}}>
        <button className="btn btn-ghost" onClick={onClose}>취소</button>
        <button className="btn btn-primary" onClick={()=>onSubmit(buyer.id, accept ? dates : [], accept)} disabled={accept && dates.length===0}>
          <Send size={14}/>회신 제출
        </button>
      </div>
    </Modal>
  );
}

// ---------------- ADMIN SCHEDULE ----------------
function AdminScheduleTab({state, fullState, update, project, readOnly}){
  const projects = ['MIFA','MIPCOM','CANADA'];
  const defaultProject = project === 'ALL' ? 'MIFA' : project;
  const [subProject, setSubProject] = useState(defaultProject);
  const config = EVENT_CONFIG[subProject];
  const [selectedDate, setSelectedDate] = useState(config.dates[0]?.date || '');

  useEffect(() => { setSelectedDate(config.dates[0]?.date || ''); }, [subProject]);

  const slots = useMemo(() => generateTimeSlots(config.timeStart, config.timeEnd, config.slotMinutes), [subProject]);

  const exhibitorsInProject = fullState.exhibitors.filter(e => e.project === subProject);
  const meetingsForDate = fullState.meetings.filter(m => {
    const ex = fullState.exhibitors.find(e => e.id === m.exhibitorId);
    return ex?.project === subProject && m.date === selectedDate;
  });
  const allMeetingsInProject = fullState.meetings.filter(m => {
    const ex = fullState.exhibitors.find(e => e.id === m.exhibitorId);
    return ex?.project === subProject;
  });

  const [modalMode, setModalMode] = useState(null); // 'new' | 'edit'
  const [modalData, setModalData] = useState(null);
  const [confirmData, setConfirmData] = useState(null);

  const meetingsAtCell = (exId, time) => meetingsForDate.filter(m => m.exhibitorId === exId && m.time === time);
  const getBuyer = id => fullState.buyers.find(b => b.id === id);
  const getExhibitor = id => fullState.exhibitors.find(e => e.id === id);

  // 드래그앤드롭 상태 — 이동 중인 미팅 ID + 드롭 대상 표시용
  const [draggingId, setDraggingId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null); // `${exId}|${time}`

  const handleDrop = (exId, time) => {
    if (readOnly) return;
    if (!draggingId) return;
    update(s => {
      const meeting = s.meetings.find(m => m.id === draggingId);
      if (!meeting) return s;
      const newDate = selectedDate;
      const newTime = time;
      const newExhId = exId;
      // 미팅 업데이트
      const meetings = s.meetings.map(m => m.id === draggingId
        ? {...m, exhibitorId: newExhId, time: newTime, date: newDate}
        : m);
      // 바이어 동기화 — 확정 일정/참가사
      const buyers = s.buyers.map(b => b.id === meeting.buyerId
        ? {...b, confirmedDate: newDate, confirmedTime: newTime, confirmedExhibitorId: newExhId}
        : b);
      return {...s, meetings, buyers};
    });
    setDraggingId(null);
    setDropTarget(null);
  };

  const openNew = (exhibitorId, time) => {
    if (readOnly) return;
    setModalMode('new');
    setModalData({
      exhibitorId,
      date: selectedDate,
      time,
      table: '',
      status: 'confirmed',
      notes: '',
      buyerId: null,
      _companyName: '',
      _contactName: '',
      _position: '',
      _email: '',
      _phone: '',
    });
  };

  const openEdit = (m) => {
    if (readOnly) return;
    const b = getBuyer(m.buyerId);
    setModalMode('edit');
    setModalData({
      ...m,
      _companyName: b?.companyName || '',
      _contactName: b?.contactName || '',
      _position: b?.position || '',
      _email: b?.email || '',
      _phone: b?.phone || '',
    });
  };

  const closeModal = () => { setModalMode(null); setModalData(null); };

  const saveModal = () => {
    if (readOnly) return;
    if (!modalData.exhibitorId) { alert('참가사를 선택해주세요.'); return; }
    if (!(modalData._companyName || '').trim()) { alert('바이어 회사명을 입력해주세요.'); return; }

    update(s => {
      let buyers = s.buyers;
      let buyerId = modalData.buyerId;

      if (modalMode === 'new') {
        // 신규 바이어 생성
        const seq = s.buyers.length + 1;
        buyerId = `BU-${subProject}-${String(seq).padStart(4,'0')}`;
        const guess = guessBuyerField(modalData._companyName);
        const size = guessBuyerSize(modalData._companyName);
        const newBuyer = {
          id: buyerId,
          project: subProject,
          companyName: modalData._companyName.trim(),
          contactName: modalData._contactName || '',
          position: modalData._position || '',
          email: modalData._email || '',
          phone: modalData._phone || '',
          country: '',
          categories: guessBuyerCategories(modalData._companyName),
          companySize: size || '',
          interestedProducts: '',
          invitationStatus: 'accepted',
          preferredDates: [modalData.date],
          source: 'admin_added',
          pitchingShowcase: '',  // 비즈니스 미팅 스케줄로 등록된 바이어는 피칭쇼케이스 빈 값
        };
        buyers = [...s.buyers, newBuyer];
      } else {
        // 편집: 기존 바이어 정보 업데이트
        buyers = s.buyers.map(b => b.id === modalData.buyerId ? {
          ...b,
          companyName: modalData._companyName.trim(),
          contactName: modalData._contactName,
          position: modalData._position,
          email: modalData._email,
          phone: modalData._phone,
        } : b);
      }

      const meetingFields = {
        exhibitorId: modalData.exhibitorId,
        buyerId,
        date: modalData.date,
        time: modalData.time,
        table: modalData.table || `A-${String(s.meetings.length + 1).padStart(2,'0')}`,
        status: modalData.status,
        notes: modalData.notes || '',
      };

      if (modalMode === 'new') {
        const newMeeting = {
          id: `MT-${String(s.meetings.length + 1).padStart(3,'0')}`,
          ...meetingFields,
          source: 'admin_manual',
          createdBy: 'admin',
        };
        // 바이어 동기화 — 신규 미팅의 일자/시간/참가사를 확정 정보로 저장
        const buyersFinal = buyers.map(b => b.id === buyerId
          ? {...b, confirmedDate: modalData.date, confirmedTime: modalData.time, confirmedExhibitorId: modalData.exhibitorId}
          : b);
        return {...s, buyers: buyersFinal, meetings: [...s.meetings, newMeeting]};
      } else {
        // 편집: 미팅 + 바이어 confirmed 정보 동시 업데이트
        const buyersFinal = buyers.map(b => b.id === buyerId
          ? {...b, confirmedDate: modalData.date, confirmedTime: modalData.time, confirmedExhibitorId: modalData.exhibitorId}
          : b);
        return {
          ...s, buyers: buyersFinal,
          meetings: s.meetings.map(m => m.id === modalData.id ? {...m, ...meetingFields} : m)
        };
      }
    });
    closeModal();
  };

  const deleteMeeting = () => {
    if (readOnly) return;
    if (!modalData?.id) return;
    setConfirmData({
      title: '미팅 삭제',
      message: `"${modalData._companyName}"와의 미팅 (${modalData.date} ${modalData.time})을 삭제하시겠습니까?`,
      onConfirm: () => {
        update(s => ({...s, meetings: s.meetings.filter(m => m.id !== modalData.id)}));
        closeModal();
      },
    });
  };

  // 동일 프로젝트 바이어 드롭다운
  const availableBuyers = fullState.buyers
    .filter(b => b.project === subProject)
    .sort((a,b) => {
      const rank = x => x.invitationStatus === 'accepted' ? 0 : 1;
      return rank(a) - rank(b) || (a.companyName||'').localeCompare(b.companyName||'');
    });

  return (
    <div className="fade-in">
      <SectionHeader eyebrow="OPERATIONS / SCHEDULE" title="비즈니스 상담 스케줄"
        desc="행사별로 편성된 1:1 비즈니스 미팅을 관리합니다. 같은 슬롯에 복수 미팅 편성이 가능하며, 미팅 카드를 드래그해서 다른 시간·참가사로 즉시 이동할 수 있습니다. 빈 슬롯 클릭으로 새 미팅 추가, 기존 미팅 카드 클릭으로 상세 편집. 모든 변경은 참가사 스케줄에도 실시간 반영됩니다." />

      {readOnly && (
        <div style={{
          marginTop:16, padding:'10px 14px',
          background:'var(--purple-lt)',
          border:'1px solid var(--purple)',
          borderRadius:'var(--radius-sm)',
          fontSize:12, color:'var(--purple-dk)',
          display:'flex', alignItems:'center', gap:8,
        }}>
          <Eye size={13}/>
          <span><strong>열람 전용</strong> · 미팅 추가 · 편집 · 삭제 · 드래그 이동이 제한됩니다.</span>
        </div>
      )}

      {/* 미팅 출처별 색상 범례 */}
      <div style={{
        marginTop:16, padding:'10px 14px',
        background:'var(--ivory-2)',
        border:'1px solid var(--line)',
        borderRadius:'var(--radius-sm)',
        fontSize:11.5, color:'var(--ink-2)',
        display:'flex', alignItems:'center', gap:18, flexWrap:'wrap',
      }}>
        <span className="mono" style={{fontSize:10, letterSpacing:'0.15em', color:'var(--muted)', fontWeight:700}}>
          미팅 출처
        </span>
        <span style={{display:'inline-flex', alignItems:'center', gap:6}}>
          <span style={{display:'inline-block', width:18, height:14, background:'#06B6D4', borderRadius:3}}/>
          참가사 등록
        </span>
        <span style={{display:'inline-flex', alignItems:'center', gap:6}}>
          <span style={{display:'inline-block', width:18, height:14, background:'#F59E0B', borderRadius:3}}/>
          관리자 편성
        </span>
        <span style={{display:'inline-flex', alignItems:'center', gap:6}}>
          <span style={{display:'inline-block', width:18, height:14, background:'#6B7280', borderRadius:3}}/>
          자동 생성 (CSV)
        </span>
        <span style={{fontSize:10.5, color:'var(--muted)', marginLeft:'auto'}}>
          미팅 슬롯 색상으로 출처 구분 · 호버 시 상세 표시
        </span>
      </div>

      {/* 행사 서브 스위처 */}
      <div style={{display:'flex', gap:8, marginTop:24, marginBottom:16, alignItems:'center', flexWrap:'wrap'}}>
        {projects.map(p => {
          const active = subProject === p;
          const col = projectColor(p);
          const cnt = fullState.meetings.filter(m => {
            const ex = fullState.exhibitors.find(e => e.id === m.exhibitorId);
            return ex?.project === p;
          }).length;
          return (
            <button key={p} onClick={()=>setSubProject(p)} style={{
              padding:'9px 18px', borderRadius:'var(--radius-sm)', cursor:'pointer',
              border: active ? `1px solid ${col.bg}` : '1px solid var(--line)',
              background: active ? col.bg : 'var(--paper)',
              color: active ? col.fg : 'var(--ink-2)',
              fontSize:13, fontWeight:600, fontFamily:'inherit',
              display:'inline-flex', alignItems:'center', gap:8,
              letterSpacing:'-0.005em', transition:'all .15s',
            }}>
              {p}
              <span className="mono tabular" style={{fontSize:10.5, opacity: active ? 0.8 : 0.55, padding:'1px 7px', background: active ? 'rgba(0,0,0,0.18)' : 'var(--ivory-2)', borderRadius:4}}>{cnt}</span>
            </button>
          );
        })}
        <div style={{marginLeft:16, fontSize:12, color:'var(--muted)'}}>
          <span className="serif" style={{fontWeight:600, color:'var(--ink)'}}>{config.label}</span>
          {config.dates.length > 0 && (
            <> · {config.dates.length}일 · {config.timeStart}~{config.timeEnd} · {config.slotMinutes}분 슬롯</>
          )}
        </div>
      </div>

      {config.dates.length === 0 ? (
        <div className="card" style={{padding:52, textAlign:'center', color:'var(--muted)', fontSize:13.5}}>
          {subProject} 행사 일정이 아직 등록되지 않았습니다.<br/>
          <span style={{fontSize:12, color:'var(--muted-2)'}}>운영 일정이 확정되면 EVENT_CONFIG에 등록해주세요.</span>
        </div>
      ) : (
        <>
          <div style={{display:'flex', gap:6, marginBottom:14, overflowX:'auto', paddingBottom:2}}>
            {config.dates.map(d => {
              const active = selectedDate === d.date;
              const cntOnDay = allMeetingsInProject.filter(m => m.date === d.date).length;
              return (
                <button key={d.date} onClick={()=>setSelectedDate(d.date)} style={{
                  padding:'10px 16px', borderRadius:'var(--radius-sm)', cursor:'pointer',
                  border: active ? '1px solid var(--ink)' : '1px solid var(--line)',
                  background: active ? 'var(--ink)' : 'var(--paper)',
                  color: active ? 'var(--ivory)' : 'var(--ink-2)',
                  fontFamily:'inherit', display:'flex', flexDirection:'column', alignItems:'flex-start', gap:2,
                  minWidth:112, transition:'all .15s',
                }}>
                  <span className="mono" style={{fontSize:10.5, opacity: active ? 0.7 : 0.55, letterSpacing:'0.05em'}}>{d.dow}</span>
                  <span style={{fontSize:14, fontWeight:600}}>{d.date.slice(5)}</span>
                  <span className="mono tabular" style={{fontSize:10, opacity: active ? 0.65 : 0.5}}>{cntOnDay}건 편성</span>
                </button>
              );
            })}
          </div>

          {exhibitorsInProject.length === 0 ? (
            <div className="card" style={{padding:48, textAlign:'center', color:'var(--muted)', fontSize:13.5}}>
              {subProject} 행사에 등록된 참가사가 없습니다.
            </div>
          ) : (
            <div className="card" style={{overflow:'auto'}}>
              <table style={{width:'100%', borderCollapse:'separate', borderSpacing:0, fontSize:12}}>
                <thead>
                  <tr>
                    <th style={{position:'sticky', left:0, top:0, background:'var(--ivory-2)', padding:'10px 14px', textAlign:'left', borderBottom:'1px solid var(--line)', borderRight:'1px solid var(--line)', minWidth:72, zIndex:3}}>
                      <div className="mono" style={{fontSize:10, letterSpacing:'0.15em', color:'var(--muted)'}}>TIME</div>
                    </th>
                    {exhibitorsInProject.map(ex => (
                      <th key={ex.id} style={{padding:'12px 14px', textAlign:'center', background:'var(--ivory-2)', borderBottom:'1px solid var(--line)', borderRight:'1px solid var(--line)', minWidth:180, position:'sticky', top:0, zIndex:2}}>
                        <div className="serif" style={{fontSize:13, fontWeight:600, letterSpacing:'-0.01em', textAlign:'center'}}>{ex.companyName}</div>
                        <div style={{fontSize:10.5, color:'var(--muted)', marginTop:3, textAlign:'center'}}>{ex.companyNameEn || ex.industry || '—'}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {slots.map(time => (
                    <tr key={time}>
                      <td style={{position:'sticky', left:0, background:'var(--paper)', padding:'8px 14px', borderBottom:'1px solid var(--line-2)', borderRight:'1px solid var(--line)', zIndex:1}}>
                        <span className="mono tabular" style={{fontSize:12, fontWeight:500, color:'var(--ink-2)'}}>{time}</span>
                      </td>
                      {exhibitorsInProject.map(ex => {
                        const ms = meetingsAtCell(ex.id, time);
                        const cellKey = `${ex.id}|${time}`;
                        const isDropTarget = dropTarget === cellKey;
                        return (
                          <td key={ex.id}
                            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTarget(cellKey); }}
                            onDragLeave={e => { if (dropTarget === cellKey) setDropTarget(null); }}
                            onDrop={e => { e.preventDefault(); handleDrop(ex.id, time); }}
                            style={{
                              padding:4, borderBottom:'1px solid var(--line-2)', borderRight:'1px solid var(--line-2)',
                              verticalAlign:'top',
                              background: isDropTarget ? 'rgba(13,110,79,0.12)' : 'transparent',
                              transition:'background .1s',
                            }}>
                            <div style={{display:'flex', flexDirection:'column', gap:4}}>
                              {ms.map(m => {
                                const buyer = getBuyer(m.buyerId);
                                const dragging = draggingId === m.id;
                                // 미팅 출처에 따른 셀 색상 구분
                                const isExhibitor = m.source === 'exhibitor_self';
                                const isAdmin = m.source === 'admin_added' || m.source === 'admin_manual';
                                const isAuto = !isExhibitor && !isAdmin;
                                // 출처별 색상 — 셀 배경 통일
                                const bg = isExhibitor ? '#06B6D4'   // 청록 — 참가사
                                         : isAdmin ? '#F59E0B'        // 황금 — 관리자
                                         : '#6B7280';                  // 회색 — 자동
                                const fg = '#fff';
                                const sourceLabel = isExhibitor ? '참가사 등록'
                                                  : isAdmin ? '관리자 편성'
                                                  : '자동 생성 (CSV)';
                                return (
                                  <div key={m.id}
                                    draggable
                                    onDragStart={e => {
                                      if (readOnly) { e.preventDefault(); return; }
                                      setDraggingId(m.id);
                                      e.dataTransfer.effectAllowed = 'move';
                                      e.dataTransfer.setData('text/plain', m.id);
                                    }}
                                    onDragEnd={() => { setDraggingId(null); setDropTarget(null); }}
                                    onClick={()=>{ if (!readOnly) openEdit(m); }}
                                    style={{
                                      padding:'8px 10px',
                                      borderRadius:'var(--radius-sm)',
                                      cursor: readOnly ? 'default' : 'grab',
                                      background: bg, color: fg,
                                      transition:'all .15s', minHeight:34,
                                      display:'flex', alignItems:'center', justifyContent:'center',
                                      opacity: dragging ? 0.4 : 1,
                                      boxShadow: dragging ? 'none' : '0 1px 2px rgba(0,0,0,0.08)',
                                    }}
                                    title={readOnly
                                      ? `${buyer?.companyName || '—'} · ${buyer?.contactName || '—'}\n출처: ${sourceLabel}`
                                      : `${buyer?.companyName || '—'} · ${buyer?.contactName || '—'}\n출처: ${sourceLabel}\n드래그로 이동 · 클릭으로 편집`}>
                                    <div style={{fontSize:12, fontWeight:600, lineHeight:1.2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', width:'100%', textAlign:'center'}}>
                                      {buyer?.companyName || '—'}
                                    </div>
                                  </div>
                                );
                              })}
                              {!readOnly && (
                              <button onClick={()=>openNew(ex.id, time)} style={{
                                width:'100%', padding: ms.length > 0 ? '5px 10px' : '10px 12px',
                                minHeight: ms.length > 0 ? 24 : 38,
                                background:'transparent', border:'1px dashed var(--line-2)',
                                borderRadius:'var(--radius-sm)', cursor:'pointer',
                                color:'var(--muted-2)', fontFamily:'inherit',
                                display:'flex', alignItems:'center', justifyContent:'center', gap:5, fontSize:10.5,
                                transition:'all .15s',
                              }}
                              onMouseEnter={e=>{e.currentTarget.style.borderColor = projectColor(subProject).bg; e.currentTarget.style.color = projectColor(subProject).bg;}}
                              onMouseLeave={e=>{e.currentTarget.style.borderColor = 'var(--line-2)'; e.currentTarget.style.color = 'var(--muted-2)';}}
                              title={ms.length > 0 ? '이 슬롯에 추가 미팅 편성' : '클릭하여 미팅 추가'}>
                                <Plus size={ms.length > 0 ? 9 : 11}/>
                                {ms.length === 0 && <span>추가</span>}
                              </button>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* 상세/편집/신규 통합 모달 */}
      {modalMode && modalData && (
        <Modal title={modalMode === 'new' ? `미팅 추가 · ${subProject}` : `미팅 상세 / 편집 · ${subProject}`} onClose={closeModal}>
          <div style={{padding:'10px 14px', background:'var(--ivory-2)', fontSize:11.5, color:'var(--muted)', marginBottom:18, lineHeight:1.6, borderRadius:'var(--radius-sm)'}}>
            <div style={{display:'inline-flex', alignItems:'center', gap:6, padding:'2px 9px', background:'var(--purple-lt)', color:'var(--purple-dk)', borderRadius:3, fontWeight:700, fontSize:10.5, letterSpacing:'0.04em', marginRight:8, verticalAlign:'middle'}}>
              <Calendar size={10}/>{subProject}
            </div>
            {modalMode === 'new'
              ? `참가사를 선택하고 바이어 정보(회사명·바이어명·직급·이메일·연락처)를 직접 입력하세요. 등록되는 바이어는 ${subProject} 프로젝트에 자동 배정됩니다.`
              : '편집한 바이어 정보는 바이어 DB에도 동시에 반영됩니다.'}
          </div>

          <div className="grid" style={{gridTemplateColumns:'1fr 1fr', gap:16}}>
            <div>
              <label className="label">일자</label>
              <select className="select" value={modalData.date} onChange={e=>setModalData({...modalData, date:e.target.value})}>
                {config.dates.map(d => <option key={d.date} value={d.date}>{d.date} ({d.dow})</option>)}
              </select>
            </div>
            <div>
              <label className="label">시간</label>
              <select className="select" value={modalData.time} onChange={e=>setModalData({...modalData, time:e.target.value})}>
                {slots.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{gridColumn:'1 / -1'}}>
              <label className="label">참가사 <span style={{color:'var(--red)'}}>*</span></label>
              <select className="select" value={modalData.exhibitorId} onChange={e=>setModalData({...modalData, exhibitorId:e.target.value})}>
                <option value="">선택하세요</option>
                {exhibitorsInProject.map(ex => <option key={ex.id} value={ex.id}>{ex.companyName}</option>)}
              </select>
            </div>

            {/* 매칭 컨텍스트 패널 — 선택된 참가사 IP 메타 + 기존 바이어 선호 콘텐츠 */}
            {(() => {
              const selectedExhibitor = exhibitorsInProject.find(ex => ex.id === modalData.exhibitorId);
              const existingBuyer = modalData.buyerId ? fullState.buyers.find(b => b.id === modalData.buyerId) : null;
              const ips = (selectedExhibitor?.ips || []);
              if (!selectedExhibitor && !existingBuyer) return null;

              return (
                <div style={{gridColumn:'1 / -1', display:'grid', gridTemplateColumns: (ips.length > 0 && existingBuyer) ? '1fr 1fr' : '1fr', gap:10}}>
                  {/* 참가사 IP 메타 요약 */}
                  {selectedExhibitor && ips.length > 0 && (
                    <div style={{
                      padding:'10px 14px',
                      background:'rgba(46,196,230,0.06)',
                      border:'1px solid rgba(46,196,230,0.3)',
                      borderRadius:'var(--radius-sm)',
                    }}>
                      <div className="mono" style={{fontSize:9.5, letterSpacing:'0.15em', color:'var(--cyan-dk)', fontWeight:700, marginBottom:8}}>
                        PARTICIPANT IPS · {ips.length}개
                      </div>
                      <div style={{display:'flex', flexDirection:'column', gap:6, maxHeight:140, overflowY:'auto'}}>
                        {ips.map((ip, idx) => (
                          <div key={ip.id} style={{padding:'6px 10px', background:'#fff', borderRadius:'var(--radius-sm)', border:'1px solid var(--line-2)'}}>
                            <div style={{fontSize:11.5, fontWeight:600, color:'var(--ink)', marginBottom:3}}>
                              #{idx+1} {ip.name || '(제목 미입력)'}
                            </div>
                            <div style={{display:'flex', flexWrap:'wrap', gap:3}}>
                              {ip.genre && <span style={{fontSize:9.5, padding:'1px 6px', background:'var(--ivory-2)', borderRadius:3, color:'var(--ink-2)', fontWeight:500}}>{ip.genre}</span>}
                              {ip.format && <span style={{fontSize:9.5, padding:'1px 6px', background:'var(--ivory-2)', borderRadius:3, color:'var(--ink-2)', fontWeight:500}}>{ip.format}</span>}
                              {ip.targetAge && <span style={{fontSize:9.5, padding:'1px 6px', background:'var(--ivory-2)', borderRadius:3, color:'var(--ink-2)', fontWeight:500}}>{ip.targetAge}</span>}
                              {(ip.regions || []).slice(0, 3).map(r => {
                                const rg = REGIONS.find(x => x.key === r);
                                const lbl = rg?.label?.split(' · ')[0] || r;
                                const ww = r === 'WW';
                                return <span key={r} style={{fontSize:9.5, padding:'1px 6px', background: ww ? 'var(--ink)' : 'var(--ivory-2)', color: ww ? '#fff' : 'var(--ink-2)', borderRadius:3, fontWeight:600}}>{lbl}</span>;
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 바이어 선호 콘텐츠 (편집 모드에서만 노출) */}
                  {existingBuyer && (
                    <PreferredContentFull buyer={existingBuyer} compact/>
                  )}
                </div>
              );
            })()}

            {/* 바이어 정보 — 수동 입력 */}
            <div style={{gridColumn:'1 / -1', padding:'14px 16px', background:'var(--ivory-2)', borderRadius:'var(--radius-sm)', marginTop:4}}>
              <div className="mono" style={{fontSize:10, letterSpacing:'0.15em', color:'var(--muted)', marginBottom:10}}>BUYER INFO · 수동 입력</div>
              <div className="grid" style={{gridTemplateColumns:'1fr 1fr', gap:12}}>
                <div style={{gridColumn:'1 / -1'}}>
                  <label className="label">회사명 <span style={{color:'var(--red)'}}>*</span></label>
                  <input className="input" value={modalData._companyName}
                         onChange={e=>setModalData({...modalData, _companyName:e.target.value})}
                         placeholder="예: Netflix Japan, BBC Studios"
                         style={{background:'var(--paper)'}}/>
                </div>
                <div>
                  <label className="label">바이어명 (담당자)</label>
                  <input className="input" value={modalData._contactName}
                         onChange={e=>setModalData({...modalData, _contactName:e.target.value})}
                         placeholder="예: John Doe"
                         style={{background:'var(--paper)'}}/>
                </div>
                <div>
                  <label className="label">직급</label>
                  <input className="input" value={modalData._position}
                         onChange={e=>setModalData({...modalData, _position:e.target.value})}
                         placeholder="예: Head of Content"
                         style={{background:'var(--paper)'}}/>
                </div>
                <div>
                  <label className="label">이메일</label>
                  <input className="input" type="email" value={modalData._email}
                         onChange={e=>setModalData({...modalData, _email:e.target.value})}
                         placeholder="john@example.com"
                         style={{background:'var(--paper)'}}/>
                </div>
                <div>
                  <label className="label">연락처</label>
                  <input className="input" value={modalData._phone}
                         onChange={e=>setModalData({...modalData, _phone:e.target.value})}
                         placeholder="+1-310-555-0100"
                         style={{background:'var(--paper)'}}/>
                </div>
              </div>
            </div>

            <div>
              <label className="label">테이블</label>
              <input className="input" value={modalData.table}
                     onChange={e=>setModalData({...modalData, table:e.target.value})}
                     placeholder="자동 배정 시 비워두세요"/>
            </div>
            <div>
              <label className="label">상태</label>
              <select className="select" value={modalData.status} onChange={e=>setModalData({...modalData, status:e.target.value})}>
                <option value="confirmed">확정</option>
                <option value="tentative">조율중</option>
                <option value="cancelled">취소</option>
              </select>
            </div>
            <div style={{gridColumn:'1 / -1'}}>
              <label className="label">미팅 메모</label>
              <textarea className="textarea" rows={2} value={modalData.notes || ''}
                        onChange={e=>setModalData({...modalData, notes:e.target.value})}
                        placeholder="예: NDA 준비, 피치덱 v3.2"/>
            </div>
          </div>

          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, marginTop:24}}>
            {modalMode === 'edit' ? (
              <button className="btn btn-danger" onClick={deleteMeeting}><Trash2 size={13}/>미팅 삭제</button>
            ) : <div/>}
            <div style={{display:'flex', gap:8}}>
              <button className="btn btn-ghost" onClick={closeModal}>취소</button>
              <button className="btn btn-primary" onClick={saveModal}><Save size={14}/>{modalMode === 'new' ? '미팅 추가' : '저장'}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* 삭제 확인 모달 */}
      {confirmData && (
        <Modal title={confirmData.title} onClose={()=>setConfirmData(null)}>
          <div style={{fontSize:13.5, lineHeight:1.7, color:'var(--ink-2)', padding:'4px 0 8px'}}>{confirmData.message}</div>
          <div style={{display:'flex', justifyContent:'flex-end', gap:8, marginTop:24}}>
            <button className="btn btn-ghost" onClick={()=>setConfirmData(null)}>취소</button>
            <button className="btn btn-danger" onClick={()=>{try{confirmData.onConfirm();}finally{setConfirmData(null);}}}>
              <Trash2 size={13}/>삭제
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------------- MATCH MATRIX ----------------
function MatchMatrixTab({state, fullState, project}){
  const projects = ['MIFA','MIPCOM','CANADA'];
  const defaultProject = project === 'ALL' ? 'MIFA' : project;
  const [subProject, setSubProject] = useState(defaultProject);
  const [selectedParticipantId, setSelectedParticipantId] = useState(null);
  const [selectedCell, setSelectedCell] = useState(null);  // { ipId, buyerId, detail }

  // 해당 행사의 참가사·바이어·미팅 필터
  const participants = useMemo(
    () => fullState.exhibitors.filter(e => e.project === subProject),
    [fullState.exhibitors, subProject]
  );

  const buyers = useMemo(
    () => fullState.buyers.filter(b => b.project === subProject && b.invitationStatus === 'accepted'),
    [fullState.buyers, subProject]
  );

  // 참가사 변경 시 첫 참가사 자동 선택
  useEffect(() => {
    if (!selectedParticipantId || !participants.find(p => p.id === selectedParticipantId)) {
      setSelectedParticipantId(participants[0]?.id || null);
    }
  }, [participants, selectedParticipantId]);

  const selectedParticipant = participants.find(p => p.id === selectedParticipantId);
  const ips = (selectedParticipant?.ips || []);

  // 미팅 편성 여부 조회 헬퍼
  const hasMeeting = (buyerId) => {
    if (!selectedParticipant) return false;
    return fullState.meetings.some(m => m.exhibitorId === selectedParticipant.id && m.buyerId === buyerId);
  };

  return (
    <div className="fade-in">
      <SectionHeader eyebrow="ANALYTICS / IP × BUYER MATRIX" title="바이어 매칭 매트릭스"
        desc="참가사의 각 IP별로 회신 완료 바이어와의 매칭 적합도를 분석합니다. 희망 카테고리 순위(60점) + 권역·장르·포맷·타겟연령 각 10점의 raw 점수를 합산 후 100점 기준으로 백분율 환산됩니다. 셀 클릭 시 점수 상세 근거를 확인할 수 있습니다." />

      <div className="desktop-recommended" style={{display:'none'}}>
        매칭 매트릭스는 가로로 넓은 화면에서 가장 잘 보입니다. 정확한 분석을 원하시면 PC에서 접속해주세요. 폰에서는 가로 스크롤로 확인 가능합니다.
      </div>

      {/* 행사 서브 스위처 */}
      <div style={{display:'flex', gap:8, marginTop:24, marginBottom:16}}>
        {projects.map(p => {
          const active = subProject === p;
          const col = projectColor(p);
          const cnt = fullState.exhibitors.filter(e => e.project === p).length;
          return (
            <button key={p} onClick={()=>setSubProject(p)} style={{
              padding:'9px 18px', borderRadius:'var(--radius-sm)', cursor:'pointer',
              border: active ? `1px solid ${col.bg}` : '1px solid var(--line)',
              background: active ? col.bg : 'var(--paper)',
              color: active ? col.fg : 'var(--ink-2)',
              fontSize:13, fontWeight:600, fontFamily:'inherit',
              display:'inline-flex', alignItems:'center', gap:8,
              letterSpacing:'-0.005em', transition:'all .15s',
            }}>
              {p}
              <span className="mono tabular" style={{fontSize:10.5, opacity: active ? 0.8 : 0.55, padding:'1px 7px', background: active ? 'rgba(0,0,0,0.18)' : 'var(--ivory-2)', borderRadius:4}}>{cnt}</span>
            </button>
          );
        })}
      </div>

      {/* 참가사 선택 */}
      {participants.length > 0 && (
        <div className="card" style={{padding:16, marginBottom:16, display:'flex', alignItems:'center', gap:14, flexWrap:'wrap'}}>
          <div className="mono" style={{fontSize:11, letterSpacing:'0.18em', color:'var(--muted)', fontWeight:600}}>PARTICIPANT</div>
          <div style={{display:'flex', gap:6, flexWrap:'wrap', flex:1}}>
            {participants.map(p => {
              const active = selectedParticipantId === p.id;
              const ipCount = (p.ips || []).length;
              return (
                <button key={p.id} onClick={()=>{setSelectedParticipantId(p.id); setSelectedCell(null);}}
                  style={{
                    padding:'7px 14px', borderRadius:'var(--radius-sm)', cursor:'pointer',
                    border: active ? '1px solid var(--purple)' : '1px solid var(--line)',
                    background: active ? 'var(--purple-lt)' : 'var(--paper)',
                    color: active ? 'var(--purple-dk)' : 'var(--ink-2)',
                    fontSize:12.5, fontWeight: active ? 700 : 500, fontFamily:'inherit',
                    display:'inline-flex', alignItems:'center', gap:7,
                    transition:'all .15s',
                  }}>
                  {p.companyName}
                  <span className="mono tabular" style={{fontSize:10, padding:'1px 6px', background: active ? 'var(--purple)' : 'var(--ivory-2)', color: active ? '#fff' : 'var(--muted)', borderRadius:3}}>
                    {ipCount} IP
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 데이터 없음 케이스 */}
      {participants.length === 0 ? (
        <div className="card" style={{padding:52, textAlign:'center', color:'var(--muted)', fontSize:13.5}}>
          {subProject} 행사에 등록된 참가사가 없습니다.
        </div>
      ) : buyers.length === 0 ? (
        <div className="card" style={{padding:52, textAlign:'center', color:'var(--muted)', fontSize:13.5}}>
          {subProject} 행사에 RSVP 회신 완료된 바이어가 없습니다.<br/>
          <span style={{fontSize:12, color:'var(--muted-2)'}}>RSVP 탭에서 바이어 CSV를 업로드하거나 수동 등록하세요.</span>
        </div>
      ) : ips.length === 0 ? (
        <div className="card" style={{padding:52, textAlign:'center', color:'var(--muted)', fontSize:13.5}}>
          <strong>{selectedParticipant?.companyName}</strong>에 등록된 IP가 없습니다.<br/>
          <span style={{fontSize:12, color:'var(--muted-2)'}}>참가사 포털 → IP 관리 탭에서 IP를 먼저 등록해주세요.</span>
        </div>
      ) : (
        <>
          {/* 스코어링 레전드 */}
          <div className="card" style={{padding:'14px 18px', marginBottom:16, display:'flex', alignItems:'center', gap:14, flexWrap:'wrap', fontSize:11.5}}>
            <span className="mono" style={{letterSpacing:'0.15em', color:'var(--muted)', fontWeight:600}}>SCORE TIERS</span>
            {[
              { range:'80-100', label:'Excellent', bg:'#8B5CF6' },
              { range:'60-79',  label:'Strong',    bg:'#A78BFA' },
              { range:'40-59',  label:'Moderate',  bg:'#DDD6FE' },
              { range:'20-39',  label:'Weak',      bg:'#EDE9FE' },
              { range:'0-19',   label:'No Match',  bg:'#F5F3FF' },
            ].map(t => (
              <div key={t.label} style={{display:'flex', alignItems:'center', gap:6}}>
                <div style={{width:18, height:14, background:t.bg, borderRadius:3, border:'1px solid var(--line)'}}/>
                <span style={{fontWeight:500, color:'var(--ink-2)'}}>{t.label}</span>
                <span className="mono tabular" style={{fontSize:10, color:'var(--muted)'}}>{t.range}</span>
              </div>
            ))}
            <div style={{marginLeft:'auto', display:'flex', alignItems:'center', gap:6, color:'var(--muted)'}}>
              <div style={{width:8, height:8, borderRadius:'50%', background: projectColor(subProject).bg, boxShadow:`0 0 6px ${projectColor(subProject).bg}66`}}/>
              <span style={{fontSize:11}}>미팅 편성됨</span>
            </div>
          </div>

          {/* IP별 매트릭스 카드 반복 */}
          <div style={{display:'flex', flexDirection:'column', gap:20}}>
            {ips.map((ip, idx) => (
              <IpMatrixCard
                key={ip.id}
                ip={ip}
                ipIndex={idx}
                buyers={buyers}
                hasMeeting={hasMeeting}
                selectedCell={selectedCell}
                setSelectedCell={setSelectedCell}
                participantName={selectedParticipant.companyName}
                subProject={subProject}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// 개별 IP에 대한 바이어 매트릭스 카드 (신규)
// ============================================================================
function IpMatrixCard({ip, ipIndex, buyers, hasMeeting, selectedCell, setSelectedCell, participantName, subProject}){
  // 바이어별 점수 계산
  const scored = useMemo(() => (
    buyers.map(buyer => ({ buyer, ...ipBuyerMatchScore(ip, buyer) }))
          .sort((a, b) => b.score - a.score)
  ), [ip, buyers]);

  // 상세 선택된 셀
  const sel = selectedCell && selectedCell.ipId === ip.id ? selectedCell : null;
  const selBuyer = sel ? scored.find(r => r.buyer.id === sel.buyerId) : null;

  // 통계
  const excellent = scored.filter(r => r.score >= 80).length;
  const strong    = scored.filter(r => r.score >= 60 && r.score < 80).length;
  const moderate  = scored.filter(r => r.score >= 40 && r.score < 60).length;
  const avgScore  = scored.length > 0 ? Math.round(scored.reduce((a, r) => a + r.score, 0) / scored.length) : 0;

  return (
    <div className="card" style={{padding:0, overflow:'hidden'}}>
      {/* IP 헤더 */}
      <div style={{
        padding:'18px 22px',
        background:'linear-gradient(90deg, rgba(139,92,246,0.05), rgba(232,121,249,0.05))',
        borderBottom:'1px solid var(--line)',
      }}>
        <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, flexWrap:'wrap'}}>
          <div style={{flex:1, minWidth:240}}>
            <div className="mono" style={{fontSize:10, letterSpacing:'0.18em', color:'var(--purple-dk)', fontWeight:700, marginBottom:4}}>
              IP #{String(ipIndex+1).padStart(2,'0')} · {participantName}
            </div>
            <div className="serif" style={{fontSize:20, fontWeight:700, letterSpacing:'-0.02em', color:'var(--ink)', marginBottom:4}}>
              {ip.name || <span style={{color:'var(--muted-2)'}}>제목 미입력</span>}
            </div>
            {ip.nameEn && <div style={{fontSize:12.5, color:'var(--muted)'}}>{ip.nameEn}</div>}
            {/* 메타 칩 */}
            <div style={{display:'flex', gap:5, flexWrap:'wrap', marginTop:10}}>
              {ip.genre && <span className="chip" style={{background:'var(--paper)'}}>{ip.genre}</span>}
              {ip.format && <span className="chip" style={{background:'var(--paper)'}}>{ip.format}</span>}
              {ip.targetAge && <span className="chip" style={{background:'var(--paper)'}}>{ip.targetAge}</span>}
              {(ip.regions || []).slice(0,3).map(r => {
                const reg = REGIONS.find(x => x.key === r);
                const ww = r === 'WW';
                return <span key={r} className="chip" style={{fontSize:10.5, background:ww?'var(--ink)':'var(--paper)', color:ww?'#fff':'var(--ink)', borderColor:ww?'var(--ink)':'var(--line)'}}>{reg?.label?.split(' · ')[0] || r}</span>;
              })}
              {(ip.regions || []).length > 3 && <span className="chip" style={{fontSize:10, background:'var(--paper)'}}>+{ip.regions.length - 3}</span>}
            </div>
          </div>

          {/* 통계 요약 */}
          <div style={{display:'flex', gap:8, alignItems:'center'}}>
            <StatMini value={excellent} label="Excellent" color="#8B5CF6"/>
            <StatMini value={strong}    label="Strong"    color="#A78BFA"/>
            <StatMini value={moderate}  label="Moderate"  color="#DDD6FE" fgColor="#4C1D95"/>
            <div style={{width:1, height:32, background:'var(--line)', margin:'0 4px'}}/>
            <div style={{textAlign:'right'}}>
              <div className="mono" style={{fontSize:9.5, letterSpacing:'0.12em', color:'var(--muted)', fontWeight:600}}>AVG SCORE</div>
              <div className="tabular" style={{fontSize:20, fontWeight:700, color:'var(--purple-dk)', lineHeight:1.1, marginTop:2}}>{avgScore}</div>
            </div>
          </div>
        </div>

        {/* 희망 바이어 순위 표시 */}
        <div style={{marginTop:14, padding:'10px 14px', background:'rgba(255,255,255,0.7)', borderRadius:'var(--radius-sm)', border:'1px solid var(--line-2)'}}>
          <div className="mono" style={{fontSize:9.5, letterSpacing:'0.15em', color:'var(--muted)', marginBottom:6, fontWeight:600}}>희망 바이어 카테고리 (순위별 배점)</div>
          <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
            {(ip.desiredBuyerPriority || ['','','','']).map((cat, i) => {
              const points = [60, 45, 30, 15][i];
              const has = !!cat;
              const otherText = ip.desiredBuyerPriorityOther?.[i];
              const isOther = cat === '기타 (Others)';
              const display = !has ? '미설정' : isOther ? (otherText ? `기타 · ${otherText}` : '기타') : cat;
              return (
                <div key={i} style={{
                  display:'inline-flex', alignItems:'center', gap:6,
                  padding:'4px 10px', borderRadius:999, fontSize:11,
                  background: has ? 'var(--purple-lt)' : 'var(--ivory-2)',
                  border: has ? '1px solid var(--purple)' : '1px solid var(--line)',
                  color: has ? 'var(--purple-dk)' : 'var(--muted-2)',
                }}>
                  <span className="mono" style={{fontSize:9, fontWeight:700, padding:'1px 5px', background:has?'var(--purple)':'var(--muted-2)', color:'#fff', borderRadius:2}}>{i+1}순위</span>
                  <span style={{fontWeight: has ? 600 : 400}}>{display}</span>
                  <span className="mono tabular" style={{fontSize:9, color:has?'var(--purple)':'var(--muted-2)', fontWeight:700}}>{points}pt</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 매트릭스 테이블 */}
      <div style={{overflow:'auto', maxHeight:520}}>
        <table style={{width:'100%', borderCollapse:'collapse', fontSize:12}}>
          <thead>
            <tr>
              <th style={{position:'sticky', left:0, top:0, zIndex:3, background:'var(--paper)', padding:'10px 12px', textAlign:'left', borderBottom:'1px solid var(--line)', minWidth:40, fontSize:10}}>
                #
              </th>
              <th style={{position:'sticky', top:0, zIndex:2, background:'var(--paper)', padding:'10px 12px', textAlign:'left', borderBottom:'1px solid var(--line)', minWidth:180}}>
                <span className="mono" style={{fontSize:10, letterSpacing:'0.15em', color:'var(--muted)', fontWeight:600}}>BUYER</span>
              </th>
              <th style={{position:'sticky', top:0, zIndex:2, background:'var(--paper)', padding:'10px 12px', textAlign:'left', borderBottom:'1px solid var(--line)', minWidth:120}}>
                <span className="mono" style={{fontSize:10, letterSpacing:'0.15em', color:'var(--muted)', fontWeight:600}}>CATEGORY</span>
              </th>
              <th style={{position:'sticky', top:0, zIndex:2, background:'var(--paper)', padding:'10px 12px', textAlign:'center', borderBottom:'1px solid var(--line)', minWidth:60}}>
                <span className="mono" style={{fontSize:10, letterSpacing:'0.15em', color:'var(--muted)', fontWeight:600}}>REGION</span>
              </th>
              <th style={{position:'sticky', top:0, zIndex:2, background:'var(--paper)', padding:'10px 12px', textAlign:'center', borderBottom:'1px solid var(--line)', minWidth:70, borderLeft:'1px dashed var(--line)'}}>
                <span className="mono" style={{fontSize:10, letterSpacing:'0.15em', color:'var(--muted)', fontWeight:600}}>희망순위</span>
              </th>
              <th style={{position:'sticky', top:0, zIndex:2, background:'var(--paper)', padding:'10px 12px', textAlign:'center', borderBottom:'1px solid var(--line)', minWidth:70}}>
                <span className="mono" style={{fontSize:10, letterSpacing:'0.15em', color:'var(--muted)', fontWeight:600}}>권역</span>
              </th>
              <th style={{position:'sticky', top:0, zIndex:2, background:'var(--paper)', padding:'10px 12px', textAlign:'center', borderBottom:'1px solid var(--line)', minWidth:60}}>
                <span className="mono" style={{fontSize:10, letterSpacing:'0.15em', color:'var(--muted)', fontWeight:600}}>장르</span>
              </th>
              <th style={{position:'sticky', top:0, zIndex:2, background:'var(--paper)', padding:'10px 12px', textAlign:'center', borderBottom:'1px solid var(--line)', minWidth:60}}>
                <span className="mono" style={{fontSize:10, letterSpacing:'0.15em', color:'var(--muted)', fontWeight:600}}>포맷</span>
              </th>
              <th style={{position:'sticky', top:0, zIndex:2, background:'var(--paper)', padding:'10px 12px', textAlign:'center', borderBottom:'1px solid var(--line)', minWidth:70}}>
                <span className="mono" style={{fontSize:10, letterSpacing:'0.15em', color:'var(--muted)', fontWeight:600}}>타겟연령</span>
              </th>
              <th style={{position:'sticky', top:0, zIndex:2, background:'var(--paper)', padding:'10px 12px', textAlign:'center', borderBottom:'1px solid var(--line)', minWidth:90, borderLeft:'1px dashed var(--line)'}}>
                <span className="mono" style={{fontSize:10, letterSpacing:'0.15em', color:'var(--muted)', fontWeight:600}}>TOTAL</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {scored.map(({buyer, score, raw, scoreA, scoreB, scoreC, scoreD, scoreE, detail}, rank) => {
              const tier = ipMatchTier(score);
              const meeting = hasMeeting(buyer.id);
              const isSelected = sel && sel.buyerId === buyer.id;
              const cats = getBuyerCategories(buyer);
              const buyerRegion = getBuyerRegion(buyer.country);
              const regionLabel = buyerRegion ? (REGIONS.find(r => r.key === buyerRegion)?.label?.split(' · ')[0] || buyerRegion) : '—';

              return (
                <tr
                  key={buyer.id}
                  onClick={() => setSelectedCell(isSelected ? null : { ipId: ip.id, buyerId: buyer.id, detail })}
                  style={{
                    cursor:'pointer',
                    background: isSelected ? 'var(--purple-lt)' : (rank % 2 === 0 ? 'var(--paper)' : 'var(--ivory)'),
                    borderLeft: isSelected ? '3px solid var(--purple)' : '3px solid transparent',
                    transition:'background .12s',
                  }}
                >
                  <td className="tabular" style={{padding:'10px 12px', borderBottom:'1px solid var(--line-2)', fontSize:11, color:'var(--muted)', fontWeight:600}}>{rank+1}</td>

                  <td style={{padding:'10px 12px', borderBottom:'1px solid var(--line-2)'}}>
                    <div style={{display:'flex', alignItems:'center', gap:6}}>
                      <span style={{fontWeight:600, fontSize:13, color:'var(--ink)'}}>{buyer.companyName}</span>
                      {meeting && <span title="미팅 편성됨" style={{width:7, height:7, borderRadius:'50%', background:projectColor(subProject).bg, boxShadow:`0 0 5px ${projectColor(subProject).bg}`}}/>}
                    </div>
                    {buyer.contactName && <div style={{fontSize:10.5, color:'var(--muted)', marginTop:2}}>{buyer.contactName}{buyer.position && ` · ${buyer.position}`}</div>}
                  </td>

                  <td style={{padding:'10px 12px', borderBottom:'1px solid var(--line-2)'}}>
                    <CategoriesBadges buyer={buyer} maxShow={1}/>
                  </td>

                  <td style={{padding:'10px 12px', borderBottom:'1px solid var(--line-2)', textAlign:'center', fontSize:11.5}}>
                    <div style={{color:'var(--ink-2)', fontWeight:500}}>{buyer.country || '—'}</div>
                    <div className="mono" style={{fontSize:9.5, color:'var(--muted-2)', marginTop:1}}>{regionLabel}</div>
                  </td>

                  {/* Score breakdown */}
                  <ScoreCell value={detail.priorityScore} bonus={detail.priorityBonus}
                    label={detail.priority ? `${detail.priority}순위` : ''}
                    maxPoint={60}
                    borderLeft
                  />
                  <ScoreCell value={detail.regionScore} maxPoint={20} hit={detail.region}/>
                  <ScoreCell value={detail.genreScore} maxPoint={10} hit={detail.genre}/>
                  <ScoreCell value={detail.formatScore} maxPoint={10} hit={detail.format}/>
                  <ScoreCell value={detail.targetAgeScore} maxPoint={10} hit={detail.targetAge}/>

                  {/* Total */}
                  <td style={{padding:0, borderBottom:'1px solid var(--line-2)', borderLeft:'1px dashed var(--line)', textAlign:'center'}}>
                    <div style={{
                      margin:'6px auto',
                      display:'inline-flex', alignItems:'center', justifyContent:'center',
                      minWidth:54, padding:'6px 10px',
                      background: tier.bg,
                      color: tier.fg,
                      borderRadius:6,
                      fontWeight:700, fontSize:14,
                      boxShadow: tier.glow !== 'none' ? `0 2px 8px ${tier.glow}` : 'none',
                    }} className="tabular">
                      {score}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 상세 근거 패널 */}
      {sel && selBuyer && (
        <div style={{
          padding:'16px 22px',
          background:'var(--purple-lt)',
          borderTop:'1px solid var(--purple)',
        }}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:16, flexWrap:'wrap'}}>
            <div>
              <div className="mono" style={{fontSize:9.5, letterSpacing:'0.15em', color:'var(--purple-dk)', fontWeight:700, marginBottom:4}}>
                MATCH DETAIL · {ip.name || 'IP'} × {selBuyer.buyer.companyName}
              </div>
              <div style={{display:'flex', gap:8, alignItems:'center', marginBottom:10}}>
                <span className="serif tabular" style={{fontSize:28, fontWeight:700, color:'var(--purple-dk)'}}>{selBuyer.score}</span>
                <span style={{fontSize:13, color:'var(--muted)'}}> / 100</span>
                <span style={{marginLeft:8, padding:'3px 9px', background:ipMatchTier(selBuyer.score).bg, color:ipMatchTier(selBuyer.score).fg, borderRadius:4, fontSize:10.5, fontWeight:700, letterSpacing:'0.08em'}}>
                  {ipMatchTier(selBuyer.score).label}
                </span>
              </div>
              <div style={{fontSize:11.5, color:'var(--muted)', marginBottom:3, display:'flex', flexWrap:'wrap', gap:'4px 12px'}}>
                <span><span style={{fontWeight:600, color:'var(--ink-2)'}}>희망 카테고리</span> {selBuyer.scoreA}/65</span>
                <span><span style={{fontWeight:600, color:'var(--ink-2)'}}>권역</span> {selBuyer.scoreB}/10</span>
                <span><span style={{fontWeight:600, color:'var(--ink-2)'}}>장르</span> {selBuyer.scoreC}/10</span>
                <span><span style={{fontWeight:600, color:'var(--ink-2)'}}>포맷</span> {selBuyer.scoreD}/10</span>
                <span><span style={{fontWeight:600, color:'var(--ink-2)'}}>타겟연령</span> {selBuyer.scoreE}/10</span>
              </div>
              <div style={{fontSize:10.5, color:'var(--muted-2)', marginBottom:6, fontStyle:'italic'}}>
                Raw {selBuyer.raw}/105 → {selBuyer.score}/100 (백분율 환산)
              </div>
              <ul style={{margin:'8px 0 0', padding:'0 0 0 16px', fontSize:12, color:'var(--ink-2)', lineHeight:1.7}}>
                {selBuyer.reasons.length > 0
                  ? selBuyer.reasons.map((r, i) => <li key={i}>{r}</li>)
                  : <li style={{color:'var(--muted)'}}>해당 바이어와의 매칭 포인트가 발견되지 않았습니다.</li>}
              </ul>
            </div>
            <button className="btn btn-ghost" style={{padding:'6px 10px', fontSize:11}} onClick={()=>setSelectedCell(null)}>
              <X size={12}/>닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// 상단 통계용 작은 배지
function StatMini({value, label, color, fgColor}){
  return (
    <div style={{
      padding:'6px 10px', borderRadius:6, background:color, color: fgColor || '#fff',
      display:'flex', alignItems:'center', gap:6, minWidth:54, textAlign:'center',
      boxShadow:`0 2px 6px ${color}40`,
    }}>
      <span className="tabular" style={{fontSize:16, fontWeight:700, lineHeight:1}}>{value}</span>
      <span style={{fontSize:9, opacity:0.9, letterSpacing:'0.04em', fontWeight:600}}>{label}</span>
    </div>
  );
}

// 점수 셀 — 점수+보너스를 시각적으로 표현
function ScoreCell({value, maxPoint, label, bonus, hit, borderLeft}){
  const active = value > 0;
  const intensity = maxPoint > 0 ? value / maxPoint : 0;
  return (
    <td style={{
      padding:'10px 8px', borderBottom:'1px solid var(--line-2)',
      borderLeft: borderLeft ? '1px dashed var(--line)' : 'none',
      textAlign:'center',
      background: active ? `rgba(139,92,246,${0.05 + intensity*0.15})` : 'transparent',
    }}>
      <div style={{
        fontWeight:600, fontSize:13,
        color: active ? 'var(--purple-dk)' : 'var(--muted-2)',
      }} className="tabular">
        {value > 0 ? `+${value}` : '—'}
        {bonus > 0 && <span style={{fontSize:10, color:'var(--magenta-dk)', marginLeft:3, fontWeight:700}}>+{bonus}</span>}
      </div>
      {label && active && (
        <div style={{fontSize:9, color:'var(--purple)', marginTop:2, fontWeight:700, letterSpacing:'0.04em'}}>{label}</div>
      )}
      {hit !== undefined && !active && (
        <div style={{fontSize:9, color:'var(--muted-2)', marginTop:2}}>×</div>
      )}
    </td>
  );
}


// ============================================================================
// IMAGE / ASSET COMPONENTS
// ============================================================================

function AsyncThumb({imgKey, size=56, onClick}){
  const [data, setData] = useState(null);
  useEffect(() => { let cancelled=false; loadBlob(imgKey).then(d => !cancelled && setData(d)); return () => {cancelled=true;}; }, [imgKey]);
  return (
    <div onClick={onClick} style={{
      width:size, height:size, background:'var(--ivory-2)', borderRadius:'var(--radius-sm)',
      overflow:'hidden', flexShrink:0, border:'1px solid var(--line)',
      cursor: onClick ? 'pointer' : 'default', position:'relative',
    }}>
      {data ? <img src={data.data} style={{width:'100%', height:'100%', objectFit:'cover'}} alt=""/>
            : <div style={{display:'grid', placeItems:'center', height:'100%', color:'var(--muted-2)', fontSize:10}}>···</div>}
    </div>
  );
}

function LogoUploader({me, update}){
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!me.logoKey) { setPreview(null); return; }
    let cancelled=false;
    loadBlob(me.logoKey).then(d => !cancelled && setPreview(d));
    return () => {cancelled=true;};
  }, [me.logoKey, me.id]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('이미지 파일만 업로드 가능합니다.'); return; }
    if (file.size > MAX_IMG_BYTES) {
      alert(
        `이미지 용량이 한도를 초과했습니다.\n` +
        `\n` +
        `• 현재 파일: ${formatBytes(file.size)}\n` +
        `• 허용 한도: 50MB\n` +
        `\n` +
        `해결 방법:\n` +
        `1. 이미지 압축 사이트 이용: tinypng.com, squoosh.app\n` +
        `2. 이미지 크기 축소 (4000×4000px 이하 권장)\n` +
        `3. JPG 형식으로 저장 (PNG보다 용량 작음)`
      );
      return;
    }
    setBusy(true);
    try {
      // 기존 로고 있으면 삭제
      if (me.logoKey) await deleteBlob(me.logoKey);
      const key = `img:logo:${me.id}`;
      const payload = await saveBlob(key, file);
      update(s => ({...s, exhibitors: s.exhibitors.map(x => x.id===me.id ? {
        ...x, logoKey: key, logoMeta: { name: payload.name, type: payload.type, size: payload.size }
      } : x)}));
      setPreview(payload);
    } catch (err) {
      alert('업로드 실패: ' + (err.message || err));
    }
    setBusy(false);
  };

  const handleRemove = async () => {
    if (!confirm('로고를 삭제하시겠습니까?')) return;
    if (me.logoKey) await deleteBlob(me.logoKey);
    update(s => ({...s, exhibitors: s.exhibitors.map(x => x.id===me.id ? {
      ...x, logoKey: null, logoMeta: null
    } : x)}));
    setPreview(null);
  };

  return (
    <div>
      {preview ? (
        <div style={{display:'flex', gap:20, alignItems:'center'}}>
          <div style={{width:140, height:140, background:'var(--ivory-2)', borderRadius:'var(--radius)', display:'grid', placeItems:'center', overflow:'hidden', border:'1px solid var(--line)', flexShrink:0}}>
            <img src={preview.data} style={{maxWidth:'100%', maxHeight:'100%', objectFit:'contain'}} alt="logo"/>
          </div>
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontSize:14, fontWeight:600, wordBreak:'break-all'}}>{preview.name}</div>
            <div style={{fontSize:11.5, color:'var(--muted)', marginTop:3}}>
              {preview.type || 'image'} · {formatBytes(preview.size)}
            </div>
            <div style={{display:'flex', gap:8, marginTop:14}}>
              <button className="btn btn-ghost" onClick={()=>inputRef.current?.click()} disabled={busy}><Upload size={12}/>교체</button>
              <button className="btn btn-danger" onClick={handleRemove} disabled={busy}><Trash2 size={12}/>삭제</button>
            </div>
          </div>
        </div>
      ) : (
        <button onClick={()=>inputRef.current?.click()} disabled={busy} style={{
          width:'100%', padding:32, border:'1px dashed var(--line)', borderRadius:'var(--radius)',
          textAlign:'center', background:'var(--ivory-2)', cursor:'pointer', fontFamily:'inherit',
          color:'var(--muted)', display:'flex', flexDirection:'column', alignItems:'center', gap:10,
        }}>
          <Upload size={22}/>
          <div style={{fontSize:13.5, color:'var(--ink)', fontWeight:500}}>클릭하여 로고 업로드</div>
          <div style={{fontSize:11.5}}>PNG / JPG / SVG · 50MB 이하 · 정사각형 권장</div>
          {busy && <div style={{fontSize:11}}>업로드 중…</div>}
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" style={{display:'none'}} onChange={handleUpload}/>
    </div>
  );
}

function IPImageUploader({form, setForm}){
  const inputRef = useRef(null);
  const [previews, setPreviews] = useState({});
  const [busy, setBusy] = useState(false);

  const images = form.images || [];

  useEffect(() => {
    let cancelled = false;
    Promise.all(images.map(async img => {
      const data = await loadBlob(img.key);
      return { key: img.key, data };
    })).then(results => {
      if (cancelled) return;
      const map = {};
      results.forEach(r => { if (r.data) map[r.key] = r.data; });
      setPreviews(map);
    });
    return () => { cancelled = true; };
  }, [images.length]);

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    setBusy(true);
    const newImgs = [];
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > MAX_IMG_BYTES) {
        alert(
          `"${file.name}" 파일이 50MB를 초과합니다 (현재 ${formatBytes(file.size)}).\n` +
          `\n` +
          `이 파일은 건너뛰고 나머지 파일만 업로드합니다.\n` +
          `\n` +
          `용량을 줄이려면 tinypng.com, squoosh.app 같은 압축 사이트를 이용하세요.`
        );
        continue;
      }
      const key = `img:ip:${form.id}:${Date.now()}:${Math.random().toString(36).slice(2,7)}`;
      try {
        const payload = await saveBlob(key, file);
        newImgs.push({ key, name: payload.name, type: payload.type, size: payload.size });
        setPreviews(p => ({...p, [key]: payload}));
      } catch (err) {
        alert(`${file.name} 업로드 실패: ` + (err.message || err));
      }
    }
    if (newImgs.length > 0) setForm({...form, images: [...images, ...newImgs]});
    setBusy(false);
  };

  const removeImage = async (key) => {
    await deleteBlob(key);
    setForm({...form, images: images.filter(i => i.key !== key)});
    setPreviews(p => { const n = {...p}; delete n[key]; return n; });
  };

  return (
    <div>
      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(110px, 1fr))', gap:8}}>
        {images.map(img => {
          const data = previews[img.key];
          return (
            <div key={img.key} style={{position:'relative', aspectRatio:'1', border:'1px solid var(--line)', borderRadius:'var(--radius-sm)', overflow:'hidden', background:'var(--ivory-2)'}}>
              {data
                ? <img src={data.data} style={{width:'100%', height:'100%', objectFit:'cover'}} alt=""/>
                : <div style={{display:'grid', placeItems:'center', height:'100%', color:'var(--muted)', fontSize:10}}>로딩…</div>}
              <button onClick={()=>removeImage(img.key)} title="삭제" style={{position:'absolute', top:5, right:5, width:22, height:22, borderRadius:'50%', border:'none', background:'rgba(0,0,0,0.7)', color:'white', cursor:'pointer', display:'grid', placeItems:'center'}}>
                <X size={11}/>
              </button>
              <div style={{position:'absolute', bottom:0, left:0, right:0, padding:'3px 6px', background:'linear-gradient(transparent, rgba(0,0,0,0.7))', color:'white', fontSize:9.5, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{img.name}</div>
            </div>
          );
        })}
        <button type="button" onClick={()=>inputRef.current?.click()} disabled={busy} style={{
          aspectRatio:'1', border:'1px dashed var(--line)', borderRadius:'var(--radius-sm)',
          background:'transparent', color:'var(--muted)', fontFamily:'inherit', cursor:'pointer',
          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:6,
        }}>
          <Plus size={20}/>
          <span style={{fontSize:10.5}}>{busy ? '업로드 중…' : '이미지 추가'}</span>
        </button>
      </div>
      <div style={{fontSize:11, color:'var(--muted)', marginTop:10}}>
        {images.length > 0 ? `${images.length}장 업로드됨` : '이미지를 추가하세요. 복수 선택 가능.'}
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple style={{display:'none'}} onChange={handleFiles}/>
    </div>
  );
}

// ============================================================================
// ADMIN — EXHIBITOR DETAIL MODAL
// ============================================================================

function ExhibitorDetailModal({exhibitor, onClose, readOnly}){
  const e = exhibitor;
  const [logo, setLogo] = useState(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!e.logoKey) { setLogo(null); return; }
    let cancelled=false;
    loadBlob(e.logoKey).then(d => !cancelled && setLogo(d));
    return () => {cancelled=true;};
  }, [e.id, e.logoKey]);

  const stop = (ev) => ev.stopPropagation();

  // 섹션별 수정 시각 포맷
  const formatSectionTime = (iso) => {
    if (!iso) return '미작성';
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return '방금 전';
    if (diff < 3600) return `${Math.floor(diff/60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff/3600)}시간 전`;
    if (diff < 86400 * 7) return `${Math.floor(diff/86400)}일 전`;
    return d.toLocaleDateString('ko-KR', {month:'short', day:'numeric'});
  };

  const secUpdates = e.sectionsUpdatedAt || {};

  // 전체 자료 일괄 다운로드 — 모든 이미지 + 참가사 데이터 JSON
  const downloadAll = async () => {
    setDownloading(true);
    try {
      const safeCompany = (e.companyNameEn || e.companyName || 'company').replace(/[^a-zA-Z0-9가-힣_-]/g,'_');

      // 1) 로고 다운로드
      if (e.logoKey) {
        const logoData = await loadBlob(e.logoKey);
        if (logoData) {
          downloadBlob({...logoData, name: `${safeCompany}_logo_${logoData.name}`});
          await new Promise(r => setTimeout(r, 200));
        }
      }

      // 2) IP별 이미지 순차 다운로드
      for (let idx = 0; idx < (e.ips || []).length; idx++) {
        const ip = e.ips[idx];
        const safeIpName = (ip.nameEn || ip.name || `IP${idx+1}`).replace(/[^a-zA-Z0-9가-힣_-]/g,'_');
        for (const img of (ip.images || [])) {
          const data = await loadBlob(img.key);
          if (data) {
            downloadBlob({...data, name: `${safeCompany}_${safeIpName}_${data.name}`});
            await new Promise(r => setTimeout(r, 200)); // 브라우저 다운로드 throttle
          }
        }
      }

      // 3) 참가사 데이터 JSON 다운로드 (이미지 제외한 텍스트 정보)
      const cleanData = {
        id: e.id,
        project: e.project,
        companyName: e.companyName,
        companyNameEn: e.companyNameEn,
        contactName: e.contactName,
        contactNameEn: e.contactNameEn,
        positionKo: e.positionKo,
        positionEn: e.positionEn,
        email: e.email,
        phone: e.phone,
        introEn: e.introEn,
        ips: (e.ips || []).map(ip => ({
          id: ip.id, name: ip.name, nameEn: ip.nameEn,
          genre: ip.genre, targetAge: ip.targetAge, format: ip.format,
          episodes: ip.episodes, seasons: ip.seasons,
          runtimeMin: ip.runtimeMin, runtimeSec: ip.runtimeSec,
          desiredBuyerPriority: ip.desiredBuyerPriority,
          desiredBuyerPriorityOther: ip.desiredBuyerPriorityOther,
          regions: ip.regions,
          imagesCount: (ip.images || []).length,
        })),
        survey: e.survey,
        updatedAt: e.updatedAt,
        sectionsUpdatedAt: e.sectionsUpdatedAt,
        exportedAt: new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(cleanData, null, 2)], {type: 'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeCompany}_data.json`;
      a.click();
      URL.revokeObjectURL(url);

    } catch (err) {
      alert(`다운로드 중 오류 발생: ${err.message}`);
    } finally {
      setDownloading(false);
    }
  };

  const totalImages = (e.logoKey ? 1 : 0) + (e.ips || []).reduce((a, ip) => a + (ip.images||[]).length, 0);

  return (
    <div onClick={onClose} style={{position:'fixed', inset:0, background:'rgba(10,10,11,0.55)', zIndex:200, display:'grid', placeItems:'center', padding:20, animation:'fadeIn .2s ease'}}>
      <div onClick={stop} className="card" style={{background:'var(--paper)', maxWidth:1040, width:'100%', maxHeight:'92vh', overflow:'auto', padding:0, borderRadius:'var(--radius)'}}>
        {/* Sticky Header */}
        <div style={{padding:'22px 28px 16px', borderBottom:'1px solid var(--line)', position:'sticky', top:0, background:'var(--paper)', zIndex:5}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:14}}>
            <div style={{display:'flex', alignItems:'center', gap:14, flex:1, minWidth:0}}>
              {logo && (
                <div style={{width:44, height:44, background:'var(--ivory-2)', borderRadius:'var(--radius-sm)', overflow:'hidden', display:'grid', placeItems:'center', border:'1px solid var(--line)', flexShrink:0}}>
                  <img src={logo.data} style={{maxWidth:'100%', maxHeight:'100%', objectFit:'contain'}} alt=""/>
                </div>
              )}
              <div style={{minWidth:0}}>
                <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:2, flexWrap:'wrap'}}>
                  <ProjectBadge project={e.project}/>
                  <span className="mono" style={{fontSize:10.5, letterSpacing:'0.15em', color:'var(--muted)'}}>
                    PARTICIPANT DETAIL · {e.id}
                  </span>
                </div>
                <div className="serif" style={{fontSize:22, fontWeight:600, marginTop:4, letterSpacing:'-0.02em'}}>{e.companyName}</div>
                {e.companyNameEn && <div style={{fontSize:13, color:'var(--muted)', marginTop:2}}>{e.companyNameEn}</div>}
              </div>
            </div>
            <div style={{display:'flex', gap:6, flexShrink:0}}>
              {!readOnly && (
              <button className="btn btn-primary" onClick={downloadAll} disabled={downloading || totalImages === 0}
                      title={totalImages === 0 ? '다운로드할 이미지가 없습니다' : `이미지 ${totalImages}장 + 데이터 JSON 일괄 다운로드`}>
                {downloading ? (
                  <>
                    <span style={{display:'inline-block', width:11, height:11, border:'2px solid rgba(255,255,255,0.4)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.8s linear infinite'}}/>
                    다운로드 중...
                  </>
                ) : (
                  <>
                    <Upload size={12} style={{transform:'rotate(180deg)'}}/>전체 일괄 다운로드
                  </>
                )}
              </button>
              )}
              <button className="btn btn-ghost" onClick={onClose} style={{padding:8}}><X size={16}/></button>
            </div>
          </div>

          {/* 섹션별 수정 시각 타임라인 */}
          <div style={{display:'flex', gap:8, marginTop:14, flexWrap:'wrap'}}>
            <SectionTimeChip label="회사정보" time={secUpdates.profile} formatTime={formatSectionTime}/>
            <SectionTimeChip label="회사소개" time={secUpdates.intro}   formatTime={formatSectionTime}/>
            <SectionTimeChip label={`IP${(e.ips||[]).length > 0 ? ` ${(e.ips||[]).length}` : ''}`} time={secUpdates.ips} formatTime={formatSectionTime}/>
            <SectionTimeChip label="수요조사" time={secUpdates.survey}  formatTime={formatSectionTime}/>
            {e.updatedAt && (
              <span style={{marginLeft:'auto', fontSize:10.5, color:'var(--muted-2)', display:'inline-flex', alignItems:'center', gap:4}}>
                <Clock size={10}/>최근 업데이트 {formatSectionTime(e.updatedAt)}
              </span>
            )}
          </div>
        </div>

        {/* Body */}
        <div style={{padding:'8px 28px 28px'}}>
          {/* 회사 · 담당자 */}
          <DetailSection title="회사 · 담당자 정보" eyebrow="SECTION 01">
            <DetailGrid>
              <D label="회사명 (국문)" value={e.companyName}/>
              <D label="회사명 (영문)" value={e.companyNameEn}/>
              <D label="담당자 (국문)" value={e.contactName}/>
              <D label="담당자 (영문)" value={e.contactNameEn}/>
              <D label="직급 (국문)" value={e.positionKo}/>
              <D label="직급 (영문)" value={e.positionEn}/>
              <D label="이메일" value={e.email} mono/>
              <D label="연락처" value={e.phone} mono/>
            </DetailGrid>
          </DetailSection>

          {/* 로고 + 소개 */}
          <DetailSection title="회사 소개" eyebrow="SECTION 02">
            {logo ? (
              <div className="card" style={{padding:18, marginBottom:16, background:'var(--ivory-2)', border:'1px solid var(--line)', display:'flex', gap:18, alignItems:'center'}}>
                <div style={{width:80, height:80, background:'var(--paper)', borderRadius:'var(--radius-sm)', overflow:'hidden', display:'grid', placeItems:'center', flexShrink:0, border:'1px solid var(--line)'}}>
                  <img src={logo.data} style={{maxWidth:'100%', maxHeight:'100%', objectFit:'contain'}} alt=""/>
                </div>
                <div style={{flex:1, minWidth:0}}>
                  <div className="label" style={{marginBottom:4}}>회사 로고</div>
                  <div style={{fontSize:13, fontWeight:500, wordBreak:'break-all'}}>{logo.name}</div>
                  <div style={{fontSize:11.5, color:'var(--muted)', marginTop:2}}>{logo.type} · {formatBytes(logo.size)}</div>
                </div>
                {!readOnly && (
                <button className="btn btn-primary" onClick={()=>downloadBlob(logo)} style={{flexShrink:0}}>
                  <Upload size={12} style={{transform:'rotate(180deg)'}}/>다운로드
                </button>
                )}
              </div>
            ) : (
              <div style={{padding:14, background:'var(--ivory-2)', fontSize:12.5, color:'var(--muted)', borderRadius:'var(--radius-sm)', marginBottom:16}}>
                회사 로고 미업로드
              </div>
            )}
            <div className="label" style={{marginBottom:6}}>Company Introduction (English)</div>
            <div style={{whiteSpace:'pre-wrap', fontSize:13.5, lineHeight:1.8, padding:16, background:'var(--ivory-2)', borderRadius:'var(--radius-sm)', minHeight:80, color: e.introEn ? 'var(--ink)' : 'var(--muted-2)'}}>
              {e.introEn || '미입력'}
            </div>
          </DetailSection>

          {/* IP 목록 */}
          <DetailSection title={`IP 목록 (${(e.ips||[]).length}개)`} eyebrow="SECTION 03">
            {(e.ips || []).length === 0
              ? <div style={{padding:14, background:'var(--ivory-2)', fontSize:12.5, color:'var(--muted)', borderRadius:'var(--radius-sm)'}}>등록된 IP 없음</div>
              : (e.ips || []).map((ip, idx) => <IPDetailBlock key={ip.id} ip={ip} idx={idx} exhibitor={e} readOnly={readOnly}/>)}
          </DetailSection>

          {/* 수요조사 */}
          <DetailSection title="수요조사" eyebrow="SECTION 04">
            <SurveyDetail survey={e.survey}/>
          </DetailSection>
        </div>
      </div>
    </div>
  );
}

// 섹션 수정 시각 칩
function SectionTimeChip({label, time, formatTime}){
  const filled = !!time;
  return (
    <div style={{
      display:'inline-flex', alignItems:'center', gap:6,
      padding:'4px 10px', borderRadius:3,
      background: filled ? '#F0FDF4' : 'var(--ivory-2)',
      border: filled ? '1px solid #86EFAC' : '1px solid var(--line)',
      fontSize:10.5,
    }}>
      <span style={{fontWeight:600, color: filled ? '#166534' : 'var(--muted)'}}>{label}</span>
      <span style={{color: filled ? '#166534' : 'var(--muted-2)'}}>·</span>
      <span className="mono tabular" style={{color: filled ? '#166534' : 'var(--muted-2)', fontSize:10}}>
        {formatTime(time)}
      </span>
    </div>
  );
}

function DetailSection({title, eyebrow, children}){
  return (
    <div style={{marginTop:24}}>
      <div style={{display:'flex', alignItems:'baseline', gap:10, marginBottom:14, paddingBottom:10, borderBottom:'1px solid var(--line)'}}>
        {eyebrow && <span className="mono" style={{fontSize:10, letterSpacing:'0.15em', color:'var(--muted)'}}>{eyebrow}</span>}
        <div className="serif" style={{fontSize:17, fontWeight:600, letterSpacing:'-0.015em'}}>{title}</div>
      </div>
      {children}
    </div>
  );
}

function DetailGrid({children}){
  return <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px 24px'}}>{children}</div>;
}

function D({label, value, mono}){
  return (
    <div>
      <div className="label" style={{marginBottom:3}}>{label}</div>
      <div className={mono ? 'mono' : ''} style={{fontSize: mono ? 12.5 : 13.5, color: value ? 'var(--ink)' : 'var(--muted-2)', fontWeight: 500, minHeight:20}}>
        {value || '미입력'}
      </div>
    </div>
  );
}

function IPDetailBlock({ip, idx, exhibitor, readOnly}){
  const safeCompany = (exhibitor.companyNameEn || exhibitor.companyName || 'company').replace(/[^a-zA-Z0-9가-힣_-]/g,'_');
  const safeIpName = (ip.nameEn || ip.name || `IP${idx+1}`).replace(/[^a-zA-Z0-9가-힣_-]/g,'_');
  const prefix = `${safeCompany}_${safeIpName}`;

  return (
    <div className="card" style={{padding:20, marginBottom:12}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:16, marginBottom:12, flexWrap:'wrap'}}>
        <div style={{flex:1, minWidth:200}}>
          <div className="mono" style={{fontSize:10, letterSpacing:'0.18em', color:'var(--muted)', marginBottom:3}}>IP #{String(idx+1).padStart(2,'0')}</div>
          <div className="serif" style={{fontSize:18, fontWeight:600, letterSpacing:'-0.02em'}}>
            {ip.name || <span style={{color:'var(--muted-2)'}}>Untitled</span>}
          </div>
          {ip.nameEn && <div style={{fontSize:12.5, color:'var(--muted)', marginTop:1}}>{ip.nameEn}</div>}
        </div>
        <div style={{display:'flex', gap:5, flexWrap:'wrap'}}>
          {ip.genre && <span className="chip">{ip.genre}</span>}
          {ip.format && <span className="chip">{ip.format}</span>}
          {ip.targetAge && <span className="chip">{ip.targetAge}</span>}
          {formatRuntimeSummary(ip).map((s,i) => <span key={i} className="chip" style={{background:'var(--paper)', borderColor:'var(--line)'}}>{s}</span>)}
        </div>
      </div>

      {/* IP Introduction (영문 400자) — 관리자용 */}
      {ip.introEn && (
        <div style={{marginBottom:14, padding:'12px 14px', background:'var(--ivory-2)', borderRadius:'var(--radius-sm)', border:'1px solid var(--line-2)'}}>
          <div className="mono" style={{fontSize:9.5, letterSpacing:'0.15em', color:'var(--muted)', marginBottom:5, fontWeight:600, display:'flex', alignItems:'center', gap:5}}>
            <Languages size={10}/>IP INTRODUCTION · ENGLISH · {ip.introEn.length}자
          </div>
          <div style={{fontSize:12.5, lineHeight:1.65, color:'var(--ink-2)', whiteSpace:'pre-wrap'}}>
            {ip.introEn}
          </div>
        </div>
      )}

      <div className="grid" style={{gridTemplateColumns:'1fr 1fr', gap:'14px 24px', fontSize:12.5}}>
        <div>
          <div className="label" style={{marginBottom:6}}>희망 바이어 카테고리</div>
          {(ip.desiredBuyerPriority||[]).some(Boolean)
            ? (ip.desiredBuyerPriority||[]).map((c,i) => {
                if (!c) return null;
                const otherText = ip.desiredBuyerPriorityOther?.[i];
                const isOther = c === '기타 (Others)';
                const display = isOther ? (otherText ? `기타 · ${otherText}` : '기타 (미입력)') : c;
                return (
                  <div key={i} style={{display:'flex', alignItems:'center', gap:7, marginTop:3}}>
                    <span className="mono" style={{fontSize:9.5, padding:'1px 6px', background:'var(--ink)', color:'var(--ivory)', borderRadius:3, fontWeight:600}}>{i+1}순위</span>
                    <span>{display}</span>
                  </div>
                );
              })
            : <span style={{color:'var(--muted-2)'}}>미설정</span>}
        </div>
        <div>
          <div className="label" style={{marginBottom:6}}>타겟 권역</div>
          <div style={{display:'flex', gap:4, flexWrap:'wrap'}}>
            {(ip.regions||[]).length
              ? (ip.regions||[]).map(r => {
                  const reg = REGIONS.find(x => x.key === r);
                  const ww = r === 'WW';
                  return <span key={r} className="chip" style={{fontSize:10.5, background: ww?'var(--ink)':'var(--ivory-2)', color: ww?'var(--ivory)':'var(--ink)', borderColor: ww?'var(--ink)':'var(--line)'}}>{reg?.label || r}</span>;
                })
              : <span style={{color:'var(--muted-2)'}}>미설정</span>}
          </div>
        </div>
      </div>

      {ip.images && ip.images.length > 0 && (
        <div style={{marginTop:16, paddingTop:14, borderTop:'1px solid var(--line-2)'}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
            <div className="label" style={{margin:0}}>IP 이미지 <span style={{color:'var(--muted)', fontWeight:400, marginLeft:4}}>· {ip.images.length}장</span></div>
            {!readOnly && (
            <button className="btn btn-ghost" style={{padding:'5px 12px', fontSize:11.5}} onClick={()=>downloadAllImages(ip.images, prefix)}>
              <Upload size={11} style={{transform:'rotate(180deg)'}}/>전체 다운로드
            </button>
            )}
          </div>
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(120px,1fr))', gap:8}}>
            {ip.images.map(img => <AdminImageCard key={img.key} img={img} prefix={prefix}/>)}
          </div>
        </div>
      )}
    </div>
  );
}

function AdminImageCard({img, prefix}){
  const [data, setData] = useState(null);
  useEffect(()=>{ let c=false; loadBlob(img.key).then(d => !c && setData(d)); return ()=>{c=true;}; }, [img.key]);

  const handleDownload = () => {
    if (!data) return;
    const renamed = prefix ? { ...data, name: `${prefix}_${data.name}` } : data;
    downloadBlob(renamed);
  };

  return (
    <div style={{position:'relative', aspectRatio:'1', border:'1px solid var(--line)', borderRadius:'var(--radius-sm)', overflow:'hidden', background:'var(--ivory-2)'}}>
      {data ? (
        <>
          <img src={data.data} style={{width:'100%', height:'100%', objectFit:'cover'}} alt=""/>
          <button onClick={handleDownload} title="다운로드" style={{position:'absolute', top:6, right:6, width:26, height:26, borderRadius:'50%', border:'none', background:'rgba(0,0,0,0.78)', color:'white', cursor:'pointer', display:'grid', placeItems:'center'}}>
            <Upload size={12} style={{transform:'rotate(180deg)'}}/>
          </button>
          <div style={{position:'absolute', bottom:0, left:0, right:0, padding:'4px 7px', background:'linear-gradient(transparent, rgba(0,0,0,0.7))', color:'white', fontSize:10, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>
            {img.name}
          </div>
        </>
      ) : (
        <div style={{display:'grid', placeItems:'center', height:'100%', color:'var(--muted)', fontSize:10.5}}>로딩…</div>
      )}
    </div>
  );
}

function SurveyDetail({survey}){
  const s = survey || {};
  const [showRRN, setShowRRN] = useState(false);

  const items = [
    {label:'통역 필요 여부', value: s.needsInterpreter ? (s.needsInterpreter==='O' ? '필요 (Yes)' : '불필요 (No)') : null},
    {label:'모더레이터 소개 멘트 (영문)', value: s.moderatorIntroEn, multi:true},
    {label:'숙소 정보', value: s.accommodation, multi:true},
    {label:'항공 정보', value: s.flightInfo, multi:true},
    {label:'우편 수령처', value: s.mailAddress, multi:true},
  ];

  const travelers = s.additionalTravelers || [];

  return (
    <div style={{display:'flex', flexDirection:'column', gap:14}}>
      {items.map((it, i) => (
        <div key={i}>
          <div className="label" style={{marginBottom:4}}>{it.label}</div>
          {it.multi
            ? <div style={{padding:12, background:'var(--ivory-2)', borderRadius:'var(--radius-sm)', fontSize:13, lineHeight:1.7, whiteSpace:'pre-wrap', minHeight:36, color: it.value ? 'var(--ink)' : 'var(--muted-2)'}}>
                {it.value || '미입력'}
              </div>
            : <div style={{fontSize:13, color: it.value ? 'var(--ink)' : 'var(--muted-2)'}}>{it.value || '미입력'}</div>}
        </div>
      ))}

      <div>
        <div className="label" style={{marginBottom:4}}>추가 출장 인원 ({travelers.length}명)</div>
        {travelers.length === 0
          ? <div style={{fontSize:13, color:'var(--muted-2)'}}>없음</div>
          : <div style={{display:'flex', flexDirection:'column', gap:6, background:'var(--ivory-2)', padding:12, borderRadius:'var(--radius-sm)'}}>
              {travelers.map((t, i) => (
                <div key={i} style={{display:'flex', gap:10, fontSize:13}}>
                  <span style={{fontWeight:500, minWidth:60}}>{t.name || '—'}</span>
                  <span style={{color:'var(--muted)'}}>·</span>
                  <span>{t.position || '—'}</span>
                </div>
              ))}
            </div>}
      </div>

      {/* RRN — 기본 마스킹 + 토글 */}
      <div style={{border:'1px solid var(--line)', borderLeft:'3px solid var(--ink)', borderRadius:'var(--radius-sm)', padding:14, background:'var(--paper)'}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6}}>
          <div style={{display:'flex', alignItems:'center', gap:8}}>
            <Shield size={13} style={{color:'var(--muted)'}}/>
            <div className="label" style={{margin:0}}>피칭 담당자 주민등록번호 <span style={{color:'var(--red)', fontWeight:500}}>· 민감정보</span></div>
          </div>
          {s.pitcherRRN && (
            <button className="btn btn-ghost" style={{padding:'4px 10px', fontSize:11}} onClick={()=>setShowRRN(!showRRN)}>
              <Eye size={11}/>{showRRN ? '가리기' : '조회'}
            </button>
          )}
        </div>
        <div className="mono" style={{fontSize:13, color: s.pitcherRRN ? 'var(--ink)' : 'var(--muted-2)', letterSpacing:'0.02em'}}>
          {s.pitcherRRN
            ? (showRRN ? s.pitcherRRN : s.pitcherRRN.slice(0,6) + '-*******')
            : '미입력'}
        </div>
      </div>

      <div>
        <div className="label" style={{marginBottom:4}}>기타 의견</div>
        <div style={{padding:12, background:'var(--ivory-2)', borderRadius:'var(--radius-sm)', fontSize:13, lineHeight:1.7, whiteSpace:'pre-wrap', minHeight:36, color: s.feedback ? 'var(--ink)' : 'var(--muted-2)'}}>
          {s.feedback || '미입력'}
        </div>
      </div>
    </div>
  );
}

function NumberWithHint({value, onChange, placeholder='', hint='', unit='', max}){
  return (
    <div>
      <div style={{display:'flex', alignItems:'stretch'}}>
        <input
          type="number"
          min="0"
          max={max || undefined}
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="input"
          style={{borderRight:'none', borderTopRightRadius:0, borderBottomRightRadius:0, textAlign:'right'}}
        />
        <div style={{padding:'0 12px', display:'grid', placeItems:'center', border:'1px solid var(--line)', borderLeft:'none', background:'var(--ivory-2)', borderTopRightRadius:'var(--radius-sm)', borderBottomRightRadius:'var(--radius-sm)', fontSize:12, color:'var(--muted)', fontWeight:500}}>
          {unit}
        </div>
      </div>
      {hint && <div style={{fontSize:10.5, color:'var(--muted)', marginTop:5, letterSpacing:'-0.005em'}}>{hint}</div>}
    </div>
  );
}

// BUYER_CATEGORIES 각 카테고리에 고유 색상 — 비비드 · 세련 (Tailwind 600 대역 기반)
const CATEGORY_PALETTE = {
  'Broadcaster (방송사)':                   '#DC2626', // Red 600 — 방송의 상징적 레드
  'Streaming / OTT 플랫폼':                 '#2563EB', // Blue 600 — 디지털 플랫폼
  'Production (제작사)':                    '#EA580C', // Orange 600 — 창작·제작의 열정
  'Distributor (배급사)':                   '#D97706', // Amber 600 — 유통의 골드톤
  'Licensee (MD · 출판 · 상품화)':          '#059669', // Emerald 600 — 라이선스 비즈니스
  'Co-Production Partner (공동제작)':       '#7C3AED', // Violet 600 — 파트너십의 로열
  'Investor (투자사)':                      '#4F46E5', // Indigo 600 — 금융의 신뢰감
  'Publisher (퍼블리셔)':                   '#0891B2', // Cyan 600 — 출판의 깊이
  'Global Sales Agent (세일즈 에이전트)':    '#DB2777', // Pink 600 — 글로벌 세일즈의 에너지
  'Localization (로컬라이제이션 · 더빙)':    '#64748B', // Slate 500 — 기술 서비스의 중립
  'Merchandising Partner (머천다이징)':     '#16A34A', // Green 600 — 머천다이징의 생동감
  '기타 (Others)':                          '#525252', // Neutral 600 — 중성
};
// 부분 매칭용 키워드 (자동 추정 값/레거시 데이터 호환)
const CATEGORY_FALLBACK = {
  'Broadcaster':   '#DC2626',
  'Streaming':     '#2563EB',
  'OTT':           '#2563EB',
  'Production':    '#EA580C',
  '제작사':         '#EA580C',
  'Distributor':   '#D97706',
  'Licensee':      '#059669',
  'Co-Production': '#7C3AED',
  '공동제작':       '#7C3AED',
  'Investor':      '#4F46E5',
  'Publisher':     '#0891B2',
  'Global Sales':  '#DB2777',
  'Localization':  '#64748B',
  'Merchandising': '#16A34A',
  '기타':          '#525252',
  'Others':        '#525252',
};

function CategoryBadge({category}){
  if (!category) return <span style={{color:'var(--muted-2)', fontSize:11}}>—</span>;
  // 1차: 정확 매칭
  let bg = CATEGORY_PALETTE[category];
  // 2차: 부분 매칭 (회사명 기반 자동 추정값 호환)
  if (!bg) {
    const hit = Object.entries(CATEGORY_FALLBACK).find(([k]) => category.toLowerCase().includes(k.toLowerCase()));
    bg = hit ? hit[1] : 'var(--ink-2)';
  }
  return (
    <span style={{
      display:'inline-flex', alignItems:'center',
      padding:'3px 10px', fontSize:11, fontWeight:600,
      background: bg, color:'#fff',
      borderRadius:999, letterSpacing:'-0.005em',
      whiteSpace:'nowrap', maxWidth:180, overflow:'hidden', textOverflow:'ellipsis',
    }} title={category}>
      {category}
    </span>
  );
}

// 상세 모달의 필드 표시 헬퍼
function DetailField({label, value, mono, multiline}){
  const hasVal = value !== undefined && value !== null && value !== '';
  return (
    <div>
      <div className="mono" style={{fontSize:9.5, letterSpacing:'0.15em', color:'var(--muted)', marginBottom:4, textTransform:'uppercase'}}>{label}</div>
      <div className={mono ? 'mono' : ''} style={{fontSize: mono ? 12.5 : 13.5, color: hasVal ? 'var(--ink)' : 'var(--muted-2)', lineHeight: multiline ? 1.55 : 1.3, wordBreak:'break-word'}}>
        {hasVal ? value : '—'}
      </div>
    </div>
  );
}

// 공통 바이어 상세 조회 모달 — BuyersTab / RsvpTab 공용
function BuyerDetailModal({buyer, fullState, onClose, onEdit}){
  if (!buyer) return null;
  const b = buyer;
  const cats = getBuyerCategories(b);
  const meetings = fullState.meetings.filter(m => m.buyerId === b.id);
  const sourceMap = {
    'google_form':    { label: '구글폼 자동 수집', color:'#2563EB', icon:FileSpreadsheet },
    'exhibitor_added':{ label: '참가사 등록',      color:'#059669', icon:User2 },
    'admin_added':    { label: '운영사 수동 등록',  color:'#525252', icon:Shield },
    'rsvp_manual':    { label: 'RSVP 수동 입력',   color:'#525252', icon:ClipboardCheck },
  };
  const srcInfo = b.source && sourceMap[b.source] ? sourceMap[b.source] : null;
  const statusLabel = {
    accepted:'참가 확정', sent:'초청 발송', pending:'회신 대기', declined:'참가 불가',
  }[b.invitationStatus] || '미발송';
  const SrcIcon = srcInfo?.icon;
  return (
    <Modal title={b.companyName} onClose={onClose}>
      {/* 상단 요약 */}
      <div style={{padding:'14px 16px', background:'var(--ivory-2)', borderRadius:'var(--radius-sm)', marginBottom:18}}>
        <div style={{display:'flex', flexWrap:'wrap', gap:8, alignItems:'center', marginBottom:10}}>
          <ProjectBadge project={b.project}/>
          {srcInfo && (
            <span style={{display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', fontSize:10.5, fontWeight:700, background:srcInfo.color, color:'#fff', borderRadius:3, letterSpacing:'0.04em'}}>
              {SrcIcon && <SrcIcon size={10}/>}{srcInfo.label}
            </span>
          )}
          <span style={{fontSize:11.5, color:'var(--muted)', marginLeft:'auto'}} className="mono">ID {b.id}</span>
        </div>
        <div style={{display:'flex', flexWrap:'wrap', gap:5}}>
          {cats.length > 0
            ? cats.map(c => <CategoryBadge key={c} category={c}/>)
            : <span style={{color:'var(--muted-2)', fontSize:12}}>카테고리 미분류</span>}
        </div>
      </div>

      {/* 상세 정보 그리드 */}
      <div className="grid" style={{gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:18}}>
        <DetailField label="국가" value={b.country}/>
        <DetailField label="기업 규모" value={b.companySize}/>
        <DetailField label="담당자" value={b.contactName}/>
        <DetailField label="직급" value={b.position}/>
        <DetailField label="이메일" value={b.email} mono/>
        <DetailField label="연락처" value={b.phone} mono/>
        <DetailField label="초청 상태" value={statusLabel}/>
        <DetailField label="피칭쇼케이스" value={b.pitchingShowcase || '—'}/>
        <DetailField label="희망 미팅일" value={(b.preferredDates || []).join(' · ') || '—'}/>
        <DetailField label="확정 일정"
          value={b.confirmedDate
            ? `${b.confirmedDate}${b.confirmedTime ? ` · ${b.confirmedTime}` : ''}${b.confirmedExhibitorId ? ` · ${(fullState.exhibitors.find(e => e.id === b.confirmedExhibitorId)?.companyName || b.confirmedExhibitorId)}` : ''}`
            : '—'}/>
        <div style={{gridColumn:'1 / -1'}}>
          <DetailField label="관심 품목 / 주요 사업" value={b.interestedProducts} multiline/>
        </div>
      </div>

      {/* 선호 콘텐츠 (매칭 엔진 반영 필드) */}
      {(getBuyerGenres(b).length > 0 || getBuyerFormats(b).length > 0 || getBuyerTargetAges(b).length > 0 || getBuyerInterestedRegions(b).length > 0) && (
        <div style={{padding:'14px 16px', background:'var(--purple-lt)', borderRadius:'var(--radius-sm)', marginBottom:18, border:'1px solid var(--purple)'}}>
          <div className="mono" style={{fontSize:10, letterSpacing:'0.18em', color:'var(--purple-dk)', fontWeight:700, marginBottom:10}}>
            PREFERRED CONTENT · 선호 콘텐츠
          </div>
          <div style={{display:'flex', flexDirection:'column', gap:10}}>
            {getBuyerTargetAges(b).length > 0 && (
              <div>
                <div style={{fontSize:10.5, fontWeight:600, color:'var(--ink-2)', marginBottom:5}}>타겟 연령</div>
                <div style={{display:'flex', flexWrap:'wrap', gap:4}}>
                  {getBuyerTargetAges(b).map(t => (
                    <span key={t} className="chip" style={{background:'#fff', borderColor:'var(--purple)', color:'var(--purple-dk)', fontSize:10.5, fontWeight:600}}>{t}</span>
                  ))}
                </div>
              </div>
            )}
            {getBuyerGenres(b).length > 0 && (
              <div>
                <div style={{fontSize:10.5, fontWeight:600, color:'var(--ink-2)', marginBottom:5}}>장르</div>
                <div style={{display:'flex', flexWrap:'wrap', gap:4}}>
                  {getBuyerGenres(b).map(g => (
                    <span key={g} className="chip" style={{background:'#fff', borderColor:'var(--purple)', color:'var(--purple-dk)', fontSize:10.5, fontWeight:600}}>{g}</span>
                  ))}
                </div>
              </div>
            )}
            {getBuyerFormats(b).length > 0 && (
              <div>
                <div style={{fontSize:10.5, fontWeight:600, color:'var(--ink-2)', marginBottom:5}}>포맷</div>
                <div style={{display:'flex', flexWrap:'wrap', gap:4}}>
                  {getBuyerFormats(b).map(f => (
                    <span key={f} className="chip" style={{background:'#fff', borderColor:'var(--purple)', color:'var(--purple-dk)', fontSize:10.5, fontWeight:600}}>{f}</span>
                  ))}
                </div>
              </div>
            )}
            {getBuyerInterestedRegions(b).length > 0 && (
              <div>
                <div style={{fontSize:10.5, fontWeight:600, color:'var(--ink-2)', marginBottom:5}}>
                  권역 {(!b.interestedRegions || b.interestedRegions.length === 0) && <span style={{fontSize:9.5, fontWeight:500, color:'var(--muted)', marginLeft:5}}>· 국가 자동 감지</span>}
                </div>
                <div style={{display:'flex', flexWrap:'wrap', gap:4}}>
                  {getBuyerInterestedRegions(b).map(rKey => {
                    const r = REGIONS.find(x => x.key === rKey);
                    return (
                      <span key={rKey} className="chip" style={{background:'#fff', borderColor:'var(--purple)', color:'var(--purple-dk)', fontSize:10.5, fontWeight:600}}>
                        {r?.label?.split(' · ')[0] || rKey}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 편성된 미팅 이력 */}
      {meetings.length > 0 && (
        <div style={{marginBottom:18}}>
          <div className="mono" style={{fontSize:10, letterSpacing:'0.15em', color:'var(--muted)', marginBottom:8}}>SCHEDULED MEETINGS · {meetings.length}건</div>
          <div style={{display:'flex', flexDirection:'column', gap:6}}>
            {meetings.map(m => {
              const ex = fullState.exhibitors.find(e => e.id === m.exhibitorId);
              return (
                <div key={m.id} style={{padding:'10px 14px', background:'var(--paper)', border:'1px solid var(--line)', borderRadius:'var(--radius-sm)', display:'flex', alignItems:'center', gap:12, fontSize:12.5}}>
                  <span className="mono tabular" style={{fontWeight:600, color:'var(--ink-2)'}}>{m.date} {m.time}</span>
                  <span style={{flex:1, fontWeight:500}}>{ex?.companyName || '—'}</span>
                  {m.table && <span className="mono" style={{fontSize:10.5, padding:'2px 7px', background:'var(--ivory-2)', borderRadius:3, color:'var(--muted)'}}>{m.table}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{display:'flex', justifyContent:'flex-end', gap:8, marginTop:20}}>
        <button className="btn btn-ghost" onClick={onClose}>닫기</button>
        {onEdit && (
          <button className="btn btn-primary" onClick={onEdit}>
            <Edit3 size={13}/>수정
          </button>
        )}
      </div>
    </Modal>
  );
}
function CategoriesBadges({categories, maxShow=2, buyer}){
  const list = categories || (buyer ? getBuyerCategories(buyer) : []);
  if (!list || list.length === 0) return <span style={{color:'var(--muted-2)', fontSize:11}}>—</span>;
  const shown = list.slice(0, maxShow);
  const rest = list.length - shown.length;
  return (
    <div style={{display:'flex', flexWrap:'wrap', gap:4, alignItems:'center'}}>
      {shown.map(c => <CategoryBadge key={c} category={c}/>)}
      {rest > 0 && (
        <span title={list.slice(maxShow).join(', ')}
              style={{fontSize:10.5, fontWeight:600, padding:'3px 7px', background:'var(--ivory-2)', color:'var(--ink-2)', borderRadius:999, border:'1px solid var(--line)'}}>
          +{rest}
        </span>
      )}
    </div>
  );
}

// ============================================================================
// ADMIN — RSVP TAB
// ============================================================================

function RsvpTab({state, fullState, update, project, readOnly}){
  const syncTimes = fullState.rsvpSheetSync || { MIFA:null, MIPCOM:null, CANADA:null };
  const projects = ['MIFA','MIPCOM','CANADA'];
  const [showRegister, setShowRegister] = useState(false);
  const defaultProject = project === 'ALL' ? 'MIFA' : project;
  const [subProject, setSubProject] = useState(defaultProject);
  const [syncing, setSyncing] = useState(null); // 'MIFA' | 'MIPCOM' | 'CANADA' | null
  const [syncResult, setSyncResult] = useState(null);
  const [syncError, setSyncError] = useState({}); // { MIFA: '...', MIPCOM: '...' }
  const [detailBuyer, setDetailBuyer] = useState(null); // 상세 모달
  const [confirmData, setConfirmData] = useState(null); // 삭제 확인 모달

  const deleteBuyer = (buyer) => {
    const meetingCount = fullState.meetings.filter(m => m.buyerId === buyer.id).length;
    setConfirmData({
      title: 'RSVP 바이어 삭제',
      message: meetingCount > 0
        ? `"${buyer.companyName}" 바이어를 삭제합니다.\n\n연결된 비즈니스 미팅 ${meetingCount}건도 함께 삭제되며 복구할 수 없습니다.`
        : `"${buyer.companyName}" 바이어를 삭제하시겠습니까?\n복구할 수 없습니다.`,
      confirmLabel: '삭제',
      onConfirm: () => {
        update(s => ({
          ...s,
          buyers: s.buyers.filter(b => b.id !== buyer.id),
          meetings: s.meetings.filter(m => m.buyerId !== buyer.id),
        }));
      },
    });
  };
  const fileRefs = { MIFA: useRef(null), MIPCOM: useRef(null), CANADA: useRef(null) };

  // CSV 파서
  const parseCsv = (text) => {
    // === 정규화 ===
    // (1) UTF-8 BOM 제거 (Excel에서 저장한 CSV에 자주 붙음)
    if (text.charCodeAt(0) === 0xFEFF) {
      text = text.slice(1);
    }
    // (2) 모든 줄바꿈을 \n으로 통일 (CRLF, CR, LF 모두 지원)
    //     Mac Excel: \r, Windows: \r\n, Unix: \n
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const rows = [];
    let cur = '', row = [], inQuote = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuote) {
        if (c === '"' && text[i+1] === '"') { cur += '"'; i++; }
        else if (c === '"') { inQuote = false; }
        else { cur += c; }
      } else {
        if (c === '"') { inQuote = true; }
        else if (c === ',') { row.push(cur); cur = ''; }
        else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
        else { cur += c; }
      }
    }
    // 마지막 행 처리 (파일이 줄바꿈 없이 끝나는 경우)
    if (cur !== '' || row.length > 0) { row.push(cur); rows.push(row); }

    // 빈 행 제거
    const cleanRows = rows.filter(r => r.some(c => c && String(c).trim() !== ''));
    if (cleanRows.length < 2) return [];

    const headers = cleanRows[0].map(h => String(h).trim());
    return cleanRows.slice(1).map(r => {
      const o = {};
      headers.forEach((h, i) => { o[h] = String(r[i] || '').trim(); });
      return o;
    });
  };

  // 구글폼 응답 행 → 바이어 객체 + 자동 미팅 편성 정보
  // 사용자 지정 매핑:
  //   Name → contactName (담당자)
  //   Company Name → companyName (회사명)
  //   Jobtitle → position (직급)
  //   Email address → email (이메일)
  //   6번째 질문 → desiredExhibitorName (미팅 희망 참가사)
  //   7번째 질문 → desiredMeetingDate (미팅 희망 일)
  const mapFormRowToBuyer = (row, pKey) => {
    const o = { project: pKey, source: 'google_form', invitationStatus: 'accepted', preferredDates: [] };
    const keys = Object.keys(row);

    // 0차: CSV에 'project' 또는 '프로젝트' 또는 '행사' 컬럼이 있으면 그 값을 우선 사용
    // 인식되는 표기: MIFA, MIPCOM, CANADA (대소문자 무관)
    keys.forEach(k => {
      const kl = k.toLowerCase().trim();
      if (kl === 'project' || kl === 'projects' || kl.includes('프로젝트') || kl.includes('행사') || kl === 'event' || kl === 'events') {
        const v = String(row[k] || '').trim().toUpperCase();
        if (v.includes('MIFA')) o.project = 'MIFA';
        else if (v.includes('MIPCOM') || v.includes('MIP COM')) o.project = 'MIPCOM';
        else if (v.includes('CANADA') || v.includes('CDN') || v.includes('TIFFCOM')) o.project = 'CANADA';
        // 인식 불가하면 그대로 pKey 유지
      }
    });

    // 1차: 헤더 기반 정확 매칭 (+ 변형 허용)
    keys.forEach(k => {
      const v = row[k];
      if (v === undefined || v === null || v === '') return;
      const vs = String(v).trim();
      const kl = k.toLowerCase().trim();

      if ((kl === 'name' || kl === 'full name' || kl === 'your name' || kl.includes('담당자') || kl.includes('이름')) && !o.contactName) {
        o.contactName = vs;
      } else if ((kl === 'company name' || kl === 'company' || kl === 'organization' || kl === 'organisation' || kl.includes('회사명') || kl.includes('회사 명') || kl.includes('기관')) && !o.companyName) {
        o.companyName = vs;
      } else if ((kl === 'jobtitle' || kl === 'job title' || kl === 'title' || kl === 'position' || kl === 'role' || kl.includes('직급') || kl.includes('직책')) && !o.position) {
        o.position = vs;
      } else if ((kl === 'email address' || kl === 'email' || kl === 'e-mail' || kl === 'e-mail address' || kl.includes('이메일') || kl.includes('메일주소')) && !o.email) {
        o.email = vs;
      } else if ((kl.includes('country') || kl.includes('국가')) && !o.country) {
        o.country = vs;
      } else if ((kl === 'phone' || kl === 'phone number' || kl === 'mobile' || kl.includes('연락처') || kl.includes('전화')) && !o.phone) {
        o.phone = vs;
      }
    });

    // 2차: 6번째 / 7번째 질문 위치 기반 매칭
    // 구글폼 응답 시트는 보통 A열이 Timestamp, B열부터 질문 답변
    // → 6번 질문은 인덱스 6 (Timestamp 포함) 또는 인덱스 5 (Timestamp 없음)
    const tsIdx = keys.findIndex(k => {
      const kl = k.toLowerCase();
      return kl.includes('timestamp') || kl.includes('타임스탬프') || kl === '제출 시간';
    });
    const offset = tsIdx >= 0 ? 1 : 0;
    const q6Idx = offset + 5; // 6번째 질문
    const q7Idx = offset + 6; // 7번째 질문
    if (q6Idx < keys.length) {
      const v6 = String(row[keys[q6Idx]] || '').trim();
      if (v6) o.desiredExhibitorName = v6;
    }
    if (q7Idx < keys.length) {
      const v7 = String(row[keys[q7Idx]] || '').trim();
      const parsed = parseDateString(v7);
      if (parsed) {
        o.desiredMeetingDate = parsed;
        o.preferredDates = [parsed];
      } else if (v7) {
        // 날짜 파싱 실패 시 원본 문자열 보존 (디버깅용)
        o.desiredMeetingDateRaw = v7;
      }
    }

    // 3차: 카테고리 O 감지 (여전히 지원) + 회사명 기반 추정 보조
    const oCats = [];
    const CAT_HEADER = {
      'broadcaster':'Broadcaster (방송사)', 'broadcaster방송사':'Broadcaster (방송사)',
      'streamingott':'Streaming / OTT 플랫폼', 'streamingottott플랫폼':'Streaming / OTT 플랫폼',
      'ott':'Streaming / OTT 플랫폼', 'ott플랫폼':'Streaming / OTT 플랫폼',
      'distributor':'Distributor (배급사)', 'distributor배급사':'Distributor (배급사)',
      'production':'Production (제작사)', 'production제작사':'Production (제작사)',
      'coproduction':'Co-Production Partner (공동제작)', 'coproduction공동제작':'Co-Production Partner (공동제작)',
      'coproductionpartner':'Co-Production Partner (공동제작)',
      'investor':'Investor (투자사)', 'investor투자사':'Investor (투자사)',
      'publisher':'Publisher (퍼블리셔)', 'publisher퍼블리셔':'Publisher (퍼블리셔)',
      'globalsalesagent':'Global Sales Agent (세일즈 에이전트)',
      'globalsalesagent세일즈에이전트':'Global Sales Agent (세일즈 에이전트)',
      'licensee':'Licensee (MD · 출판 · 상품화)', 'licenseemd출판상품화':'Licensee (MD · 출판 · 상품화)',
      'localization':'Localization (로컬라이제이션 · 더빙)',
      'localization로컬라이제이션더빙':'Localization (로컬라이제이션 · 더빙)',
      'merchandising':'Merchandising Partner (머천다이징)',
      'merchandising머천다이징':'Merchandising Partner (머천다이징)',
      'merchandisingpartner':'Merchandising Partner (머천다이징)',
      '기타':'기타 (Others)', '기타others':'기타 (Others)', 'others':'기타 (Others)',
    };
    const normalize = (s) => String(s).replace(/[\s\n\t·\-\/\(\)]/g, '').toLowerCase();
    keys.forEach(k => {
      const nk = normalize(k);
      const catName = CAT_HEADER[nk];
      if (catName) {
        const up = String(row[k] || '').trim().toUpperCase();
        if (up === 'O' || up === '○' || up === '◯' || up === 'Y' || up === 'YES' || up === 'TRUE' || up === '✓') {
          if (!oCats.includes(catName)) oCats.push(catName);
        }
      }
    });
    if (oCats.length === 0 && o.companyName) {
      const guessed = guessBuyerCategories(o.companyName);
      guessed.forEach(g => { if (!oCats.includes(g)) oCats.push(g); });
    }
    o.categories = oCats;

    if (!o.companySize && o.companyName) {
      const size = guessBuyerSize(o.companyName);
      if (size) o.companySize = size;
    }

    // 피칭쇼케이스 참석여부 — 다양한 헤더명 인식 + 값 정규화
    keys.forEach(k => {
      const v = row[k];
      if (v === undefined || v === null || String(v).trim() === '') return;
      const kl = k.toLowerCase().trim();
      // 헤더 매칭 — 한국어/영어 다양한 표현
      const isPitchingHeader =
        kl.includes('피칭') ||
        kl.includes('쇼케이스') ||
        kl === 'pitching showcase' ||
        kl === 'pitchingshowcase' ||
        kl === 'pitching' ||
        kl === 'showcase' ||
        kl.includes('pitching showcase') ||
        kl.includes('피칭 쇼케이스') ||
        kl.includes('피칭쇼케이스');
      if (isPitchingHeader && !o.pitchingShowcase) {
        const vs = String(v).trim();
        const vl = vs.toLowerCase();
        // 값 정규화 — 다양한 표현을 표준 3가지로
        if (['참석', 'o', '○', '◯', 'y', 'yes', '참가', '참여', '참석함', 'attend', 'attending', 'true', '✓'].includes(vl)
          || vl.includes('참석') || vl.includes('attend')) {
          o.pitchingShowcase = '참석';
        } else if (['불참', 'x', '×', 'n', 'no', '참석안함', '불참석', '참여안함', 'decline', 'not attend', 'false'].includes(vl)
          || vl.includes('불참') || vl.includes('decline') || vl === 'x' || vl === '×') {
          o.pitchingShowcase = '불참';
        } else if (['미정', 'tbd', 'pending', '검토중', '확인중', '?', 'maybe'].includes(vl)
          || vl.includes('미정') || vl.includes('tbd') || vl.includes('검토')) {
          o.pitchingShowcase = '미정';
        } else {
          // 그 외: 값 자체를 그대로 (예: 빈 값이 아닌 의미 있는 텍스트)
          o.pitchingShowcase = vs;
        }
      }
    });

    return o;
  };

  // CSV 텍스트 → DB 병합 + 자동 미팅 편성 공통 로직
  const mergeCsvToDb = (csvText, p) => {
    const rows = parseCsv(csvText);
    if (rows.length === 0) throw new Error('CSV에 데이터 행이 없습니다 (헤더만 존재하거나 빈 시트).');
    const mapped = rows.map(r => mapFormRowToBuyer(r, p)).filter(b => b.companyName);
    if (mapped.length === 0) {
      throw new Error(`파싱 가능한 행이 없습니다. 회사명 열이 인식되지 않았을 수 있습니다.\n감지된 헤더: ${Object.keys(rows[0] || {}).slice(0, 8).join(', ')}`);
    }
    // 디버그 정보 — 파싱은 됐는데 회사명이 비어 처리 못한 행이 있으면 경고
    const skippedNoName = rows.length - mapped.length;
    if (skippedNoName > 0) {
      console.warn(`[CSV] 전체 ${rows.length}행 중 ${skippedNoName}행이 회사명 누락으로 건너뜀`);
    }

    // 프로젝트 분포 진단 — 업로드 탭(p)과 CSV에 명시된 프로젝트가 다른 경우 경고
    const projectCounts = mapped.reduce((acc, b) => {
      acc[b.project] = (acc[b.project] || 0) + 1;
      return acc;
    }, {});
    const otherProjects = Object.keys(projectCounts).filter(pj => pj !== p);
    if (otherProjects.length > 0) {
      const detail = otherProjects.map(pj => `${pj} ${projectCounts[pj]}건`).join(', ');
      console.info(`[CSV] 업로드 탭 "${p}" 외 다른 프로젝트도 감지됨: ${detail} — CSV의 project 컬럼 값을 우선 적용합니다.`);
    }

    let added = 0, updated = 0, meetingsCreated = 0, meetingsSkippedNotInterested = 0, meetingsSkippedNoSlot = 0, meetingsSkippedUnmatched = 0;

    update(s => {
      const buyers = [...s.buyers];
      const meetings = [...s.meetings];
      const exhibitors = s.exhibitors || [];

      mapped.forEach(nb => {
        // 각 바이어의 실제 프로젝트는 nb.project (CSV 우선, 없으면 p)
        const buyerProject = nb.project;
        const eventConfig = EVENT_CONFIG[buyerProject];

        // (1) 바이어 등록/업데이트 — 매칭은 buyerProject 기준
        let buyerId;
        const idx = buyers.findIndex(eb =>
          eb.project === buyerProject && (
            (nb.email && eb.email && nb.email.toLowerCase() === eb.email.toLowerCase()) ||
            (!nb.email && nb.companyName && eb.companyName && nb.companyName.toLowerCase() === eb.companyName.toLowerCase())
          )
        );
        if (idx >= 0) {
          const existing = buyers[idx];
          const existingCats = getBuyerCategories(existing);
          const mergedCats = [...existingCats];
          (nb.categories || []).forEach(c => { if (!mergedCats.includes(c)) mergedCats.push(c); });
          buyers[idx] = {
            ...existing,
            contactName: existing.contactName || nb.contactName,
            position:    existing.position    || nb.position,
            email:       existing.email       || nb.email,
            phone:       existing.phone       || nb.phone,
            country:     existing.country     || nb.country,
            companySize: existing.companySize || nb.companySize,
            interestedProducts: existing.interestedProducts || nb.interestedProducts,
            preferredDates: (existing.preferredDates && existing.preferredDates.length) ? existing.preferredDates : nb.preferredDates,
            categories: mergedCats,
            // 피칭쇼케이스 — CSV에 새 값 있으면 갱신, 없으면 기존 유지
            pitchingShowcase: nb.pitchingShowcase || existing.pitchingShowcase || '',
            invitationStatus: 'accepted',
            source: existing.source || 'google_form',
          };
          buyerId = existing.id;
          updated++;
        } else {
          const seq = buyers.length + 1;
          buyerId = `BU-${buyerProject}-${String(seq).padStart(4,'0')}`;
          buyers.push({ id: buyerId, ...nb });
          added++;
        }

        // (2) 자동 미팅 편성 — 한 셀에 여러 기업 명시 가능 (쉼표·세미콜론·슬래시·줄바꿈·파이프)
        if (nb.desiredExhibitorName && nb.preferredDates && nb.preferredDates[0]) {
          // 다중 기업 분리 — 다양한 구분자 모두 지원
          const exhibitorNames = String(nb.desiredExhibitorName)
            .split(/[,;|\/\n]/)         // 쉼표, 세미콜론, 슬래시, 줄바꿈, 파이프
            .map(s => s.trim())
            .filter(s => s.length > 0);

          const date = nb.preferredDates[0];
          const handledExhIds = new Set(); // 동일 CSV 행 내 같은 참가사 중복 방지

          exhibitorNames.forEach(exhName => {
            const exhId = mapExhibitorNameToId(exhName, exhibitors, buyerProject);
            if (exhId === 'NOT_INTERESTED') {
              meetingsSkippedNotInterested++;
              return;
            }
            if (!exhId) {
              meetingsSkippedUnmatched++;
              console.warn(`[CSV] 매칭 실패: "${exhName}" (프로젝트 ${buyerProject}) — 등록된 참가사 명단 확인 필요`);
              return;
            }
            // 같은 행 내 중복 (예: "climax, climax") 방지
            if (handledExhIds.has(exhId)) return;
            handledExhIds.add(exhId);

            // DB 측 동일 바이어-참가사-날짜 미팅 중복 방지
            const exists = meetings.some(m =>
              m.exhibitorId === exhId && m.buyerId === buyerId && m.date === date
            );
            if (exists) return;

            const slot = findFirstAvailableSlot(exhId, date, meetings, eventConfig);
            if (slot) {
              meetings.push({
                id: `MT-AUTO-${Date.now()}-${meetingsCreated}-${Math.random().toString(36).slice(2,5)}`,
                exhibitorId: exhId,
                buyerId,
                date,
                time: slot,
                table: `A-${String(meetings.length + 1).padStart(2,'0')}`,
                status: 'confirmed',
                notes: exhibitorNames.length > 1
                  ? `구글폼 응답 기반 자동 편성 (다중 기업 ${exhibitorNames.length}개 중 ${exhName})`
                  : '구글폼 응답 기반 자동 편성',
                source: 'rsvp_auto',
                createdBy: 'admin',
              });
              meetingsCreated++;

              // 바이어 confirmed 동기화 — 첫 번째 매칭된 미팅 정보로 (다중 기업 시 가장 빨리 매칭된 것)
              const bIdx = buyers.findIndex(b => b.id === buyerId);
              if (bIdx >= 0 && !buyers[bIdx].confirmedDate) {
                buyers[bIdx] = {
                  ...buyers[bIdx],
                  confirmedDate: date,
                  confirmedTime: slot,
                  confirmedExhibitorId: exhId,
                };
              }
            } else {
              meetingsSkippedNoSlot++;
            }
          });
        }
      });

      return {
        ...s,
        buyers,
        meetings,
        rsvpSheetSync: {...(s.rsvpSheetSync || {MIFA:null,MIPCOM:null,CANADA:null}), [p]: new Date().toISOString()},
      };
    });
    return { added, updated, meetingsCreated, meetingsSkippedNotInterested, meetingsSkippedNoSlot, meetingsSkippedUnmatched };
  };

  // CSV 파일 업로드 — 스프레드시트에서 다운로드한 CSV를 직접 업로드하여 DB에 병합
  const handleFileUpload = (p, file) => {
    if (!file) return;
    setSyncing(p);
    setSyncError(e => ({...e, [p]: null}));

    // 한글 깨짐 감지 함수 — 깨진 한글 패턴이 많으면 EUC-KR로 재시도
    const isProbablyMojibake = (text) => {
      // UTF-8로 EUC-KR 텍스트를 읽으면  (0xFFFD) 문자가 자주 나타남
      const replacementChars = (text.match(/\uFFFD/g) || []).length;
      // 한글 문자가 거의 없는데 텍스트가 많으면 의심
      const koreanChars = (text.match(/[\uAC00-\uD7AF]/g) || []).length;
      return replacementChars > 5 || (text.length > 200 && koreanChars === 0 && /[가-힣]/.test(file.name));
    };

    const tryParse = (text) => {
      try {
        const result = mergeCsvToDb(text, p);
        setSyncResult({ project: p, ...result, ts: new Date(), via: 'file' });
        setTimeout(() => setSyncResult(null), 12000);
        setSyncing(null);
        return true;
      } catch (e) {
        return e;
      }
    };

    // 1차 시도: UTF-8
    const reader1 = new FileReader();
    reader1.onload = (ev) => {
      const text = ev.target.result;
      if (isProbablyMojibake(text)) {
        // 한글 깨짐 감지 → EUC-KR로 재시도
        const reader2 = new FileReader();
        reader2.onload = (ev2) => {
          const r = tryParse(ev2.target.result);
          if (r !== true) {
            setSyncError(err => ({...err, [p]: r.message || String(r)}));
            setSyncing(null);
          }
        };
        reader2.onerror = () => {
          setSyncError(err => ({...err, [p]: 'CSV 파일을 읽는데 실패했습니다.'}));
          setSyncing(null);
        };
        reader2.readAsText(file, 'EUC-KR');
      } else {
        const r = tryParse(text);
        if (r !== true) {
          setSyncError(err => ({...err, [p]: r.message || String(r)}));
          setSyncing(null);
        }
      }
    };
    reader1.onerror = () => {
      setSyncError(err => ({...err, [p]: 'CSV 파일을 읽는데 실패했습니다.'}));
      setSyncing(null);
    };
    reader1.readAsText(file, 'UTF-8');
  };

  const projectStats = (p) => {
    const invited = fullState.buyers.filter(b => b.project === p && b.invitationStatus);
    const accepted = invited.filter(b => b.invitationStatus === 'accepted');
    const pending  = invited.filter(b => ['sent','pending'].includes(b.invitationStatus));
    const googleForm = fullState.buyers.filter(b => b.project === p && b.source === 'google_form').length;
    return { invited: invited.length, accepted: accepted.length, pending: pending.length, googleForm };
  };

  // 출처별 필터 (ALL = 전체, csv = CSV 업로드, meeting = 미팅 등록, manual = RSVP 수동, exhibitor = 참가사 등록, other = 기타)
  const [sourceFilter, setSourceFilter] = useState('ALL');

  // 행사별 필터 1차 적용 — 카운트 계산용
  const buyersByProject = fullState.buyers
    .filter(b => b.project === subProject && b.invitationStatus === 'accepted');

  // 출처별 카운트
  const sourceCounts = {
    ALL: buyersByProject.length,
    csv: buyersByProject.filter(b => b.source === 'google_form').length,
    meeting: buyersByProject.filter(b => b.source === 'admin_added').length,
    manual: buyersByProject.filter(b => b.source === 'manual_rsvp').length,
    exhibitor: buyersByProject.filter(b => b.source === 'exhibitor_added').length,
    other: buyersByProject.filter(b => !b.source || (
      b.source !== 'google_form' &&
      b.source !== 'admin_added' &&
      b.source !== 'manual_rsvp' &&
      b.source !== 'exhibitor_added'
    )).length,
  };

  // 출처별 2차 필터 적용
  const respondedBuyers = buyersByProject
    .filter(b => {
      if (sourceFilter === 'ALL') return true;
      if (sourceFilter === 'csv') return b.source === 'google_form';
      if (sourceFilter === 'meeting') return b.source === 'admin_added';
      if (sourceFilter === 'manual') return b.source === 'manual_rsvp';
      if (sourceFilter === 'exhibitor') return b.source === 'exhibitor_added';
      if (sourceFilter === 'other') return !b.source || (
        b.source !== 'google_form' &&
        b.source !== 'admin_added' &&
        b.source !== 'manual_rsvp' &&
        b.source !== 'exhibitor_added'
      );
      return true;
    })
    .sort((a,b) => (a.companyName||'').localeCompare(b.companyName||''));

  const createMeeting = (buyer) => {
    const candidates = fullState.exhibitors
      .filter(ex => ex.project === buyer.project)
      .map(ex => ({ex, ...matchScore(ex, buyer)}))
      .sort((a,b) => b.score - a.score);
    if (candidates.length === 0) { alert('해당 프로젝트에 등록된 참가사가 없습니다.'); return; }
    const best = candidates[0];
    const date = (buyer.preferredDates && buyer.preferredDates[0]) || '2026-06-10';
    const slots = ['09:30','10:00','10:30','11:00','11:30','13:30','14:00','14:30','15:00','15:30','16:00','16:30'];
    const used = new Set(fullState.meetings.filter(m => m.date === date).map(m => m.time));
    const time = slots.find(t => !used.has(t)) || '17:00';
    const tableNum = String(fullState.meetings.length + 1).padStart(2, '0');
    const newMeeting = {
      id: `MT-${String(fullState.meetings.length + 1).padStart(3,'0')}`,
      exhibitorId: best.ex.id,
      buyerId: buyer.id,
      date, time,
      table: `${['A','B','C','D'][Math.floor(Math.random()*4)]}-${tableNum}`,
      status: 'confirmed',
      notes: '',
      source: 'rsvp_match',
      createdBy: 'admin',
    };
    update(s => ({...s, meetings: [...s.meetings, newMeeting]}));
    alert(`미팅이 생성되었습니다.\n\n${best.ex.companyName} × ${buyer.companyName}\n${date} ${time} · Table ${newMeeting.table}\n매칭 점수 ${best.score} / 100`);
  };

  return (
    <div className="fade-in">
      <SectionHeader eyebrow="WORKFLOW / RSVP" title="RSVP 회신 관리"
        desc={readOnly
          ? "각 행사별 바이어 RSVP 회신 현황을 확인합니다. 행사별 탭에서 회신 완료된 바이어 명단과 희망 미팅일, 선호 콘텐츠를 조회할 수 있습니다."
          : "행사별로 구글폼 응답 CSV 파일을 업로드하면 응답이 바이어 DB에 자동 누적됩니다. 구글 스프레드시트에서 '파일 → 다운로드 → CSV'로 받은 파일을 그대로 올리면 됩니다."} />

      {/* 동기화 결과 토스트 (관리자 모드에서만) */}
      {!readOnly && syncResult && (
        <div style={{marginTop:20, padding:'14px 18px', background:'#DCFCE7', border:'1px solid #16A34A', borderRadius:'var(--radius-sm)', fontSize:12.5, color:'#166534', lineHeight:1.7}}>
          <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:6}}>
            <Check size={14}/>
            <strong>{syncResult.project}</strong> CSV 업로드 완료 · {syncResult.ts.toLocaleTimeString('ko-KR')}
          </div>
          <div style={{display:'flex', gap:14, flexWrap:'wrap', fontSize:11.5, paddingLeft:24}}>
            <span>📥 신규 바이어 <strong>{syncResult.added}</strong>건</span>
            <span>✏️ 기존 업데이트 <strong>{syncResult.updated}</strong>건</span>
            {syncResult.meetingsCreated > 0 && <span>📅 자동 미팅 편성 <strong>{syncResult.meetingsCreated}</strong>건</span>}
            {syncResult.meetingsSkippedNotInterested > 0 && <span style={{color:'#92400E'}}>⏭ Not Interested 제외 <strong>{syncResult.meetingsSkippedNotInterested}</strong>건</span>}
            {syncResult.meetingsSkippedUnmatched > 0 && <span style={{color:'#92400E'}}>⚠ 참가사 미매칭 <strong>{syncResult.meetingsSkippedUnmatched}</strong>건</span>}
            {syncResult.meetingsSkippedNoSlot > 0 && <span style={{color:'#92400E'}}>⚠ 슬롯 부족 <strong>{syncResult.meetingsSkippedNoSlot}</strong>건</span>}
          </div>
        </div>
      )}

      {/* 프로젝트별 CSV 업로드 카드 — KOCCA 뷰어 모드에서는 통째로 숨김 */}
      {!readOnly && (
      <div className="grid stagger" style={{gridTemplateColumns:'repeat(3, 1fr)', gap:14, marginTop:24}}>
        {projects.map(p => {
          const col = projectColor(p);
          const stat = projectStats(p);
          const lastSync = syncTimes[p];
          const isSyncing = syncing === p;
          const err = syncError[p];
          return (
            <div key={p} className="card" style={{padding:22}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
                <ProjectBadge project={p} size="lg"/>
                <div className="mono tabular" style={{fontSize:11, color:'var(--muted)'}}>
                  <span style={{color: col.bg, fontWeight:700, fontSize:14}}>{stat.accepted}</span>
                  <span style={{margin:'0 4px'}}>/</span>
                  {stat.invited} 회신
                </div>
              </div>

              {/* CSV 파일 업로드 — 메인 CTA */}
              <input type="file" ref={fileRefs[p]} accept=".csv,text/csv"
                     style={{display:'none'}}
                     onChange={e => { handleFileUpload(p, e.target.files[0]); e.target.value=''; }}/>
              <button className="btn btn-primary" style={{width:'100%', padding:'12px 14px', fontSize:12.5, justifyContent:'center', background: col.bg, borderColor: col.bg}}
                      onClick={()=>fileRefs[p].current?.click()} disabled={isSyncing}>
                {isSyncing ? (
                  <>
                    <span style={{display:'inline-block', width:12, height:12, border:'2px solid rgba(255,255,255,0.4)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.8s linear infinite'}}/>
                    처리 중...
                  </>
                ) : (
                  <>
                    <FileSpreadsheet size={13}/>응답 CSV 업로드
                  </>
                )}
              </button>
              <div style={{fontSize:10, color:'var(--muted-2)', marginTop:8, lineHeight:1.55, textAlign:'center'}}>
                구글 스프레드시트에서 <strong style={{color:'var(--muted)'}}>파일 → 다운로드 → CSV</strong>로 받은 파일 업로드
              </div>

              {/* 에러 메시지 */}
              {err && (
                <div style={{marginTop:10, padding:'9px 11px', background:'#FEF2F2', border:'1px solid #FCA5A5', borderRadius:'var(--radius-sm)', fontSize:10.5, color:'#991B1B', lineHeight:1.6, whiteSpace:'pre-wrap'}}>
                  <div style={{display:'flex', alignItems:'flex-start', gap:5}}>
                    <AlertCircle size={11} style={{marginTop:1, flexShrink:0}}/>
                    <div style={{flex:1}}>{err}</div>
                  </div>
                </div>
              )}

              {/* 상태 정보 */}
              <div style={{marginTop:12, padding:'10px 12px', background:'var(--ivory-2)', borderRadius:'var(--radius-sm)', fontSize:10.5, color:'var(--muted)', lineHeight:1.6}}>
                <div style={{display:'flex', alignItems:'center', gap:6}}>
                  <FileSpreadsheet size={10}/>
                  <span>구글폼 자동수집 <strong style={{color:'var(--ink-2)'}}>{stat.googleForm}</strong>건</span>
                </div>
                {lastSync ? (
                  <div style={{marginTop:3, fontSize:10}}>
                    마지막 업로드: {new Date(lastSync).toLocaleString('ko-KR')}
                  </div>
                ) : (
                  <div style={{marginTop:3, fontSize:10, color:'var(--muted-2)'}}>
                    아직 업로드된 적 없음
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* RSVP 수동 등록 버튼 (KOCCA 뷰어는 헤더만 표시, 등록 버튼 숨김) */}
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', margin: readOnly ? '24px 0 14px' : '36px 0 14px'}}>
        <div>
          <div className="mono" style={{fontSize:10, letterSpacing:'0.15em', color:'var(--muted)', marginBottom:4}}>RESPONDED BUYERS · READY FOR MEETING</div>
          <div className="serif" style={{fontSize:20, fontWeight:600}}>RSVP 회신 완료 바이어</div>
        </div>
        <div style={{display:'flex', alignItems:'center', gap:14}}>
          <div className="mono" style={{fontSize:11, color:'var(--muted)', letterSpacing:'0.15em'}}>
            {respondedBuyers.length} BUYERS · {subProject}
          </div>
          {!readOnly && (
          <button className="btn btn-primary" style={{padding:'7px 14px', fontSize:12}} onClick={()=>setShowRegister(true)}>
            <Plus size={12}/>RSVP 수동 등록
          </button>
          )}
        </div>
      </div>

      {/* 행사 서브 스위처 */}
      <div style={{display:'flex', gap:8, marginBottom:14, flexWrap:'wrap'}}>
        {projects.map(p => {
          const active = subProject === p;
          const col = projectColor(p);
          const cnt = fullState.buyers.filter(b => b.project === p && b.invitationStatus === 'accepted').length;
          return (
            <button key={p} onClick={()=>setSubProject(p)} style={{
              padding:'8px 16px', borderRadius:'var(--radius-sm)', cursor:'pointer',
              border: active ? `1px solid ${col.bg}` : '1px solid var(--line)',
              background: active ? col.bg : 'var(--paper)',
              color: active ? col.fg : 'var(--ink-2)',
              fontSize:12.5, fontWeight:600, fontFamily:'inherit',
              display:'inline-flex', alignItems:'center', gap:8,
              letterSpacing:'-0.005em', transition:'all .15s',
            }}>
              {p}
              <span className="mono tabular" style={{fontSize:10.5, opacity: active ? 0.8 : 0.55, padding:'1px 7px', background: active ? 'rgba(0,0,0,0.18)' : 'var(--ivory-2)', borderRadius:4}}>{cnt}</span>
            </button>
          );
        })}
      </div>

      {/* 출처별 필터 탭 — 클릭으로 해당 출처 바이어만 필터링 */}
      <div style={{
        display:'flex', gap:6, marginBottom:14, flexWrap:'wrap',
        padding:'10px 12px', background:'var(--ivory-2)',
        borderRadius:'var(--radius-sm)', border:'1px solid var(--line)',
        alignItems:'center',
      }}>
        <span className="mono" style={{fontSize:10, letterSpacing:'0.18em', color:'var(--muted)', fontWeight:700, marginRight:6}}>
          출처별 보기
        </span>
        {[
          {k:'ALL',      l:'전체',         color:'#475569', icon:null},
          {k:'csv',      l:'CSV 업로드',   color:'#2563EB', icon:<FileSpreadsheet size={11}/>},
          {k:'meeting',  l:'미팅 등록',    color:'#F59E0B', icon:<Calendar size={11}/>},
          {k:'manual',   l:'RSVP 수동',    color:'#7C3AED', icon:<Plus size={11}/>},
          {k:'exhibitor',l:'참가사 등록',  color:'#059669', icon:<User2 size={11}/>},
          {k:'other',    l:'기타',         color:'#94A3B8', icon:null},
        ].map(opt => {
          const active = sourceFilter === opt.k;
          const count = sourceCounts[opt.k] || 0;
          if (count === 0 && opt.k !== 'ALL') return null; // 0건이면 표시 안 함 (전체는 항상 표시)
          return (
            <button key={opt.k} onClick={()=>setSourceFilter(opt.k)} style={{
              padding:'5px 11px', borderRadius:999, cursor:'pointer',
              border: active ? `1px solid ${opt.color}` : '1px solid var(--line)',
              background: active ? opt.color : 'var(--paper)',
              color: active ? '#fff' : 'var(--ink-2)',
              fontSize:11.5, fontWeight:600, fontFamily:'inherit',
              display:'inline-flex', alignItems:'center', gap:5,
              transition:'all .15s',
            }}>
              {opt.icon}
              {opt.l}
              <span className="mono tabular" style={{
                fontSize:10, padding:'1px 6px', borderRadius:999,
                background: active ? 'rgba(255,255,255,0.25)' : 'var(--ivory-2)',
                color: active ? '#fff' : 'var(--muted)',
                fontWeight:700, marginLeft:1,
              }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="card" style={{overflow:'hidden'}}>
        <div className="scroll-x">
          <table className="mice-table">
            <thead>
              <tr>
                <th style={{width:80}}>프로젝트</th>
                <th style={{width:170}}>카테고리</th>
                <th>회사명 / 담당자</th>
                <th style={{width:90}}>국가</th>
                <th style={{width:260}}>선호 콘텐츠</th>
                <th style={{width:110}}>피칭쇼케이스</th>
                <th>희망 미팅일</th>
                <th style={{width:130}}>액션</th>
              </tr>
            </thead>
            <tbody>
              {respondedBuyers.length === 0 && (
                <tr><td colSpan={8} style={{textAlign:'center', padding:48, color:'var(--muted)'}}>
                  RSVP 회신이 접수된 바이어가 없습니다.<br/>
                  <span style={{fontSize:12, color:'var(--muted-2)'}}>
                    "초청 &amp; 회신" 탭에서 바이어 초청을 발송하거나 구글폼 응답을 수동 반영하세요.
                  </span>
                </td></tr>
              )}
              {respondedBuyers.map(b => {
                const hasMeeting = fullState.meetings.some(m => m.buyerId === b.id);
                return (
                  <tr key={b.id}>
                    <td><ProjectBadge project={b.project}/></td>
                    <td><CategoriesBadges buyer={b} maxShow={2}/></td>
                    <td>
                      <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
                        <div onClick={()=>setDetailBuyer(b)}
                             className="serif"
                             style={{fontSize:14, fontWeight:600, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:6}}
                             title="클릭하여 상세 정보 보기">
                          <span style={{borderBottom:'1px dotted var(--muted)'}}>{b.companyName}</span>
                          <Eye size={11} style={{color:'var(--muted-2)', flexShrink:0}}/>
                        </div>
                      </div>
                      <div style={{fontSize:11.5, color:'var(--muted)', marginTop:3}}>
                        {b.contactName || '—'}{b.email && <> · <span className="mono" style={{fontSize:11}}>{b.email}</span></>}
                      </div>
                    </td>
                    <td style={{fontSize:12.5}}>{b.country || '—'}</td>
                    <td>
                      <PreferredContentSummary buyer={b}/>
                    </td>
                    <td>
                      {(() => {
                        const ps = b.pitchingShowcase;
                        if (!ps || ps === '') {
                          return <span style={{fontSize:11.5, color:'var(--muted-2)'}}>—</span>;
                        }
                        const colors = {
                          '참석': {bg:'#DCFCE7', border:'#16A34A', color:'#166534'},
                          '불참': {bg:'#FEE2E2', border:'#DC2626', color:'#991B1B'},
                          '미정': {bg:'#FEF3C7', border:'#F59E0B', color:'#92400E'},
                        };
                        const c = colors[ps] || {bg:'var(--ivory-2)', border:'var(--line)', color:'var(--muted)'};
                        return (
                          <span style={{
                            display:'inline-flex', alignItems:'center', justifyContent:'center',
                            padding:'3px 10px', fontSize:11, fontWeight:600,
                            background: c.bg, border: `1px solid ${c.border}`, color: c.color,
                            borderRadius:4, minWidth:48, textAlign:'center',
                          }}>
                            {ps}
                          </span>
                        );
                      })()}
                    </td>
                    <td>
                      {(() => {
                        const hopeDates = (b.preferredDates && b.preferredDates.length > 0) ? b.preferredDates : [];
                        const confirmedDate = b.confirmedDate;
                        const confirmedTime = b.confirmedTime;

                        if (hopeDates.length === 0 && !confirmedDate) {
                          return <span style={{color:'var(--muted-2)', fontSize:12}}>미지정</span>;
                        }

                        return (
                          <div style={{display:'flex', flexDirection:'column', gap:3}}>
                            {/* 확정 일정 (있으면 강조 — 윗줄) */}
                            {confirmedDate && (
                              <div style={{display:'flex', alignItems:'center', gap:5, flexWrap:'wrap'}}>
                                <span style={{fontSize:9, color:'#16A34A', fontWeight:700, letterSpacing:'0.06em'}}>확정</span>
                                <span className="mono" style={{
                                  fontSize:11, padding:'2px 7px',
                                  background:'#DCFCE7', border:'1px solid #16A34A',
                                  color:'#166534', borderRadius:4, fontWeight:600,
                                }}>
                                  {confirmedDate}{confirmedTime ? ` · ${confirmedTime}` : ''}
                                </span>
                              </div>
                            )}
                            {/* 희망 일정 (배지로 — 아랫줄) */}
                            {hopeDates.length > 0 && (
                              <div style={{display:'flex', alignItems:'center', gap:5, flexWrap:'wrap'}}>
                                <span style={{fontSize:9, color:'var(--muted)', fontWeight:700, letterSpacing:'0.06em'}}>희망</span>
                                {hopeDates.map(d => {
                                  const matched = d === confirmedDate;
                                  return (
                                    <span key={d} className="mono" style={{
                                      fontSize:10.5, padding:'2px 7px',
                                      background: matched ? 'transparent' : 'var(--ivory-2)',
                                      border: matched ? '1px dashed var(--muted-2)' : '1px solid var(--line)',
                                      color: matched ? 'var(--muted-2)' : 'var(--ink-2)',
                                      borderRadius:4,
                                      textDecoration: matched ? 'line-through' : 'none',
                                    }}>{d}</span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td>
                      <div style={{display:'flex', alignItems:'center', gap:6}}>
                        {hasMeeting
                          ? <span style={{display:'inline-flex', alignItems:'center', gap:5, fontSize:12, color:'var(--green)', fontWeight:500}}><Check size={12}/>미팅 편성됨</span>
                          : (readOnly
                              ? <span style={{fontSize:11.5, color:'var(--muted-2)'}}>—</span>
                              : <button className="btn btn-primary" style={{padding:'6px 12px', fontSize:11.5}} onClick={()=>createMeeting(b)}>
                                  <Plus size={11}/>미팅 생성
                                </button>)}
                        {!readOnly && (
                        <button className="btn btn-danger" style={{padding:'5px 9px', fontSize:11.5, marginLeft:'auto'}}
                                title={hasMeeting ? '바이어 + 연결 미팅 삭제' : '바이어 삭제'}
                                onClick={()=>deleteBuyer(b)}>
                          <Trash2 size={11}/>
                        </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{marginTop:20, padding:18, background:'var(--navy)', color:'var(--ivory)', borderLeft:'3px solid var(--gold)'}}>
        <div className="mono" style={{fontSize:10, letterSpacing:'0.2em', color:'var(--gold)', marginBottom:6}}>PRODUCTION INTEGRATION NOTE</div>
        <div style={{fontSize:12.5, lineHeight:1.7, opacity:0.88}}>
          실 운영 시 구글폼 응답은 Apps Script가 자동으로 본 플랫폼 API(<span className="mono">POST /api/rsvp</span>)로 전달되어
          바이어의 회신 상태·희망 일자·카테고리가 즉시 반영됩니다. 본 프로토타입에서는 "초청 &amp; 회신" 탭의 수동 시뮬레이션으로 동일 흐름을 재현합니다.
        </div>
      </div>

      {showRegister && <RsvpRegisterModal
        fullState={fullState}
        defaultProject={subProject}
        onClose={()=>setShowRegister(false)}
        onSubmit={(buyer)=>{
          update(s => ({...s, buyers: [...s.buyers, buyer]}));
          setShowRegister(false);
        }}
      />}

      {/* 바이어 상세 조회 모달 */}
      <BuyerDetailModal
        buyer={detailBuyer}
        fullState={fullState}
        onClose={()=>setDetailBuyer(null)}
      />

      {/* 삭제 확인 모달 */}
      {confirmData && (
        <Modal title={confirmData.title} onClose={()=>setConfirmData(null)}>
          <div style={{fontSize:13.5, lineHeight:1.7, color:'var(--ink-2)', padding:'4px 0 8px', whiteSpace:'pre-wrap'}}>{confirmData.message}</div>
          <div style={{display:'flex', justifyContent:'flex-end', gap:8, marginTop:24}}>
            <button className="btn btn-ghost" onClick={()=>setConfirmData(null)}>취소</button>
            <button className="btn btn-danger" onClick={()=>{try{confirmData.onConfirm();}finally{setConfirmData(null);}}}>
              <Trash2 size={13}/>{confirmData.confirmLabel || '삭제'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ============================================================================
// RSVP 수동 등록 모달 — 회사명 입력 시 분야/카테고리 자동 추정
// ============================================================================

function RsvpRegisterModal({fullState, defaultProject, onClose, onSubmit}){
  const [form, setForm] = useState({
    companyName: '', contactName: '', position: '', email: '', phone: '', country: '',
    project: defaultProject,
    category: '', categories: [],
    companySize: '', interestedProducts: '',
    interestedGenres: [], interestedFormats: [], interestedTargetAges: [], interestedRegions: [],
    pitchingShowcase: '',  // 피칭쇼케이스 참석여부
    preferredDates: [],
  });
  const [autoFilled, setAutoFilled] = useState(false);

  const dates = (EVENT_CONFIG[form.project]?.dates || []).map(d => d.date);

  const handleCompanyChange = (name) => {
    const updates = { companyName: name };
    const cats = guessBuyerCategories(name);
    const size = guessBuyerSize(name);
    if ((cats.length > 0 || size) && name.trim().length >= 3) {
      if (cats.length > 0) {
        updates.categories = cats;
        updates.category = cats[0]; // 레거시 호환
      }
      if (size) updates.companySize = size;
      setAutoFilled(true);
    } else if (!name.trim()) {
      setAutoFilled(false);
    }
    setForm(f => ({...f, ...updates}));
  };

  const toggleDate = (d) => {
    setForm(f => ({...f, preferredDates: f.preferredDates.includes(d)
      ? f.preferredDates.filter(x => x !== d)
      : [...f.preferredDates, d]}));
  };

  const submit = () => {
    if (!form.companyName.trim()) { alert('회사명은 필수 입력입니다.'); return; }
    const id = `BU-${form.project}-${String(fullState.buyers.length + 1).padStart(4,'0')}`;
    const buyer = {
      ...form,
      id,
      invitationStatus: 'accepted', // RSVP 수락 처리
      preferredDates: form.preferredDates,
      source: 'manual_rsvp', // RSVP 수동 등록 출처
    };
    onSubmit(buyer);
  };

  return (
    <Modal title="RSVP 수동 등록" onClose={onClose}>
      <div style={{padding:'10px 14px', background:'var(--ivory-2)', fontSize:12, color:'var(--muted)', marginBottom:18, lineHeight:1.7, borderRadius:'var(--radius-sm)'}}>
        구글폼으로 수신한 바이어 RSVP 응답을 수동으로 바이어 DB에 등록합니다.
        회사명을 입력하면 <b>분야/카테고리가 자동으로 감지</b>됩니다 (관리자가 수정 가능).
      </div>

      <div className="grid" style={{gridTemplateColumns:'1fr 1fr', gap:16}}>
        <div style={{gridColumn:'1 / -1'}}>
          <label className="label">회사명 <span style={{color:'var(--red)'}}>*</span></label>
          <input className="input" value={form.companyName}
                 onChange={e=>handleCompanyChange(e.target.value)}
                 placeholder="예: Netflix, BBC Studios, Bandai Namco"/>
          {autoFilled && (
            <div style={{marginTop:6, fontSize:11, color:'var(--green)', display:'flex', alignItems:'center', gap:5}}>
              <Sparkles size={11}/>회사명 기반 분야·카테고리 자동 감지
            </div>
          )}
        </div>

        <div>
          <label className="label">프로젝트</label>
          <select className="select" value={form.project} onChange={e=>setForm({...form, project:e.target.value})}>
            <option value="MIFA">MIFA</option>
            <option value="MIPCOM">MIPCOM</option>
            <option value="CANADA">CANADA</option>
          </select>
        </div>

        <div style={{gridColumn:'1 / -1'}}>
          <label className="label">카테고리 <span style={{fontWeight:400, color:'var(--muted)', fontSize:11}}>(복수 선택 가능)</span></label>
          <div style={{display:'flex', flexWrap:'wrap', gap:6, marginTop:4}}>
            {BUYER_CATEGORIES.map(c => {
              const selected = (form.categories || []).includes(c);
              const bg = CATEGORY_PALETTE[c] || '#475569';
              return (
                <button key={c} type="button"
                  onClick={()=>{
                    const cur = form.categories || [];
                    const next = cur.includes(c) ? cur.filter(x => x !== c) : [...cur, c];
                    setForm({...form, categories: next, category: next[0] || ''});
                  }}
                  style={{
                    padding:'5px 11px', borderRadius:999, cursor:'pointer',
                    border: selected ? `1px solid ${bg}` : '1px solid var(--line)',
                    background: selected ? bg : 'var(--paper)',
                    color: selected ? '#fff' : 'var(--ink-2)',
                    fontSize:11, fontWeight:600, fontFamily:'inherit',
                    transition:'all .15s',
                  }}>
                  {c}
                </button>
              );
            })}
          </div>
        </div>

        {/* ======= 매칭용 관심 필드 ======= */}
        <div style={{gridColumn:'1 / -1', padding:'14px 16px', background:'var(--purple-lt)', border:'1px solid var(--purple)', borderRadius:'var(--radius-sm)'}}>
          <div className="mono" style={{fontSize:10, letterSpacing:'0.18em', color:'var(--purple-dk)', fontWeight:700, marginBottom:4}}>
            PREFERRED CONTENT · 선호 콘텐츠
          </div>
          <div style={{fontSize:11, color:'var(--ink-2)', lineHeight:1.5, marginBottom:10}}>
            바이어의 타겟 연령 · 장르 · 포맷 · 권역 선호도를 선택하면 IP × 바이어 매칭 매트릭스에 자동 반영됩니다.
          </div>

          <label className="label" style={{marginTop:4}}>관심 장르 <span style={{fontWeight:400, color:'var(--muted)', fontSize:10.5}}>(Genres)</span></label>
          <div style={{display:'flex', flexWrap:'wrap', gap:5, marginBottom:12}}>
            {GENRE_OPTIONS.map(g => {
              const arr = form.interestedGenres || [];
              const sel = arr.includes(g);
              return (
                <button key={g} type="button"
                  onClick={()=>{
                    const next = sel ? arr.filter(x=>x!==g) : [...arr, g];
                    setForm({...form, interestedGenres: next});
                  }}
                  style={{
                    padding:'4px 10px', borderRadius:999, cursor:'pointer',
                    border: sel ? '1px solid var(--purple)' : '1px solid var(--line)',
                    background: sel ? 'var(--purple)' : 'var(--paper)',
                    color: sel ? '#fff' : 'var(--ink-2)',
                    fontSize:10.5, fontWeight:600, fontFamily:'inherit',
                    transition:'all .15s',
                  }}>
                  {g}
                </button>
              );
            })}
          </div>

          <label className="label">관심 포맷 <span style={{fontWeight:400, color:'var(--muted)', fontSize:10.5}}>(Formats)</span></label>
          <div style={{display:'flex', flexWrap:'wrap', gap:5, marginBottom:12}}>
            {FORMAT_OPTIONS.map(f => {
              const arr = form.interestedFormats || [];
              const sel = arr.includes(f);
              return (
                <button key={f} type="button"
                  onClick={()=>{
                    const next = sel ? arr.filter(x=>x!==f) : [...arr, f];
                    setForm({...form, interestedFormats: next});
                  }}
                  style={{
                    padding:'4px 10px', borderRadius:999, cursor:'pointer',
                    border: sel ? '1px solid var(--purple)' : '1px solid var(--line)',
                    background: sel ? 'var(--purple)' : 'var(--paper)',
                    color: sel ? '#fff' : 'var(--ink-2)',
                    fontSize:10.5, fontWeight:600, fontFamily:'inherit',
                    transition:'all .15s',
                  }}>
                  {f}
                </button>
              );
            })}
          </div>

          <label className="label">타겟 연령 <span style={{fontWeight:400, color:'var(--muted)', fontSize:10.5}}>(Target Ages)</span></label>
          <div style={{display:'flex', flexWrap:'wrap', gap:5, marginBottom:12}}>
            {TARGET_AGE_OPTIONS.map(t => {
              const arr = form.interestedTargetAges || [];
              const sel = arr.includes(t);
              return (
                <button key={t} type="button"
                  onClick={()=>{
                    const next = sel ? arr.filter(x=>x!==t) : [...arr, t];
                    setForm({...form, interestedTargetAges: next});
                  }}
                  style={{
                    padding:'4px 10px', borderRadius:999, cursor:'pointer',
                    border: sel ? '1px solid var(--purple)' : '1px solid var(--line)',
                    background: sel ? 'var(--purple)' : 'var(--paper)',
                    color: sel ? '#fff' : 'var(--ink-2)',
                    fontSize:10.5, fontWeight:600, fontFamily:'inherit',
                    transition:'all .15s',
                  }}>
                  {t}
                </button>
              );
            })}
          </div>

          {/* 관심 권역 — 국가 기반 자동 감지 + 수동 편집 */}
          <label className="label" style={{display:'flex', alignItems:'center', gap:6}}>
            권역 <span style={{fontWeight:400, color:'var(--muted)', fontSize:10.5}}>(Regions)</span>
            {(() => {
              const autoRegion = getBuyerRegion(form.country);
              const currentRegions = form.interestedRegions || [];
              if (autoRegion && currentRegions.length === 0) {
                const regLabel = (REGIONS.find(r => r.key === autoRegion) || {}).label || autoRegion;
                return (
                  <span style={{fontSize:10, color:'var(--purple-dk)', fontWeight:600, marginLeft:4, padding:'2px 7px', background:'rgba(255,255,255,0.7)', borderRadius:3}}>
                    <Sparkles size={9} style={{verticalAlign:'middle', marginRight:3}}/>
                    자동 감지: {regLabel.split(' · ')[0]}
                  </span>
                );
              }
              return null;
            })()}
          </label>
          <div style={{display:'flex', flexWrap:'wrap', gap:5}}>
            {REGIONS.map(r => {
              const arr = form.interestedRegions || [];
              const sel = arr.includes(r.key);
              const autoRegion = getBuyerRegion(form.country);
              const isAuto = autoRegion === r.key && arr.length === 0;
              return (
                <button key={r.key} type="button"
                  onClick={()=>{
                    const cur = form.interestedRegions || [];
                    const next = cur.includes(r.key) ? cur.filter(x=>x!==r.key) : [...cur, r.key];
                    setForm({...form, interestedRegions: next});
                  }}
                  style={{
                    padding:'4px 10px', borderRadius:999, cursor:'pointer',
                    border: sel ? '1px solid var(--purple)' : isAuto ? '1px dashed var(--purple)' : '1px solid var(--line)',
                    background: sel ? 'var(--purple)' : isAuto ? 'rgba(139,92,246,0.08)' : 'var(--paper)',
                    color: sel ? '#fff' : isAuto ? 'var(--purple-dk)' : 'var(--ink-2)',
                    fontSize:10.5, fontWeight:600, fontFamily:'inherit',
                    transition:'all .15s',
                  }}
                  title={isAuto ? '국가 기반 자동 감지 — 클릭해서 명시 선택' : undefined}
                >
                  {r.label.split(' · ')[0]}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="label">담당자 (바이어명)</label>
          <input className="input" value={form.contactName} onChange={e=>setForm({...form, contactName:e.target.value})}
                 placeholder="예: John Doe"/>
        </div>

        <div>
          <label className="label">직급</label>
          <input className="input" value={form.position} onChange={e=>setForm({...form, position:e.target.value})}
                 placeholder="예: Head of Content"/>
        </div>

        <div>
          <label className="label">이메일</label>
          <input className="input" type="email" value={form.email} onChange={e=>setForm({...form, email:e.target.value})}/>
        </div>

        <div>
          <label className="label">연락처</label>
          <input className="input" value={form.phone} onChange={e=>setForm({...form, phone:e.target.value})}
                 placeholder="+1-310-555-0100"/>
        </div>

        <div style={{gridColumn:'1 / -1'}}>
          <label className="label">국가</label>
          <input className="input" value={form.country} onChange={e=>setForm({...form, country:e.target.value})}/>
        </div>

        <div>
          <label className="label">기업 규모</label>
          <select className="select" value={form.companySize} onChange={e=>setForm({...form, companySize:e.target.value})}>
            <option value="">선택하세요</option>
            <option value="대기업">대기업</option>
            <option value="중견">중견</option>
            <option value="스타트업">스타트업</option>
            <option value="독립">독립</option>
          </select>
        </div>

        <div style={{gridColumn:'1 / -1'}}>
          <label className="label">관심 품목</label>
          <input className="input" value={form.interestedProducts} onChange={e=>setForm({...form, interestedProducts:e.target.value})}
                 placeholder="예: 키즈 애니메이션, IP 라이선스"/>
        </div>

        <div style={{gridColumn:'1 / -1'}}>
          <label className="label">피칭쇼케이스 참석여부</label>
          <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
            {['참석', '불참', '미정'].map(opt => {
              const selected = form.pitchingShowcase === opt;
              const colors = {'참석':'#16A34A', '불참':'#DC2626', '미정':'#F59E0B'};
              return (
                <button key={opt} type="button"
                  onClick={()=>setForm({...form, pitchingShowcase: selected ? '' : opt})}
                  style={{
                    padding:'7px 16px', borderRadius:999, cursor:'pointer',
                    border: selected ? `1px solid ${colors[opt]}` : '1px solid var(--line)',
                    background: selected ? colors[opt] : 'var(--paper)',
                    color: selected ? '#fff' : 'var(--ink-2)',
                    fontSize:12, fontWeight:600, fontFamily:'inherit',
                    transition:'all .15s',
                  }}>
                  {opt}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{gridColumn:'1 / -1'}}>
          <label className="label">희망 미팅일 (복수 선택)</label>
          {dates.length === 0
            ? <div style={{padding:10, background:'var(--ivory-2)', fontSize:12, color:'var(--muted)', borderRadius:'var(--radius-sm)'}}>{form.project} 행사 일정이 아직 설정되지 않았습니다.</div>
            : <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
                {dates.map(d => (
                  <button key={d} onClick={()=>toggleDate(d)}
                    className={form.preferredDates.includes(d) ? 'btn btn-primary' : 'btn btn-ghost'}
                    style={{padding:'8px 14px', fontSize:12}}>
                    <Calendar size={11}/>{d}
                  </button>
                ))}
              </div>}
        </div>
      </div>

      <div style={{display:'flex', justifyContent:'flex-end', gap:8, marginTop:24}}>
        <button className="btn btn-ghost" onClick={onClose}>취소</button>
        <button className="btn btn-primary" onClick={submit}><Save size={14}/>바이어 등록</button>
      </div>
    </Modal>
  );
}
