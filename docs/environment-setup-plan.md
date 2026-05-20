# 환경 설정 계획

현재 환경 상태 진단 및 설정 항목 정리.

---

## 현재 상태 진단

| 항목 | 상태 | 비고 |
|------|------|------|
| Git 사용자 설정 | **완료** | dongho1 / dongho108@naver.com |
| Git remote | **완료** | `https://github.com/dongho108/ai-exam-grader.git` |
| Git credential helper | **완료** | `manager` (Windows Credential Manager) |
| GitHub CLI (gh) | **미설치** | Secrets 관리, PR 생성에 필요 |
| Node.js | **설치됨** | v24.14.1 (이번 세션에서 설치) |
| npm dependencies | **설치됨** | node_modules 존재 |
| Supabase CLI | **미설치** | Edge Functions 배포, 로컬 개발에 필요 |
| `.env.local` | **더미값** | `placeholder.supabase.co` — 실제 값으로 교체 필요 |
| NAPS2 (로컬 개발용) | **미다운로드** | `resources/naps2/` 없음, 빌드 시 자동 다운로드 |

---

## 1단계: 로컬 개발 환경 (git push 가능하게)

### 1-1. GitHub CLI 설치

git push는 Windows Credential Manager로 가능하지만, gh CLI가 있으면 PR 생성/Secrets 관리가 편하다.

```powershell
winget install GitHub.cli
```

설치 후 인증:
```bash
gh auth login
# → GitHub.com / HTTPS / Login with a web browser 선택
```

### 1-2. `.env.local` 실제 값 설정

현재 더미값이 들어있다. Supabase 프로젝트의 실제 값으로 교체해야 한다.

```bash
# Supabase 대시보드 → Project Settings → API 에서 확인
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...실제키
```

**값 확인 방법**:
- https://supabase.com/dashboard → 해당 프로젝트 선택
- Settings → API → Project URL, Project API keys (anon public)

### 1-3. `.env.local`을 `.gitignore`에 추가 확인

```bash
grep '.env.local' .gitignore
# 이미 포함되어 있어야 함. 없으면 추가 필요.
```

---

## 2단계: Supabase 연동

### 2-1. Supabase CLI 설치

Edge Functions 배포 및 로컬 개발에 필요.

```powershell
winget install Supabase.CLI
```

또는 npm으로:
```bash
npm install -g supabase
```

### 2-2. Supabase 로그인

```bash
supabase login
# 브라우저에서 토큰 발급 → 터미널에 붙여넣기
```

### 2-3. Supabase 프로젝트 연결

```bash
supabase link --project-ref <your-project-ref>
# project-ref는 Supabase URL에서 확인: https://<project-ref>.supabase.co
```

### 2-4. Edge Functions에 GEMINI_API_KEY 설정

Supabase Edge Functions에서 Gemini API를 호출하려면:

```bash
supabase secrets set GEMINI_API_KEY=<your-gemini-api-key>
```

**Gemini API 키 발급**:
- https://aistudio.google.com/apikey 에서 발급
- 모델: `gemini-3.1-flash-lite` 사용 중

### 2-5. Edge Functions 배포 (필요 시)

```bash
supabase functions deploy extract-exam-structure
supabase functions deploy extract-answer-structure
```

---

## 3단계: GitHub Actions Secrets (CI/CD 자동 릴리스)

`main` 브랜치에 push하면 GitHub Actions가 Windows 빌드 + 릴리스를 자동 수행한다.
다음 Secrets가 GitHub 리포지토리에 설정되어 있어야 한다:

| Secret 이름 | 용도 | 설정 방법 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 빌드 시 Supabase URL 주입 | `.env.local`의 값과 동일 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 빌드 시 Supabase anon key 주입 | `.env.local`의 값과 동일 |

`GITHUB_TOKEN`은 GitHub Actions가 자동 제공하므로 별도 설정 불필요.

**설정 방법** (gh CLI 사용):
```bash
gh secret set NEXT_PUBLIC_SUPABASE_URL
gh secret set NEXT_PUBLIC_SUPABASE_ANON_KEY
```

또는 웹에서:
- GitHub → 리포지토리 → Settings → Secrets and variables → Actions → New repository secret

---

## 전체 환경변수 요약

### 로컬 개발 (`.env.local`)

| 변수 | 필수 | 설명 |
|------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | 필수 | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 필수 | Supabase 공개 anon 키 |

### Supabase Edge Functions (Secrets)

| 변수 | 필수 | 설명 |
|------|------|------|
| `GEMINI_API_KEY` | 필수 | Google Gemini API 키 (시험 구조 추출용) |

### GitHub Actions (Repository Secrets)

| 변수 | 필수 | 설명 |
|------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | 필수 | 빌드 시 주입 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 필수 | 빌드 시 주입 |

### 선택적 (현재 미사용)

| 변수 | 설명 |
|------|------|
| `GITHUB_TOKEN` | NAPS2 다운로드 rate limit 회피 (로컬 빌드 시) |
| `OPENAI_API_KEY` | Supabase Studio AI 기능 (개발 편의) |

---

## 실행 순서 체크리스트

- [ ] Supabase 대시보드에서 URL + anon key 확인
- [ ] `.env.local`에 실제 값 입력
- [ ] `gh` CLI 설치 및 로그인
- [ ] GitHub Secrets 2개 설정
- [ ] Supabase CLI 설치 및 로그인
- [ ] `supabase link` 실행
- [ ] `GEMINI_API_KEY` Supabase Secret 설정
- [ ] `git push origin main` 테스트
