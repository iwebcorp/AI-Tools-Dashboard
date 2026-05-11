# INSTRUCTIONS.md — AI Token Usage Dashboard

## 프로젝트 개요

ChatGPT(OpenAI), Gemini(Google), Cursor, Claude(Anthropic), Figma 다섯 서비스의  
**토큰 총량 및 사용량**을 한눈에 보여주는 웹 대시보드.

Next.js App Router 단일 프로젝트로 프론트엔드와 백엔드(API Route Handlers)를 모두 처리한다.  
외부 API 호출은 전부 서버 사이드 Route Handler에서만 수행한다 (API 키 노출 방지).

---

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| 프레임워크 | Next.js 14+ (App Router) |
| 언어 | TypeScript (strict mode) |
| 스타일링 | Tailwind CSS |
| 차트 | Recharts |
| 데이터 검증 | zod |
| 패키지 매니저 | pnpm |
| 런타임 | Node.js 20+ |

---

## 디렉토리 구조

```
ai-usage-dashboard/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   └── api/
│       ├── usage/
│       │   ├── openai/route.ts       # OpenAI 사용량
│       │   ├── gemini/route.ts       # Gemini 사용량
│       │   ├── cursor/route.ts       # Cursor 사용량
│       │   ├── claude/route.ts       # Claude 사용량
│       │   ├── figma/route.ts        # Figma 사용량
│       │   └── all/route.ts          # 전체 병렬 조회
│       └── refresh/route.ts
├── components/
│   ├── Dashboard.tsx
│   ├── ServiceCard.tsx
│   ├── TokenGauge.tsx
│   ├── ModelBreakdown.tsx
│   ├── CostChart.tsx
│   └── DailyChart.tsx
├── hooks/
│   └── useUsageData.ts
├── lib/
│   ├── services/
│   │   ├── openaiService.ts
│   │   ├── geminiService.ts
│   │   ├── cursorService.ts
│   │   ├── claudeService.ts
│   │   └── figmaService.ts
│   ├── cache.ts
│   ├── pricing.ts
│   └── types.ts
├── .env.local                        # 실제 키 (gitignore 대상)
├── .env.example
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── INSTRUCTIONS.md
└── AGENTS.md
```

---

## 환경 변수 (`.env.example`)

```env
# OpenAI
# Usage/Costs API는 일반 프로젝트 키가 아니라 Admin 권한 키가 필요
OPENAI_ADMIN_KEY=sk-admin-...

# Google Gemini
GOOGLE_APPLICATION_CREDENTIALS=./credentials/google-sa.json
GOOGLE_PROJECT_ID=your-gcp-project-id
# 또는 AI Studio 키만 있는 경우
GEMINI_API_KEY=AIza...

# Cursor (WorkOS 세션 토큰)
# 단일 계정: CURSOR_SESSION_TOKEN
# 다중 계정: CURSOR_SESSION_TOKENS에 쉼표로 구분
# 취득: cursor.com/settings 로그인 → F12 → Application → Cookies
#       → WorkosCursorSessionToken 값 전체 복사 (user_XXXXX::eyJ... 형식)
CURSOR_SESSION_TOKEN=user_XXXXX::eyJ...
CURSOR_SESSION_TOKENS=user_XXXXX::eyJ...,user_YYYYY::eyJ...

# Claude (Anthropic Console)
# Usage & Cost Admin API는 조직 계정 Admin API 키 필요 (개인 계정 불가)
ANTHROPIC_ADMIN_KEY=sk-ant-admin-...

# Figma
# 취득: figma.com → 프로필 → Settings → Personal access tokens
FIGMA_ACCESS_TOKEN=figd_...
# Activity Logs API는 Enterprise 조직 admin OAuth token + org:activity_log_read scope 필요
FIGMA_OAUTH_TOKEN=...
# Figma API 사용량은 팀 단위 조회 (팀 ID 필요)
# 취득: figma.com/files → 팀 URL에서 확인 (figma.com/files/team/{TEAM_ID}/...)
FIGMA_TEAM_ID=123456789
```

> `.env.local`은 절대 Git에 커밋하지 않는다. `.gitignore`에 반드시 포함.

---

## 각 서비스 연동 방식

### 1. ChatGPT (OpenAI)

- **Route**: `GET /api/usage/openai`
- **외부 엔드포인트**:
  ```
  GET https://api.openai.com/v1/organization/usage/completions
  GET https://api.openai.com/v1/organization/costs
  ```
- **인증**: `Authorization: Bearer ${process.env.OPENAI_ADMIN_KEY}`
- **주요 쿼리**:
  - `start_time`, `end_time` — Unix seconds
  - `bucket_width=1d`
  - `group_by[]=model`
  - `limit=31`
  - `page` — pagination cursor
- **수집 데이터**:
  - `input_tokens` — 입력 토큰
  - `output_tokens` — 출력 토큰
  - `num_model_requests` — 요청 수
  - `model` — 모델명
- **처리**: 이번 달 시작/종료 시간으로 일별 bucket 조회 후 집계
- **비용 계산**: Costs API 값을 우선 사용하고, 실패 시 `lib/pricing.ts` 단가 테이블로 추정

### 2. Gemini (Google)

- **Route**: `GET /api/usage/gemini`
- **방법 A** (권장): `@google-cloud/monitoring` 패키지
  - 메트릭: `aiplatform.googleapis.com/publisher/online_serving/token_count`
- **방법 B** (AI Studio 키만): `connected: false`, `error: 'NO_USAGE_API'` 반환

### 3. Cursor

- **Route**: `GET /api/usage/cursor`
- **중요**: 공식 공개 Usage API가 아니라 Cursor 내부/비공식 API 기반이다. 응답 스키마 변경 가능성을 전제로 방어적으로 구현한다.
- **범위 제외**: VS Code/Cursor 확장 프로그램, 상태 표시줄, Secret Storage 구현은 만들지 않는다. 기존 확장들이 사용하는 토큰/usage API 접근 방식만 참고한다.
- **인증**: WorkOS SSO 세션 토큰 (`CURSOR_SESSION_TOKEN` 또는 `CURSOR_SESSION_TOKENS`)
- **토큰 입력 우선순위**:
  1. `CURSOR_SESSION_TOKENS`가 있으면 쉼표로 분리해 다중 계정 조회
  2. `CURSOR_SESSION_TOKEN`이 있으면 단일 계정 조회
  3. 로컬 실행 환경이면 Cursor 앱의 로컬 SQLite DB에서 `WorkosCursorSessionToken` 자동 감지 시도
  4. 모두 실패하면 `connected: false`, `error: 'NOT_CONFIGURED'`
- **로컬 SQLite 자동 감지**:
  - 선택 기능이며 서버 배포 환경에서는 사용할 수 없다.
  - 실패하면 조용히 포기하고 수동 토큰 설정 안내를 표시한다.
  - 구현 시 가능하면 순수 JS SQLite 리더를 사용한다.
- **외부 호출**:
  ```typescript
  fetch('https://www.cursor.com/api/usage', {
    headers: {
      Cookie: `WorkosCursorSessionToken=${sessionToken}`,
      'User-Agent': 'Mozilla/5.0',
    },
    cache: 'no-store',
  })
  ```
- **청구 유형 감지**: 가능하면 `/api/auth/stripe` 계열 내부 API도 조회해 free/pro/business/team 또는 usage-based 여부를 감지한다. 실패해도 usage 조회는 계속 진행한다.
- **예상 응답** (비공식):
  ```json
  {
    "tokenUsage": {
      "todayTotalCents": 42,
      "totalCents": 891,
      "inputTokens": 12000,
      "outputTokens": 3400,
      "totalTokens": 15400
    },
    "usageBasedPricing": {
      "currentUsage": {
        "gpt-4.1": {
          "numRequests": 312,
          "inputTokens": 12000,
          "outputTokens": 3400,
          "totalTokens": 15400,
          "totalCents": 891
        }
      }
    },
    "recentRequests": [
      {
        "timestamp": "2026-05-11T10:00:00Z",
        "model": "gpt-4.1",
        "inputTokens": 1000,
        "outputTokens": 250,
        "totalTokens": 1250,
        "costCents": 12
      }
    ]
  }
  ```
- **정규화**:
  - `cost.today` = `todayTotalCents / 100`
  - `cost.thisMonth` = `totalCents / 100`
  - `tokens` = 응답에 token 필드가 있으면 합산, 없으면 0
  - `requests` = usageBasedPricing 또는 recentRequests 기준 합산
  - `models` = 모델별 토큰·비용·요청 집계
  - `dailyHistory` = recentRequests timestamp가 있으면 일별 집계, 없으면 빈 배열
  - 다중 계정이면 계정별 조회 결과를 합산한다.
- **에러 처리**:
  - 401/403 → `error: 'SESSION_EXPIRED'`
  - zod 파싱 실패 → `error: 'SCHEMA_CHANGED'` + raw JSON 서버 로그

### 4. Claude (Anthropic)

- **Route**: `GET /api/usage/claude`
- **공식 API**: Anthropic Usage & Cost Admin API 사용
- **제약**: 개인 계정에서는 Admin API 사용 불가. 조직 계정과 Admin API 키 필요.
- **외부 엔드포인트**:
  ```
  GET https://api.anthropic.com/v1/organizations/usage_report/messages
  GET https://api.anthropic.com/v1/organizations/cost_report
  ```
- **인증**:
  ```typescript
  headers: {
    'x-api-key': process.env.ANTHROPIC_ADMIN_KEY,
    'anthropic-version': '2023-06-01',
  }
  ```
- **주요 쿼리**:
  - `starting_at`, `ending_at` — ISO 8601
  - `bucket_width=1d`
  - `group_by[]=model`
  - `page` — pagination cursor
- **수집 데이터**:
  - `input_tokens` — 입력 토큰
  - `output_tokens` — 출력 토큰
  - `model` — 모델명 (모델별 집계)
  - 요청 수
- **비용 계산**: Cost API 값을 우선 사용하고, 실패 시 `lib/pricing.ts`의 `ANTHROPIC_PRICING` 테이블로 추정
- **에러 처리**: 401/403 → `error: 'INVALID_KEY'`, 개인 계정/권한 없음 → `error: 'NO_USAGE_API'`

> 📌 Anthropic Console API 스펙은 출시 시점에 따라 엔드포인트가 다를 수 있다.  
> 구현 시 https://docs.anthropic.com/en/api 를 반드시 확인하고 최신 스펙을 따른다.

### 5. Figma

- **Route**: `GET /api/usage/figma`
- **추적 대상**: API 호출 수 + 코드 생성(Dev Mode) 관련 활동 지표
- **공식 API**:
  ```
  # 팀 내 파일 목록 (활동 지표)
  GET https://api.figma.com/v1/teams/{FIGMA_TEAM_ID}/projects
  
  # 조직 활동 로그 (Enterprise 조직 admin 전용)
  GET https://api.figma.com/v1/activity_logs
  ```
- **인증**:
  ```typescript
  // 일반 Figma REST API
  headers: {
    'X-Figma-Token': process.env.FIGMA_ACCESS_TOKEN,
  }

  // Activity Logs API
  headers: {
    Authorization: `Bearer ${process.env.FIGMA_OAUTH_TOKEN}`,
  }
  ```
- **수집 데이터**:
  - `activity_logs` — API 호출 이벤트 로그
  - 이벤트 타입별 분류: `get_file`, `get_image`, `code_generation`, `post_comment` 등
  - 일별 API 호출 수 집계
- **토큰 개념 정리**:
  - Figma 자체는 LLM 토큰 개념이 없음
  - "토큰 사용량" = **API 호출 횟수** + **Dev Mode 코드 생성 요청 수**로 정의
  - `tokens.total` 필드에 API 호출 수를 매핑
  - `cost.thisMonth` = 현재 플랜 기준 초과 호출 비용 (무료 플랜이면 0)
- **주의사항**:
  - `activity_logs` API는 **Enterprise 플랜**에서만 사용 가능
  - Activity Logs API는 Personal Access Token이 아니라 OAuth 2 token 필요
  - OAuth scope는 `org:activity_log_read`
  - Enterprise 조직 admin만 OAuth 인증 가능
  - 그 외 플랜은 `GET /v1/teams/{id}/projects` + 파일 수로 대체 지표 사용
  - 플랜 확인 후 가능한 API 선택, 불가 시 `error: 'PLAN_REQUIRED'` 반환
- **에러 처리**:
  - 401/403 → `error: 'INVALID_KEY'`
  - 403 + 플랜 관련 메시지 → `error: 'PLAN_REQUIRED'`, `errorMessage: 'activity_logs API는 Enterprise 플랜이 필요합니다'`

---

## 공통 타입 (`lib/types.ts`)

```typescript
export type ServiceId = 'openai' | 'gemini' | 'cursor' | 'claude' | 'figma';

export type ErrorCode =
  | 'NOT_CONFIGURED'
  | 'INVALID_KEY'
  | 'SESSION_EXPIRED'
  | 'SCHEMA_CHANGED'
  | 'RATE_LIMIT'
  | 'NO_USAGE_API'
  | 'PLAN_REQUIRED'
  | 'UNKNOWN';

export interface ServiceUsage {
  service: ServiceId;
  connected: boolean;
  error?: ErrorCode;
  errorMessage?: string;
  cost: {
    today: number;       // USD
    thisMonth: number;   // USD
  };
  tokens: {
    input: number;
    output: number;
    total: number;
    limit?: number;
  };
  requests: number;
  models: ModelUsage[];
  dailyHistory: DailyUsage[];
}

export interface ModelUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  requests: number;
}

export interface DailyUsage {
  date: string;          // YYYY-MM-DD
  inputTokens: number;
  outputTokens: number;
  requests: number;
  cost: number;
}

export interface AllUsageResponse {
  openai: ServiceUsage;
  gemini: ServiceUsage;
  cursor: ServiceUsage;
  claude: ServiceUsage;
  figma: ServiceUsage;
  fetchedAt: string;     // ISO 8601
}
```

---

## 모델별 토큰 단가 (`lib/pricing.ts`)

단가 테이블은 이 파일에만 존재한다. 서비스 파일에 하드코딩 금지. 단, 이 값은 추정용 fallback이며 실제 청구 비용은 가능한 경우 provider의 Costs API 응답을 우선 사용한다.

```typescript
export interface ModelPrice {
  input: number;   // USD per 1K tokens
  output: number;
}

export const OPENAI_PRICING: Record<string, ModelPrice> = {
  'gpt-4o':        { input: 0.0025,   output: 0.010  },
  'gpt-4o-mini':   { input: 0.00015,  output: 0.0006 },
  'gpt-4-turbo':   { input: 0.010,    output: 0.030  },
  'gpt-3.5-turbo': { input: 0.0005,   output: 0.0015 },
  'default':       { input: 0.002,    output: 0.002  },
};

export const GEMINI_PRICING: Record<string, ModelPrice> = {
  'gemini-1.5-pro':   { input: 0.00125,  output: 0.005  },
  'gemini-1.5-flash': { input: 0.000075, output: 0.0003 },
  'default':          { input: 0.001,    output: 0.002  },
};

export const ANTHROPIC_PRICING: Record<string, ModelPrice> = {
  'claude-opus-4':    { input: 0.015,   output: 0.075  },
  'claude-sonnet-4':  { input: 0.003,   output: 0.015  },
  'claude-haiku-4':   { input: 0.00025, output: 0.00125 },
  'default':          { input: 0.003,   output: 0.015  },
};

// Figma는 LLM 토큰 단가 없음 — API 호출 수 기반
// Enterprise 플랜 초과 호출 비용이 있을 경우 여기에 추가

export function getPrice(
  table: Record<string, ModelPrice>,
  model: string
): ModelPrice {
  const key = Object.keys(table).find(k => k !== 'default' && model.startsWith(k));
  return key ? table[key] : table['default'];
}
```

---

## 캐싱 전략 (`lib/cache.ts`)

```typescript
const store = new Map<string, { data: unknown; expiresAt: number }>();

export function getCache<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.data as T;
}

export function setCache(key: string, data: unknown, ttlSeconds = 300): void {
  store.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 });
}

export function clearCache(key?: string): void {
  key ? store.delete(key) : store.clear();
}
```

---

## UI 요구사항

### 전체 요약 탭
1. 상단 메트릭 카드 3개: 이번 달 총 비용 / 총 토큰(API 호출 포함) / 활성 서비스 수
2. 서비스별 토큰 게이지 (한도 있으면 프로그레스 바, 없으면 누적)
3. 서비스별 비용 바 차트 (5개 서비스)
4. 최근 30일 일별 추이 라인 차트 (서비스 토글)

### 서비스 상세 탭 (5개 서비스 각각)
- 메트릭 카드: 입력 토큰 / 출력 토큰 / 이번 달 비용 / 요청 수
- 모델별 사용량 테이블 (OpenAI, Gemini, Claude)
- Figma 탭: API 호출 유형별 분류 테이블 (이벤트 타입 기준)
- 일별 차트

### 공통 UI
- 자동 새로고침: 5분
- 수동 새로고침 버튼 + 마지막 업데이트 시각
- 연결 상태 dot (초록/회색/빨강)
- 에러 메시지 + 해결 방법 인라인 표시
- 로딩 스켈레톤

---

## 실행 방법

```bash
pnpm install
cp .env.example .env.local   # 키 입력
pnpm dev                     # http://localhost:3000
pnpm build && pnpm start     # 프로덕션
```

---

## 완료 기준

- [ ] `pnpm dev` 한 번으로 실행
- [ ] 키 설정 시 5개 서비스 데이터 표시
- [ ] 서비스 하나 실패해도 나머지 정상 동작
- [ ] 토큰 게이지 + 모델별 테이블 정상 렌더링
- [ ] Figma API 호출 수 표시 (또는 플랜 미지원 안내)
- [ ] 5분 자동 갱신 동작
- [ ] `pnpm build` + `pnpm tsc --noEmit` 통과
