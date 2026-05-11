# AI Usage Dashboard

ChatGPT/OpenAI, Gemini, Cursor, Claude, Figma 사용량을 한 화면에서 확인하는 Next.js 대시보드입니다.

<!-- screenshot -->

## 실행

```bash
corepack pnpm install
cp .env.example .env.local
corepack pnpm dev
```

현재 개발 서버는 사용 가능한 포트로 자동 실행됩니다. 예: `http://localhost:3001`

## 환경 변수

- OpenAI: `OPENAI_ADMIN_KEY`
  - 조직 Usage/Costs API 접근 권한이 있는 Admin key가 필요합니다.
- Gemini: `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_PROJECT_ID`
  - Google Cloud Monitoring API와 서비스 계정이 필요합니다.
  - `GEMINI_API_KEY`만 있으면 사용량 조회는 `NO_USAGE_API`로 표시됩니다.
- Cursor: `CURSOR_SESSION_TOKEN` 또는 `CURSOR_SESSION_TOKENS`
  - `cursor.com/settings` 로그인 후 브라우저 쿠키의 `WorkosCursorSessionToken` 값을 사용합니다.
  - 여러 계정은 쉼표로 구분합니다.
- Claude: `ANTHROPIC_ADMIN_KEY`
  - Anthropic 조직 계정의 Usage & Cost Admin API 키가 필요합니다.
- Figma: `FIGMA_ACCESS_TOKEN`, `FIGMA_TEAM_ID`, 선택 `FIGMA_OAUTH_TOKEN`
  - Activity Logs는 Enterprise 조직 admin OAuth token과 `org:activity_log_read` scope가 필요합니다.
  - 없으면 팀 프로젝트/파일 수 기반 대체 지표를 표시합니다.

## 에러 코드

| 코드 | 의미 | 조치 |
| --- | --- | --- |
| `NOT_CONFIGURED` | 필요한 환경 변수가 없음 | `.env.local` 설정 |
| `INVALID_KEY` | 키 또는 권한 오류 | 키/권한/조직 admin 여부 확인 |
| `SESSION_EXPIRED` | Cursor 세션 만료 | `WorkosCursorSessionToken` 재발급 |
| `SCHEMA_CHANGED` | 비공식 API 응답 구조 변경 | 서버 로그 확인 후 zod 스키마 갱신 |
| `RATE_LIMIT` | provider rate limit | 잠시 후 재시도 |
| `NO_USAGE_API` | 해당 키/계정으로 usage API 불가 | Cloud/Admin API 설정 |
| `PLAN_REQUIRED` | 요금제 필요 | Enterprise/Admin 플랜 확인 |
| `UNKNOWN` | 기타 오류 | 서버 로그 확인 |

## 검증

```bash
corepack pnpm exec tsc --noEmit
corepack pnpm lint
corepack pnpm build
```
