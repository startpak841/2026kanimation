# K-Animation Global Showcase · Buyer Matching Platform

MICE/애니메이션 산업 바이어 매칭 플랫폼의 웹사이트 버전입니다.
MIFA · MIPCOM · CANADA 행사 통합 운영 · 바이어 DB · 참가사 포털 · 비즈니스 미팅 스케줄링 · RSVP 자동 수집 지원.

---

## 빠른 시작

### 사전 요구사항
- **Node.js 18+** (권장 20 LTS) — [nodejs.org](https://nodejs.org)

### 로컬 개발 서버 실행
```bash
# 1) 의존성 설치 (최초 1회)
npm install

# 2) 개발 서버 시작 (http://localhost:5173 자동 오픈)
npm run dev

# 3) 프로덕션 빌드 (dist/ 폴더 생성)
npm run build

# 4) 빌드 결과 로컬 프리뷰
npm run preview
```

---

## 배포 방법 (무료 호스팅)

### 옵션 A · Vercel (권장)
1. GitHub 계정에 신규 repository 생성 (예: `kags-platform`)
2. 이 폴더를 그 repository로 push
   ```bash
   git init
   git add .
   git commit -m "init: KAGS platform v1"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/kags-platform.git
   git push -u origin main
   ```
3. [vercel.com](https://vercel.com) 로그인 → **New Project** → GitHub repo 선택 → **Deploy**
4. 자동 배포 완료 후 `https://kags-platform.vercel.app` 같은 URL 발급
5. **Settings → Domains** 에서 커스텀 도메인 연결 가능 (예: `kags-platform.co.kr`)

### 옵션 B · Netlify
1. [netlify.com](https://netlify.com) 로그인 → **Add new site → Import existing project**
2. GitHub 연결 → repo 선택
3. Build command: `npm run build` / Publish directory: `dist` 자동 감지
4. **Deploy site** 클릭

### 옵션 C · Cloudflare Pages
1. [pages.cloudflare.com](https://pages.cloudflare.com) → **Create a project** → Connect to GitHub
2. Build command: `npm run build` / Build output: `dist`
3. Deploy

세 옵션 모두 **무료 · 자동 HTTPS · 커스텀 도메인 연결 가능**. Vercel이 가장 한국에서 빠르고 설정이 간단합니다.

---

## 기본 계정 (데모용)

### 관리자
- ID: `admin` / PW: `stella0608`

### 참가사 (MIFA)
| ID | PW | 회사명 |
|---|---|---|
| climax | 4728 | 클라이맥스 스튜디오 |
| pixtrend | 3165 | 픽스트랜드 |
| devsisters | 8492 | 데브시스터즈 |
| shelter | 5037 | 스튜디오쉘터 |
| animal | 9184 | 스튜디오애니멀 |

> 모든 계정은 `src/BuyerMatchingPlatform.jsx`의 `DEFAULT_EXHIBITORS` 상수에서 수정 가능합니다.

---

## 데이터 저장 방식

- 현재 버전은 **브라우저의 localStorage**에 모든 데이터를 저장합니다.
- 즉, **데이터는 각 사용자의 브라우저에만 저장**되며 서버로 전송되지 않습니다.
- 브라우저를 변경하거나 시크릿 모드를 사용하면 데이터가 공유되지 않습니다.
- 여러 운영자가 동시에 편집하거나, 참가사별 로그인을 제대로 분리하려면 **Supabase 연동 버전(Step 2)**으로 업그레이드가 필요합니다.

### 용량 제한
- 브라우저별로 약 5~10MB 할당 (Chrome 기준 총 5MB, 도메인별)
- 이미지 대량 업로드 시 경고 후 저장 실패할 수 있음 → 이미지는 5MB 이하 권장
- 백업: 바이어 DB는 엑셀로 다운로드 가능 (관리자 탭 내 "엑셀 다운로드" 버튼)

---

## 구조 개요

```
kags-platform/
├── index.html                      # 엔트리 HTML + 폰트 로드
├── package.json                    # 의존성 정의
├── vite.config.js                  # Vite 설정
├── public/                         # 정적 파일
└── src/
    ├── main.jsx                    # React 부트스트랩
    ├── storage.js                  # localStorage 어댑터 (window.storage 폴리필)
    └── BuyerMatchingPlatform.jsx   # 메인 애플리케이션 (단일 파일 구조)
```

### 기술 스택
- **React 18** + **Vite 5** (빌드)
- **Tailwind CSS** 사용 안 함 — 모든 스타일은 인라인 + <style> 태그
- **lucide-react** 아이콘
- **xlsx** (SheetJS) — 엑셀 업로드/다운로드
- **Pretendard + Noto Sans KR + Geist Mono** 웹폰트

---

## 향후 계획 (Step 2 · Supabase 연동)

현재 버전은 정적 사이트로 즉시 배포 가능한 대신 단일 기기·단일 브라우저 한계가 있습니다.
아래 기능이 필요해지면 Supabase 연동 업그레이드를 고려해주세요:

- [ ] 여러 운영진 동시 편집 (실시간 동기화)
- [ ] 참가사별 보안 로그인 (비밀번호 해싱 · 세션)
- [ ] 이미지 25MB+ 업로드 (S3 호환 스토리지)
- [ ] 구글폼 응답 서버 측 자동 수집 (cron)
- [ ] 이메일 발송 (SendGrid/Resend 연동)
- [ ] 감사 로그 · 권한 체계

Supabase 연동은 코드 구조상 `storage.js`를 Supabase 클라이언트로 교체하는 방식으로 진행 가능합니다 (나머지 컴포넌트 코드 변경 거의 없음).

---

## 라이선스
© 2026 K-Animation Global Showcase Operations. All rights reserved.
