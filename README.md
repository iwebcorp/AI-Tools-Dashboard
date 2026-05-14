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

## 서비스별 토큰/키 연동 및 만료 시 갱신 가이드

대시보드에 연동된 각 서비스의 인증 키가 만료되었거나, 처음 설정할 때 참고할 수 있는 가이드입니다.

### 1. 🤖 Cursor (쿠키 방식)
Cursor는 공식 사용량 API가 없어 대시보드 웹의 세션 쿠키를 사용합니다.
- **유효 기간:** 발급 후 보통 **60일(약 2개월)** 유지됩니다.
- **갱신 조건:** 기한이 만료되거나, 브라우저에서 로그아웃한 경우 대시보드에 `SESSION_EXPIRED` 에러가 표시됩니다.
- **갱신 방법:**
  1. 브라우저에서 [cursor.com/dashboard](https://www.cursor.com/dashboard) 에 접속하여 로그인합니다.
  2. 개발자 도구(`F12` 또는 `Cmd+Option+I`)를 열고 **Network(네트워크)** 탭으로 이동합니다.
  3. 페이지를 새로고침(`F5`)합니다.
  4. 네트워크 목록에서 `get-user-analytics`, `get-monthly-invoice` 또는 `/api/`로 시작하는 항목을 클릭합니다.
  5. 우측 패널의 **Headers(헤더)** 탭에서 스크롤을 내려 **Request Headers(요청 헤더)** 구역을 찾습니다.
  6. **`Cookie:`** 항목 옆의 아주 긴 텍스트 값을 모두 복사합니다.
  7. 프로젝트의 `.env.local` 파일에 다음과 같이 붙여넣습니다.
     ```env
     CURSOR_COOKIE_STRINGS="여기에_복사한_전체_쿠키_값_붙여넣기"
     ```

### 2. 🎨 Figma (Personal Access Token)
Figma는 공식 개발자 API를 제공하며, 영구적인 토큰 발급이 가능합니다.
- **유효 기간:** 사용자가 직접 취소(Revoke)하지 않는 한 **영구적**으로 유지됩니다.
- **갱신 조건:** 대시보드에 `INVALID_KEY` 에러가 뜨면 토큰이 삭제되었거나 권한이 없는 것입니다.
- **갱신/발급 방법:**
  1. Figma 앱 또는 웹 우측 상단 프로필 클릭 -> **Settings(설정)** 로 이동합니다.
  2. 상단 탭에서 **Personal access tokens** 를 클릭합니다.
  3. `Generate new token`을 클릭합니다.
  4. **Scopes(권한)** 설정에서 반드시 **`files`(읽기 전용)** 와 **`projects`(읽기 전용)** 두 개를 체크합니다. (나머지는 해제)
  5. 발급된 `figd_` 로 시작하는 토큰을 복사합니다.
  6. 소속된 팀을 클릭하고, URL에 있는 긴 숫자(팀 ID)를 확인합니다.
  7. `.env.local`에 적용합니다.
     ```env
     FIGMA_ACCESS_TOKEN=figd_발급받은_토큰
     FIGMA_TEAM_ID=숫자로된_팀아이디
     ```
  > **참고:** Professional(프로페셔널) 플랜은 상세 API 호출 내역 조회가 불가하여, 대시보드에서는 팀 내 총 **'파일 개수'**를 사용량(토큰)으로 대체하여 보여줍니다.

### 3. ✨ Gemini (API Key)
Google AI Studio에서 발급받은 영구 API 키를 사용합니다.
- **유효 기간:** 삭제하지 않는 한 **영구적**입니다.
- **조회 방식의 특징:** 무료 티어용 API 키는 과거 사용량 내역을 조회하는 API를 구글이 제공하지 않습니다.
- **연동 및 추적 방법:**
  1. [aistudio.google.com](https://aistudio.google.com) 에서 API Key를 발급받습니다.
  2. `.env.local`에 등록합니다.
     ```env
     GEMINI_API_KEYS=default:AIzaSy...
     ```
  3. 다른 앱이나 코드에서 Gemini를 호출할 때, 구글 서버로 직접 보내지 않고 이 대시보드의 **Proxy 주소(`http://localhost:3001/api/proxy/gemini`)**를 거쳐서 보내도록 코드를 수정합니다.
  4. 프록시를 거쳐갈 때마다 대시보드가 사용량을 계산하여 자체적으로 누적 기록(`data/gemini-usage.jsonl`)합니다.

### 4. 💬 ChatGPT (OpenAI)
OpenAI의 조직(Organization) 및 관리자 키를 이용해 API 전체 비용을 조회합니다.
- **유효 기간:** 삭제하지 않는 한 **영구적**입니다.
- **갱신 조건:** 잔액이 부족하거나 키가 삭제되면 `INVALID_KEY` 에러가 뜹니다.
- **설정 방법:**
  1. OpenAI 플랫폼에서 조직(Organization)의 관리자(Admin) 권한으로 **Service Account** 키 또는 **Admin Key**를 발급받습니다.
  2. `.env.local`에 등록합니다.
     ```env
     OPENAI_ADMIN_KEY=sk-admin-...
     ```


### 5. 🗣️ ChatGPT Web (쿠키 & Bearer Token 방식)
ChatGPT 플러스 구독의 대화 횟수 등 웹 사용량을 추적하기 위한 비공식적인 방법입니다.
- **유효 기간:** 수일~수주 (매우 유동적이며, 수시로 만료됨)
- **갱신 조건:** `SESSION_EXPIRED` 또는 권한 에러가 발생하거나, 클라우드(Vercel 등) 배포 시 IP 변경으로 인해 즉시 차단(파기)될 수 있습니다.
- **갱신 방법:**
  1. 브라우저에서 [chatgpt.com](https://chatgpt.com)에 접속 및 로그인 후 **새로고침(`F5`)** 합니다.
  2. 개발자 도구(`F12`)의 **Network(네트워크)** 탭으로 이동합니다.
  3. 검색창(Filter)에 `models` 또는 `conversations`를 검색하고 나타난 항목을 클릭합니다.
  4. 우측 패널의 **Headers(헤더) -> Request Headers(요청 헤더)** 구역을 확인합니다.
  5. **`Authorization:`** 항목에서 `Bearer ` 뒷부분의 아주 긴 문자열(`eyJ...`로 시작)만 복사합니다.
  6. 동일한 구역의 **`Cookie:`** 항목 값 전체를 복사합니다.
  7. `.env.local`에 적용합니다.
     ```env
     CHATGPT_BEARER_TOKEN="복사한_Bearer_뒷부분_토큰"
     CHATGPT_COOKIES="복사한_전체_쿠키_값"
     ```
> ⚠️ **주의:** 이 방식은 웹 세션을 우회하는 것이므로 Vercel 등 클라우드에 배포할 경우 OpenAI의 봇 방지 시스템(Cloudflare)에 의해 즉시 차단당할 위험이 큽니다. 로컬(내 컴퓨터) 환경에서만 사용하시는 것을 권장합니다.
