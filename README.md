# AI Usage Dashboard

AI 서비스별 사용량과 비용을 한 화면에서 확인할 수 있도록 만든 개인 대시보드입니다.  
Next.js 기반 웹 앱과 Chrome Extension을 함께 구성해, 브라우저 세션을 Redis에 동기화하고 그 세션으로 Cursor / ChatGPT Web 사용량을 집계하도록 설계했습니다.

## Overview

이 프로젝트는 "여러 AI 도구의 사용량을 한곳에서 보고 싶다"는 문제에서 시작했습니다.

- OpenAI, Gemini, Cursor, ChatGPT Web, Figma 사용량을 통합 조회
- 브라우저 로그인 세션을 Chrome Extension으로 수집
- Vercel API Route를 통해 Upstash Redis에 세션 저장
- 서버가 Redis 세션을 우선 사용해 실제 사용량 API 호출
- 대시보드에서 서비스별 비용, 요청 수, 토큰 사용량 확인

## Architecture

```text
Chrome Extension
  -> POST /api/session-sync
  -> Vercel / Next.js API
  -> Upstash Redis
  -> service fetchers
  -> dashboard UI
```

세션 기반 서비스는 아래 흐름으로 동작합니다.

1. 사용자가 `cursor.com` 또는 `chatgpt.com`에 로그인
2. Chrome Extension이 쿠키 / bearer token을 읽음
3. Extension이 `/api/session-sync`로 세션 데이터를 전송
4. 서버가 `x-sync-secret` 검증 후 Redis에 저장
5. 대시보드 API가 Redis 세션을 읽어 각 서비스 사용량 조회

## Key Features

- 다중 서비스 사용량 집계
- Cursor 다계정 세션 저장 및 병합 집계
- ChatGPT Web 세션 쿠키 + bearer token 기반 조회
- Gemini 프록시 호출과 usage metadata 기록
- 서비스별 세션 소스 구분
  - `redis`
  - `env`
- 대시보드 API 캐싱으로 반복 호출 비용 절감

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Upstash Redis
- Vercel
- Chrome Extension
- Plasmo
- Zod

## Project Structure

```text
app/
  api/
    session-sync/
    usage/
    proxy/gemini/
lib/
  services/
  redis.ts
  session-store.ts
extension/
  ai-auto/
    background.ts
    contents/chatgpt.ts
    popup.tsx
    scripts/build-production.ps1
```

## Main Implementation Points

### 1. Session Sync Pipeline

`app/api/session-sync/route.ts`는 Extension이 전송한 세션 정보를 받아 Redis에 저장합니다.

- `x-sync-secret` 검증
- `zod`로 body schema 검증
- Cursor는 계정별 key로 저장
- ChatGPT는 단일 key로 저장

저장 key 예시는 아래와 같습니다.

```text
session:cursor:user_xxxx
session:chatgpt
```

### 2. Redis-First Session Resolution

서비스 fetcher는 환경변수보다 Redis 세션을 우선 사용합니다.

- [lib/services/cursorService.ts](C:/Users/iweb/ai-dashboard/lib/services/cursorService.ts:167)
- [lib/services/chatgptService.ts](C:/Users/iweb/ai-dashboard/lib/services/chatgptService.ts:15)

이 구조 덕분에 운영 중에는 `.env`를 수동 갱신하지 않아도 브라우저 로그인 상태만으로 세션을 갱신할 수 있습니다.

### 3. Chrome Extension for Session Capture

`extension/ai-auto`는 세션 동기화를 담당하는 Chrome Extension입니다.

- `background.ts`
  - 주기적 동기화
  - Cursor / ChatGPT 세션 업로드
- `contents/chatgpt.ts`
  - ChatGPT bearer token 추출
- `popup.tsx`
  - 동기화 상태 및 오류 표시

프로젝트가 실행 중이지 않아도 배포 환경에서 사용할 수 있도록 production bundle 생성 스크립트도 따로 구성했습니다.

## Challenges

이 프로젝트에서 핵심 난점은 "공식 API가 없는 세션 기반 서비스"를 안정적으로 다루는 것이었습니다.

- dev extension이 `localhost` HMR 포트를 계속 두드리는 문제
- production extension popup 마운트 누락 문제
- 브라우저 번들에서 `process` / JSX runtime 처리 문제
- Vercel 서버와 Extension 간 secret mismatch 문제
- Redis 저장은 성공했지만 실제 대시보드가 그 값을 쓰는지 검증하는 문제

이 과정에서 개발용 번들과 배포용 번들을 분리했고, 세션 동기화 오류가 나면 서버 응답 메시지를 Extension UI에 그대로 노출하도록 개선했습니다.

## What I Focused On

- 단순한 UI보다 "실제 운영 가능한 세션 동기화 흐름" 구현
- 브라우저-서버-Redis 간 책임 분리
- 공식 API가 없는 서비스에 대한 안전한 fallback 구조
- 디버깅 가능한 상태값과 에러 메시지 설계

## Local Setup

```bash
corepack pnpm install
cp .env.example .env.local
corepack pnpm dev
```

필수 환경변수 예시:

```env
KV_REST_API_URL=
KV_REST_API_TOKEN=
SYNC_SECRET=
OPENAI_ADMIN_KEY=
GOOGLE_PROJECT_ID=
```

Chrome Extension production bundle 생성:

```bash
cd extension/ai-auto
npm run build
```

생성 결과:

```text
extension/ai-auto/build/chrome-mv3-prod
```

## Why This Project Matters

이 프로젝트는 단순히 차트를 그리는 대시보드가 아니라,
"브라우저 세션 수집 -> 서버 검증 -> Redis 저장 -> 실제 사용량 조회"까지 이어지는 end-to-end 흐름을 직접 설계하고 디버깅한 작업입니다.

포트폴리오 관점에서는 다음을 보여줄 수 있습니다.

- Next.js 기반 풀스택 구현
- Chrome Extension 연동 경험
- Redis / Vercel 운영 경험
- 세션 기반 인증 흐름 이해
- 실서비스 디버깅과 배포 대응 능력
