# AGENTS.md — AI Token Usage Dashboard

## 에이전트 역할 및 작업 분담

에이전트는 아래 순서대로 작업한다. 이전 에이전트의 결과물이 있어야 다음 에이전트가 시작할 수 있다.  
각 에이전트는 자신의 담당 범위만 수정하고, 완료 후 해당 섹션 체크리스트를 업데이트한다.

---

## Agent 1 — Project Scaffolder

### 역할
Next.js 프로젝트 초기 뼈대 생성

### 사전 조건
없음 (첫 번째 에이전트)

### 작업 목록

- [ ] Next.js 14 프로젝트 생성
  ```bash
  pnpm create next-app@latest . \
    --typescript --tailwind --app --no-src-dir --import-alias "@/*"
  ```
- [ ] 추가 패키지 설치
  ```bash
  pnpm add recharts zod
  pnpm add @google-cloud/monitoring   # Gemini용
  pnpm add -D @types/node
  ```
- [ ] `tsconfig.json` strict 모드 확인 (`"strict": true`)
- [ ] 디렉토리 골격 생성 (빈 파일로 위치 확보)
  - `app/api/usage/openai/route.ts`
  - `app/api/usage/gemini/route.ts`
  - `app/api/usage/cursor/route.ts`
  - `app/api/usage/claude/route.ts`
  - `app/api/usage/figma/route.ts`
  - `app/api/usage/all/route.ts`
  - `app/api/refresh/route.ts`
  - `components/` (Dashboard, ServiceCard, TokenGauge, ModelBreakdown, CostChart, DailyChart)
  - `hooks/useUsageData.ts`
  - `lib/services/` (openai, gemini, cursor, claude, figma)
  - `lib/cache.ts`, `lib/pricing.ts`, `lib/types.ts`
- [ ] `.env.example` 생성 (INSTRUCTIONS.md 환경 변수 섹션 내용 그대로)
- [ ] `.gitignore`에 `.env.local`, `credentials/` 추가
- [ ] git 저장소가 아니면 `git init` 실행
- [ ] `pnpm dev` 실행 확인 (http://localhost:3000 응답)

### 완료 기준
```bash
pnpm dev   # 에러 없이 실행
```

---

## Agent 2 — Types & Shared Lib

### 역할
타입, 캐시, 단가 테이블 구현 — 이후 모든 에이전트가 공통으로 참조

### 사전 조건
Agent 1 완료

### 작업 목록

#### `lib/types.ts`
- [ ] INSTRUCTIONS.md의 타입 정의 전체 구현
  - `ServiceId` (`'openai' | 'gemini' | 'cursor' | 'claude' | 'figma'`)
  - `ErrorCode`, `ServiceUsage`, `ModelUsage`, `DailyUsage`, `AllUsageResponse`
- [ ] 모든 타입 `export`

#### `lib/pricing.ts`
- [ ] INSTRUCTIONS.md의 `OPENAI_PRICING`, `GEMINI_PRICING`, `ANTHROPIC_PRICING` 구현
- [ ] Figma 섹션 주석 포함 (API 호출 수 기반임을 명시)
- [ ] `getPrice(table, model)` 유틸 구현 (prefix 매칭)

#### `lib/cache.ts`
- [ ] INSTRUCTIONS.md의 캐시 구현 그대로
- [ ] `getCache<T>`, `setCache`, `clearCache` export

#### 빈 서비스 파일 초기화
각 서비스 파일에 타입 시그니처만 작성 (Agent 3이 채움):
```typescript
import 'server-only';
import type { ServiceUsage } from '@/lib/types';
export async function fetch[Service]Usage(): Promise<ServiceUsage> {
  throw new Error('Not implemented');
}
```
- [ ] `openaiService.ts`
- [ ] `geminiService.ts`
- [ ] `cursorService.ts`
- [ ] `claudeService.ts`
- [ ] `figmaService.ts`

### 완료 기준
```bash
pnpm tsc --noEmit   # 타입 오류 없음
```

---

## Agent 3 — Backend Services & Route Handlers

### 역할
5개 서비스의 외부 API 호출 로직 + Route Handler 구현

### 사전 조건
Agent 2 완료

### 공통 규칙
- `process.env.*` 접근은 Route Handler 또는 `lib/services/*` 서버 전용 레이어에서만 허용
- `lib/services/*` 파일에는 `import 'server-only';` 추가
- 모든 외부 응답은 zod로 검증, `any` 금지
- 에러 시 `connected: false` + `ErrorCode` 반환, 절대 throw 금지
- 각 Route Handler는 캐시 확인 → 없으면 서비스 함수 호출 → 캐시 저장 패턴

---

### 3-A. OpenAI 서비스 (`lib/services/openaiService.ts`)

- [ ] `OPENAI_ADMIN_KEY` 없으면 즉시 `connected: false`, `error: 'NOT_CONFIGURED'` 반환
- [ ] 이번 달 시작/종료 Unix seconds 생성 유틸
- [ ] 공식 Usage API 호출:
  `GET https://api.openai.com/v1/organization/usage/completions?start_time={unix}&end_time={unix}&bucket_width=1d&group_by[]=model&limit=31`
- [ ] 비용은 가능하면 공식 Costs API 우선 조회:
  `GET https://api.openai.com/v1/organization/costs?start_time={unix}&end_time={unix}&bucket_width=1d`
- [ ] Usage API pagination(`has_more`, `next_page`) 처리
- [ ] zod 스키마:
  ```typescript
  const UsageResultSchema = z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    num_model_requests: z.number(),
    model: z.string().nullable(),
  });

  const UsageBucketSchema = z.object({
    start_time: z.number(),
    end_time: z.number(),
    results: z.array(UsageResultSchema),
  });
  ```
- [ ] `model` 기준 모델별 Map 집계
- [ ] Costs API가 없거나 실패하면 `getPrice(OPENAI_PRICING, model)`로 추정 비용 계산
- [ ] `dailyHistory` 생성 (날짜별 합산)
- [ ] 에러: 401/403 → `INVALID_KEY`, 429 → `RATE_LIMIT`, 기타 → `UNKNOWN`

---

### 3-B. Gemini 서비스 (`lib/services/geminiService.ts`)

- [ ] `GOOGLE_APPLICATION_CREDENTIALS` 존재 시 방법 A, `GEMINI_API_KEY`만 있으면 방법 B
- [ ] **방법 A**: `@google-cloud/monitoring` 사용
  - 메트릭: `aiplatform.googleapis.com/publisher/online_serving/token_count`
  - 모델별 집계, `dailyHistory` 생성
- [ ] **방법 B**: `connected: false`, `error: 'NO_USAGE_API'`, `errorMessage: 'Gemini 사용량 조회는 Google Cloud Monitoring 설정이 필요합니다'`

---

### 3-C. Cursor 서비스 (`lib/services/cursorService.ts`)

> ⚠️ Cursor는 공식 공개 Usage API가 아니라 비공식/내부 API 기반이다. 스키마 변경 가능성을 전제로 방어적으로 구현한다.  
> VS Code 확장 프로그램을 만들지 않는다. 해당 확장들이 쓰는 토큰 감지/usage API 접근 방식만 대시보드 백엔드에서 참고한다.

- [ ] 토큰 입력 우선순위:
  1. `CURSOR_SESSION_TOKENS` 있으면 쉼표로 분리해 다중 계정 조회
  2. `CURSOR_SESSION_TOKEN` 있으면 단일 계정 조회
  3. 로컬 실행 환경이면 Cursor 로컬 SQLite DB에서 `WorkosCursorSessionToken` 자동 감지 시도
  4. 모두 실패하면 `connected: false`, `error: 'NOT_CONFIGURED'` 반환
- [ ] 로컬 SQLite 자동 감지(선택 기능):
  - Cursor 앱의 로컬 SQLite DB 후보 경로를 OS별로 탐색
  - 가능하면 순수 JS SQLite 리더(sql.js 등) 사용
  - 실패 시 자동 감지는 조용히 포기하고 수동 토큰 안내
  - 서버 배포 환경에서는 로컬 DB 자동 감지 불가
  - VS Code/Cursor 확장, 상태 표시줄, Secret Storage 구현은 범위 제외
- [ ] 각 토큰으로 `https://www.cursor.com/api/usage` 호출:
  ```typescript
  fetch('https://www.cursor.com/api/usage', {
    headers: {
      Cookie: `WorkosCursorSessionToken=${sessionToken}`,
      'User-Agent': 'Mozilla/5.0',
    },
    cache: 'no-store',
  })
  ```
- [ ] 가능하면 계정/청구 유형 감지를 위해 `/api/auth/stripe` 계열 내부 API도 조회하되, 실패해도 usage 조회는 계속 진행
- [ ] zod 스키마 (모든 필드 optional — 비공식 API):
  ```typescript
  const CursorSchema = z.object({
    tokenUsage: z.object({
      todayTotalCents: z.number().optional(),
      totalCents: z.number().optional(),
      totalTokens: z.number().optional(),
      inputTokens: z.number().optional(),
      outputTokens: z.number().optional(),
    }).optional(),
    usageBasedPricing: z.object({
      currentUsage: z.record(z.object({
        numRequests: z.number().optional(),
        inputTokens: z.number().optional(),
        outputTokens: z.number().optional(),
        totalTokens: z.number().optional(),
        totalCents: z.number().optional(),
      })).optional(),
    }).optional(),
    recentRequests: z.array(z.object({
      timestamp: z.string().optional(),
      model: z.string().optional(),
      inputTokens: z.number().optional(),
      outputTokens: z.number().optional(),
      totalTokens: z.number().optional(),
      costCents: z.number().optional(),
    })).optional(),
  });
  ```
- [ ] HTTP 401/403 → `error: 'SESSION_EXPIRED'`, `errorMessage: 'cursor.com/settings에서 WorkosCursorSessionToken을 재발급하세요'`
- [ ] zod 파싱 실패 → `error: 'SCHEMA_CHANGED'` + `console.error('[Cursor] Schema changed:', raw)`
- [ ] 정규화:
  - `cost.today` = `todayTotalCents / 100`
  - `cost.thisMonth` = `totalCents / 100`
  - `requests` = usageBasedPricing 내 numRequests 합산
  - `tokens` = 응답에 token 필드가 있으면 합산, 없으면 `{ input: 0, output: 0, total: 0 }`
  - `models` = usageBasedPricing/recentRequests의 모델별 토큰·비용·요청 집계
  - `dailyHistory` = recentRequests timestamp가 있으면 일별 집계, 없으면 `[]`
  - 다중 계정이면 계정별 결과를 합산하되 `models.model` 이름에 계정 label을 붙이지 말고 동일 모델끼리 합산

---

### 3-D. Claude 서비스 (`lib/services/claudeService.ts`)

- [ ] `ANTHROPIC_ADMIN_KEY` 없으면 즉시 `connected: false`, `error: 'NOT_CONFIGURED'` 반환
- [ ] Anthropic Usage & Cost Admin API 호출 (조직 계정 필요, 개인 계정 불가):
  ```typescript
  fetch('https://api.anthropic.com/v1/organizations/usage_report/messages?starting_at=YYYY-MM-01T00:00:00Z&ending_at=YYYY-MM-DDT00:00:00Z&bucket_width=1d&group_by[]=model', {
    headers: {
      'x-api-key': process.env.ANTHROPIC_ADMIN_KEY,
      'anthropic-version': '2023-06-01',
    },
    cache: 'no-store',
  })
  ```
- [ ] 비용은 공식 Cost API 우선 조회:
  `GET https://api.anthropic.com/v1/organizations/cost_report?starting_at=...&ending_at=...&group_by[]=description`
- [ ] pagination(`has_more`, `next_page`) 처리
- [ ] zod 스키마로 응답 검증 (실제 API 응답 구조 확인 후 작성)
- [ ] 모델별 집계: `model` 필드 기준
- [ ] Cost API가 없거나 실패하면 `getPrice(ANTHROPIC_PRICING, model)`로 추정 비용 계산
- [ ] `dailyHistory` 생성
- [ ] 에러: 401/403 → `INVALID_KEY`, 개인 계정/권한 없음 → `NO_USAGE_API`, 기타 → `UNKNOWN`

> 📌 Anthropic Usage API 스펙은 출시 시점에 따라 다를 수 있다.  
> **반드시 https://docs.anthropic.com/en/api 를 먼저 확인하고** 실제 엔드포인트/응답 구조에 맞게 구현한다.  
> 문서에서 usage 관련 엔드포인트를 찾을 수 없으면 `error: 'NO_USAGE_API'`를 반환하고 주석에 확인 필요 사항 기록.

---

### 3-E. Figma 서비스 (`lib/services/figmaService.ts`)

- [ ] `FIGMA_ACCESS_TOKEN`, `FIGMA_TEAM_ID` 없으면 `connected: false`, `error: 'NOT_CONFIGURED'` 반환
- [ ] `FIGMA_OAUTH_TOKEN`이 없으면 Activity Logs API는 건너뛰고 팀 프로젝트/파일 수 대체 지표 사용
- [ ] 플랜 확인 후 분기:

  **Enterprise 플랜 — Activity Logs API**:
  - Activity Logs API는 Personal Access Token이 아니라 OAuth 2 token 필요
  - OAuth scope: `org:activity_log_read`
  - Enterprise 조직 admin만 접근 가능
  ```typescript
  fetch(`https://api.figma.com/v1/activity_logs?limit=100`, {
    headers: { Authorization: `Bearer ${process.env.FIGMA_OAUTH_TOKEN}` },
  })
  ```
  - 이벤트 타입별 집계: `get_file`, `get_image`, `code_generation`, `post_comment` 등
  - `tokens.total` = 전체 API 호출 수 (이번 달)
  - `models` 필드를 이벤트 타입별 분류로 재활용:
    ```typescript
    // ModelUsage의 model 필드에 이벤트 타입명 사용
    { model: 'code_generation', requests: 42, inputTokens: 0, outputTokens: 0, cost: 0 }
    ```
  - `dailyHistory` 생성 (날짜별 호출 수)

  **그 외 플랜 — 대체 지표**:
  ```typescript
  // 팀 프로젝트 수, 파일 수로 활동 지표 제공
  fetch(`https://api.figma.com/v1/teams/${process.env.FIGMA_TEAM_ID}/projects`, {
    headers: { 'X-Figma-Token': process.env.FIGMA_ACCESS_TOKEN },
  })
  ```
  - `tokens.total` = 프로젝트 내 총 파일 수
  - `errorMessage: 'activity_logs는 Enterprise 플랜 필요. 파일 수로 대체 표시 중'`

- [ ] HTTP 401/403 → `error: 'INVALID_KEY'`
- [ ] 403 + 플랜 메시지 → `error: 'PLAN_REQUIRED'`, `errorMessage: 'Figma activity_logs API는 Enterprise 플랜이 필요합니다'`

---

### 3-F. Route Handlers

각 서비스 Route Handler는 동일한 패턴으로 구현:

```typescript
// app/api/usage/{service}/route.ts 공통 패턴
import { NextResponse } from 'next/server';
import { getCache, setCache } from '@/lib/cache';
import { fetch[Service]Usage } from '@/lib/services/[service]Service';
import type { ServiceUsage } from '@/lib/types';

export async function GET() {
  const cached = getCache<ServiceUsage>('{service}');
  if (cached) return NextResponse.json(cached);

  const data = await fetch[Service]Usage();
  setCache('{service}', data);
  return NextResponse.json(data);
}
```

- [ ] `app/api/usage/openai/route.ts`
- [ ] `app/api/usage/gemini/route.ts`
- [ ] `app/api/usage/cursor/route.ts`
- [ ] `app/api/usage/claude/route.ts`
- [ ] `app/api/usage/figma/route.ts`

#### `app/api/usage/all/route.ts`
- [ ] 5개 서비스 `Promise.allSettled` 병렬 호출 (각각 캐시 확인)
- [ ] `AllUsageResponse` 형태로 반환 (`fetchedAt` 포함)

#### `app/api/refresh/route.ts`
- [ ] `POST`: `clearCache()` 후 `/api/usage/all` 재조회 결과 반환

### 완료 기준
```bash
curl http://localhost:3000/api/usage/all
# 5개 서비스 모두 { connected: true|false, ... } 포함한 JSON 반환
```

---

## Agent 4 — Frontend Components & Dashboard

### 역할
백엔드 API를 소비하는 클라이언트 UI 구현

### 사전 조건
Agent 3 완료 (`/api/usage/all` JSON 응답 확인 후 시작)

### 규칙
- `'use client'` 컴포넌트에서 외부 API 직접 호출 금지
- 숫자 표시: `Intl.NumberFormat` 또는 자체 `formatNum` 유틸 사용
- Figma 탭은 "토큰" 대신 "API 호출" 용어 사용

---

### 4-A. 데이터 훅 (`hooks/useUsageData.ts`)

- [ ] `'use client'`
- [ ] `/api/usage/all` 폴링 (5분 간격)
- [ ] 상태: `data: AllUsageResponse | null`, `loading`, `error`, `lastUpdated: Date | null`
- [ ] `refresh()` 함수: `POST /api/refresh` 호출 후 재조회
- [ ] unmount 시 타이머 정리

---

### 4-B. 공통 컴포넌트

#### `components/TokenGauge.tsx`
- [ ] props: `used: number, limit?: number, label: string, color: string, unit?: string`
- [ ] `unit` 기본값 `'tokens'` — Figma는 `'calls'` 전달
- [ ] `limit` 있으면 프로그레스 바 + `used / limit` 텍스트
- [ ] `limit` 없으면 누적 수치만
- [ ] 80% 이상 경고색, 95% 이상 위험색

#### `components/ServiceCard.tsx`
- [ ] props: `usage: ServiceUsage`
- [ ] 서비스명 + 연결 상태 dot
- [ ] 이번 달 비용, 총 토큰(또는 API 호출 수), 요청 수
- [ ] Figma는 "토큰" 대신 "API 호출 수" 레이블 사용
- [ ] 에러 시 `errorMessage` + 해결 방법 표시

#### `components/ModelBreakdown.tsx`
- [ ] props: `models: ModelUsage[], serviceId: ServiceId`
- [ ] `serviceId === 'figma'`이면 컬럼 헤더를 "이벤트 타입 / 호출 수 / 비중"으로 변경
- [ ] 그 외: "모델명 / 입력 토큰 / 출력 토큰 / 비용 / 비중"
- [ ] 비용(또는 호출 수) 내림차순 정렬
- [ ] 빈 배열이면 "데이터 없음" 표시

#### `components/CostChart.tsx`
- [ ] `'use client'`
- [ ] Recharts `BarChart`: x축 서비스명 5개, y축 비용($)
- [ ] 서비스별 고정 색상:
  - OpenAI: `#639922` (green)
  - Gemini: `#185FA5` (blue)
  - Cursor: `#BA7517` (amber)
  - Claude: `#7F77DD` (purple)
  - Figma: `#D85A30` (coral)
- [ ] 툴팁에 토큰 수(또는 API 호출 수) 포함

#### `components/DailyChart.tsx`
- [ ] `'use client'`
- [ ] Recharts `LineChart`: x축 날짜(MM/DD), y축 토큰/비용 탭 전환
- [ ] 서비스별 토글 체크박스 (위와 동일한 색상)
- [ ] 데이터 없으면 플레이스홀더

---

### 4-C. 메인 대시보드 (`components/Dashboard.tsx`)

- [ ] `'use client'`
- [ ] `useUsageData` 훅 사용
- [ ] 탭: `overview` / `openai` / `gemini` / `cursor` / `claude` / `figma`
- [ ] 우측 상단: 마지막 업데이트 시각 + 새로고침 버튼
- [ ] 로딩 중: 스켈레톤 카드

**전체 요약 탭 (`overview`)**:
1. 메트릭 카드 3개 — 이번 달 총 비용 / 총 토큰+API호출 / 활성 서비스 수 (N/5)
2. 서비스별 TokenGauge 5개
3. CostChart
4. DailyChart (전체 서비스 토글)

**서비스 상세 탭 (openai / gemini / claude)**:
1. 메트릭 카드 4개: 입력 토큰 / 출력 토큰 / 이번 달 비용 / 요청 수
2. ModelBreakdown (모델별 테이블)
3. DailyChart (단독)

**Cursor 상세 탭**:
1. 메트릭 카드 4개: 오늘 비용 / 이번 달 비용 / 총 토큰 / 요청 수
2. ModelBreakdown (모델별 토큰·비용 데이터가 있으면 표시)
3. 최근 요청 데이터가 있으면 시간 / 모델 / 토큰 / 비용 테이블 표시
4. 토큰 데이터가 응답에 없으면 비용·요청 수 중심 안내 표시
5. 에러 시 재발급 안내 링크 표시

**Figma 상세 탭**:
1. 메트릭 카드 3개: 이번 달 API 호출 수 / 코드 생성 호출 수 / 총 비용(플랜 초과분)
2. ModelBreakdown (이벤트 타입별 테이블)
3. DailyChart (일별 API 호출 수)
4. 플랜 미지원 시 안내 배너

#### `app/page.tsx`
- [ ] `<Dashboard />` 렌더링
- [ ] `<title>AI Usage Dashboard</title>` 설정

### 완료 기준
```
http://localhost:3000 접속 시:
- 6개 탭 전환 동작
- 각 서비스 카드에 데이터 또는 에러/안내 메시지 표시
- Figma 탭에서 "API 호출 수" 용어 사용 확인
- 새로고침 버튼 동작
```

---

## Agent 5 — QA & Finalize

### 역할
통합 테스트, 엣지케이스, README 작성

### 사전 조건
Agent 4 완료

### 작업 목록

#### 기능 테스트
- [ ] 키 없이 실행 → 5개 서비스 모두 "미설정" 상태 정상 표시
- [ ] 키 하나씩 추가하며 개별 연결 확인
- [ ] Cursor 토큰 만료 → `SESSION_EXPIRED` + 재발급 안내 표시
- [ ] Cursor 스키마 변경 시뮬레이션 → `SCHEMA_CHANGED` + 서버 로그 확인
- [ ] Cursor 다중 계정 토큰 → 계정별 조회 후 합산 표시
- [ ] Cursor 로컬 SQLite 자동 감지 실패 → 수동 토큰 안내 표시
- [ ] Claude API 응답 구조가 문서와 다를 경우 → `UNKNOWN` 또는 `SCHEMA_CHANGED` 처리 확인
- [ ] Figma Enterprise 아닌 플랜 → 대체 지표 또는 `PLAN_REQUIRED` 안내 표시
- [ ] 5분 자동 갱신 확인 (Network 탭)
- [ ] `pnpm build` 통과
- [ ] `pnpm tsc --noEmit` 통과

#### 엣지케이스
- [ ] 사용량 0인 경우 게이지/차트 정상 표시 (0/0 나눗셈 방지)
- [ ] 모델명 미매칭 → `default` 단가 적용
- [ ] 네트워크 타임아웃 → `UNKNOWN` 처리
- [ ] 동시 새로고침 중복 방지 (loading 상태 중 버튼 비활성화)

#### README.md 작성
- [ ] 프로젝트 소개 + 스크린샷 자리 표시 (`<!-- screenshot -->`)
- [ ] 실행 방법
- [ ] 서비스별 키/토큰 발급 방법:
  - **OpenAI**: platform.openai.com → Admin keys 또는 조직 Usage/Costs API 접근 권한 키
  - **Gemini**: Google Cloud Console → 서비스 계정 생성 + Monitoring API 활성화
  - **Cursor**:
    1. Cursor 앱 로그인 상태면 로컬 SQLite DB 자동 감지 우선
    2. 자동 감지 실패 시 회사/개인 계정으로 cursor.com/settings 접속
    3. F12 → Application → Cookies → cursor.com
    4. `WorkosCursorSessionToken` 전체 값 복사 (`user_XXXXX::eyJ...`)
    5. `.env.local`에 `CURSOR_SESSION_TOKEN` 또는 `CURSOR_SESSION_TOKENS`로 붙여넣기
    6. 만료 시 동일 방법으로 재발급
  - **Claude**: console.anthropic.com → 조직 Admin API 키 (개인 계정 불가)
  - **Figma**: figma.com → 프로필 → Settings → Personal access tokens  
    팀 ID: figma.com/files 에서 팀 URL 확인  
    Activity Logs는 Enterprise 조직 admin OAuth token + `org:activity_log_read` scope 필요
- [ ] 트러블슈팅 (에러 코드별 해결 방법 표)

---

## 에이전트 공통 규칙

1. **`any` 금지** — 외부 API 응답은 zod로 반드시 검증
2. **키 노출 금지** — `process.env.*`는 Route Handler 또는 `lib/services/*` 서버 전용 레이어에서만 접근
3. **단가 테이블 중앙화** — `lib/pricing.ts` 외 하드코딩 금지
4. **방어적 파싱 (Cursor)** — 스키마 변경 시 임의 파싱 금지, `SCHEMA_CHANGED` 반환
5. **API 스펙 우선** — Claude API는 구현 전 공식 문서 확인 필수
6. **에러 격리** — 한 서비스 실패가 다른 서비스 렌더링에 영향 주지 않음
7. **용어 일관성** — Figma는 "토큰" 대신 "API 호출 수" 사용 (코드 주석 포함)
8. **숫자 포맷** — 화면 표시 숫자 전부 포맷 (`$12.34`, `1.2M`, `3.4K calls`)
9. **커밋 단위** — 각 에이전트는 작업 범위 완료 후 의미 있는 단위로 커밋
