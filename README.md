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
  - Vertex 없이 앞으로의 사용량을 추적하려면 `GEMINI_API_KEY` 또는 `GEMINI_API_KEYS`를 넣고 `POST /api/proxy/gemini`를 통해 Gemini를 호출합니다.
  - `GEMINI_API_KEYS` 형식: `projectA:AIza...,projectB:AIza...`
  - proxy를 거치지 않은 과거/외부 호출은 추적할 수 없습니다.
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

## Gemini Proxy

Vertex AI를 쓰지 않는 Gemini API key 방식은 전체 사용량 조회 API가 없습니다. 대신 앞으로의 호출을 이 앱의 proxy로 통과시키면 응답의 `usageMetadata`를 `data/gemini-usage.jsonl`에 저장하고 대시보드에서 집계합니다.

```bash
curl -X POST http://localhost:3001/api/proxy/gemini \
  -H "Content-Type: application/json" \
  -d '{
    "project": "projectA",
    "model": "gemini-2.0-flash",
    "contents": [
      { "parts": [{ "text": "안녕하세요" }] }
    ]
  }'
```

## 검증

```bash
corepack pnpm exec tsc --noEmit
corepack pnpm lint
corepack pnpm build
```

## Cursor 토큰 및 쿠키 만료 시 갱신 방법

Cursor 세션 토큰(`WorkosCursorSessionToken`)은 발급 후 **보통 60일(약 2개월)** 동안 유효합니다. 만약 만료되거나 서버 측에서 세션을 갱신하여 대시보드에 에러(`SESSION_EXPIRED`)가 표시된다면 다음 방법으로 갱신하세요.

1. 브라우저에서 [cursor.com/dashboard](https://www.cursor.com/dashboard) 페이지에 접속하여 로그인합니다.
2. 개발자 도구(`F12` 또는 `Cmd+Option+I`)를 열고 **Network(네트워크)** 탭으로 이동합니다.
3. 페이지를 **새로고침(`F5`)** 합니다.
4. 네트워크 목록에서 `get-user-analytics` 또는 `get-monthly-invoice`와 같은 항목을 클릭합니다.
5. 우측 패널의 **Headers(헤더)** 탭에서 스크롤을 내려 **Request Headers(요청 헤더)** 섹션을 찾습니다.
6. **`Cookie:`** 항목의 값을 모두 복사합니다.
7. 프로젝트의 `.env.local` 파일에 다음과 같이 붙여넣고 개발 서버를 재시작합니다.

```env
CURSOR_COOKIE_STRINGS="복사한_전체_쿠키_값"
```
