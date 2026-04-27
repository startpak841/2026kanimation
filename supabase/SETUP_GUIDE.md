# Supabase 연동 가이드

이 문서는 KAGS Buyer Matching Platform을 **실 운영 가능한 상태**로 만들기 위한
Supabase 백엔드 설정 절차입니다.

**예상 소요 시간: 30분 ~ 1시간**

---

## STEP 1 · Supabase 계정 생성 (3분)

1. https://supabase.com 접속
2. 우상단 **Start your project** 클릭
3. **Continue with GitHub** (가장 편함) 또는 이메일로 가입
4. 가입 완료

---

## STEP 2 · 프로젝트 생성 (5분)

1. Supabase 대시보드 → **New project** 클릭
2. 입력 사항:
   - **Name**: `kags-platform` (원하는 이름)
   - **Database Password**: **강력한 비밀번호 생성 후 안전한 곳에 저장** ⚠️ 분실 시 복구 불가
     - 예시: `Kags2026!SecurePw#$`
     - 이 비밀번호는 다시 안 보여주니 반드시 기록
   - **Region**: **Northeast Asia (Seoul)** 선택 (한국에서 가장 빠름)
   - **Pricing Plan**: 초기는 **Free** 로 시작 (나중에 Pro로 업그레이드 가능)
3. **Create new project** 클릭
4. 프로젝트 준비 대기 (2~3분)

---

## STEP 3 · 테이블 스키마 생성 (5분)

1. 좌측 메뉴 → **SQL Editor** → **New query** 클릭
2. 이 프로젝트 폴더의 **`supabase/schema.sql`** 파일 전체 내용 복사
3. SQL Editor에 **붙여넣기**
4. 우하단 **Run** 클릭 (또는 Ctrl+Enter)
5. 초록 알림 `Success. No rows returned` 확인
6. 좌측 메뉴 → **Table Editor** 에서 테이블 7개 생성 확인:
   - ✅ `participants` (참가사 6개 시드 데이터 포함)
   - ✅ `ips`
   - ✅ `ip_images`
   - ✅ `buyers`
   - ✅ `meetings`
   - ✅ `rsvp_sheet_sync`
   - ✅ `invitation_log`

---

## STEP 4 · 이미지 Storage 버킷 생성 (3분)

1. 좌측 메뉴 → **Storage** → **New bucket**
2. 입력:
   - **Name**: `images` (정확히 이 이름 — 코드가 참조함)
   - **Public bucket**: ✅ 체크 (이미지 URL을 공개 접근 가능하게)
   - **File size limit**: `25 MB` (로고 · IP 이미지 용량 상한)
   - **Allowed MIME types**: 비워두기 (모든 이미지 타입 허용)
3. **Save** 클릭
4. 생성된 `images` 버킷 클릭 → **Policies** 탭에서
5. **New Policy** → **For full customization** 또는 기본 템플릿:
   - `SELECT` (읽기): 누구나 허용
   - `INSERT`, `UPDATE`, `DELETE`: 누구나 허용 (초기 단계)
   - 또는 **"Allow access to all users"** 템플릿 적용
6. 완료

> ⚠️ **프로덕션 시 주의**: 초기 Public 설정은 데모용입니다. 실제 사용자 인증이 붙으면 Storage 정책도 "본인 파일만 업로드/수정 가능"으로 세밀화해야 합니다.

---

## STEP 5 · 환경변수 (API Key) 확보 (2분)

1. 좌측 메뉴 → **Project Settings** (톱니바퀴 아이콘) → **API**
2. 다음 두 값을 복사:

### **Project URL**
```
https://xxxxxxxxxx.supabase.co
```

### **anon public key** (길이 200자 정도)
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

⚠️ **service_role key는 절대 공유/배포하면 안 됩니다.** Frontend에서는 오직 anon key만 사용.

---

## STEP 6 · 로컬 개발 환경변수 설정 (2분)

프로젝트 폴더에서 **`.env.local`** 파일을 새로 만들고 다음 내용 저장:

```
VITE_SUPABASE_URL=https://xxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

⚠️ `.env.local` 파일은 **절대 GitHub에 올리면 안 됩니다**. `.gitignore`에 이미 포함되어 있으므로 `git push` 시 자동 제외됩니다.

### 로컬에서 테스트
```bash
npm run dev
```
브라우저 콘솔에 Supabase 경고가 없으면 성공.

---

## STEP 7 · Vercel 환경변수 등록 (3분)

이미 Vercel에 배포되어 있다는 전제:

1. Vercel 대시보드 → `kags-platform` 프로젝트 → **Settings**
2. 좌측 **Environment Variables** 클릭
3. 추가:

| NAME | VALUE | Environment |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://xxxxxxxxxx.supabase.co` | Production, Preview, Development |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGc...` (anon key 전체) | Production, Preview, Development |

4. **Save** 클릭
5. **Deployments** 탭 → 최신 배포 → `...` → **Redeploy** (환경변수 반영 위해)
6. 1~2분 후 재배포 완료

---

## STEP 8 · 데이터 마이그레이션 (선택)

기존 localStorage에 쌓인 데이터를 Supabase로 옮기려면:

1. 배포된 사이트 접속
2. 콘솔 열기 (F12 → Console 탭)
3. 마이그레이션 스크립트 실행 (다음 세션에서 제공 예정)

또는 엑셀 업로드로 바이어 DB 다시 밀어넣기 → 가장 간단.

---

## 운영 중 모니터링

- **Table Editor**: 실시간으로 데이터 확인
- **Database → Logs**: 에러 추적
- **Reports**: API 호출 수 · 데이터 증가 추이

---

## 비용 관리

### Free 티어 (한도)
- DB 크기: 500MB
- Storage: 1GB
- API 요청: 월 5만 건
- 동시 접속: 200명

### 초과 시 (Pro $25/월)
- DB 8GB
- Storage 100GB
- 무제한 API 요청
- 일일 백업

**참가사 6사 + 바이어 500건 + 이미지 100MB 수준이면 Free로 충분. 그 이상으로 성장하면 Pro 전환**

---

## 문제 해결

### "Row Level Security 에러"
- 초기 스키마는 누구나 접근 허용이지만, 뭔가 꼬이면 SQL Editor에서:
```sql
ALTER TABLE buyers DISABLE ROW LEVEL SECURITY;
ALTER TABLE participants DISABLE ROW LEVEL SECURITY;
-- 필요한 테이블들...
```
임시로 전체 RLS 비활성화.

### "CORS 오류"
- Supabase 프로젝트 → Settings → API → CORS 설정에서 Vercel 도메인 추가

### 환경변수가 안 읽히는 경우
- `.env.local` 파일명 정확한지 확인 (맨 앞 점 `.`)
- `VITE_` 접두어 누락 없는지 확인 (Vite는 이 접두어만 노출)
- 개발 서버 재시작 (`Ctrl+C` → `npm run dev`)

---

## 다음 단계

이 STEP 1~7까지 완료하시면 **인프라 준비 완료**입니다.

다음 세션에서 제가 진행할 작업:
- [x] BuyerMatchingPlatform.jsx를 Supabase와 연동하도록 리팩토링
- [x] 로그인 로직 Supabase 쿼리로 교체
- [x] 저장 로직 각 API 호출로 교체
- [x] 이미지 업로드 Supabase Storage로 교체
- [x] 실시간 구독 Realtime으로 교체
- [x] 테스트 및 배포

완료 후에는 **여러 기기에서 참가사들이 각자 로그인 → 실시간 동기화되는 진짜 플랫폼**이 됩니다.
