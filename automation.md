# AI Usage Dashboard - Chrome Extension 자동 세션 동기화 구현 최종 작업 지시서

## 현재 완료된 상태

다음 작업은 이미 완료된 상태이다.

- Upstash Redis 생성 완료
- Vercel KV/Redis 환경변수 연결 완료
- Plasmo 기반 Chrome Extension 프로젝트 생성 완료
- Plasmo 개발 환경 정상 동작 확인 완료
- Chrome Extension 빌드 가능 상태 확인 완료
- Redis SDK(@upstash/redis) 설치 완료

현재 목표는:

```text
브라우저 로그인 세션을 자동 감지하여
Dashboard와 자동 연동되는 구조 구현
```

이다.

---

# 최종 목표 아키텍처

```text
[ Browser Login Session ]
            ↓
[ Chrome Extension ]
            ↓
자동 Session 추출
            ↓
[ Next.js Session Sync API ]
            ↓
[ Upstash Redis ]
            ↓
[ AI Usage Dashboard ]
```

---

# 구현 목표

사용자가:

```text
chatgpt.com
cursor.com
```

에 로그인만 유지하면:

- Extension이 자동으로 세션을 감지하고
- 자동으로 Redis에 저장하며
- Dashboard가 최신 세션을 자동 사용하도록 구현한다.

---

# 구현 우선순위

## 1차 목표

Cursor 자동 세션 동기화 구현.

---

## 2차 목표

Dashboard Redis 기반 세션 조회 전환.

---

## 3차 목표

ChatGPT Web 자동 세션 추출 구현.

---

# 프로젝트 구조

```text
root/
├── app/
├── components/
├── lib/
├── extension/
│   └── ai-auto/
│       ├── background.ts
│       ├── contents/
│       ├── popup.tsx
│       ├── package.json
│       └── ...
```

---

# Redis 구성

## 사용 SDK

```text
@upstash/redis
```

---

## Redis 연결 방식

REST 기반 Redis 사용.

TCP Redis 사용하지 않음.

---

## 사용 환경변수

```env
KV_REST_API_URL=
KV_REST_API_TOKEN=
SYNC_SECRET=
```

---

# 구현해야 하는 작업

---

# 1. Redis Client 구성

## 목표

Dashboard 및 API에서 공용 Redis client 사용.

---

## 구현 위치

```text
/lib/redis.ts
```

---

## 요구사항

- @upstash/redis 사용
- Redis.fromEnv() 사용
- singleton 구조 유지
- 타입 안정성 유지

---

# 2. Session Sync API 구현

## 목표

Extension이 전달한 세션 데이터를 Redis에 저장.

---

## 구현 위치

```text
/app/api/session-sync/route.ts
```

---

## 기능 요구사항

### POST 요청 처리

받아야 하는 데이터:

- service
- cookies
- bearer
- userAgent
- updatedAt

---

## 인증 처리

반드시:

```text
x-sync-secret
```

헤더 검증 구현.

---

## 저장 구조

Redis Key 예시:

```text
session:cursor
session:chatgpt
```

---

## 저장 데이터 구조

```text
cookies
bearer
userAgent
updatedAt
```

---

## 에러 처리

반드시 구현:

- 잘못된 secret
- Redis 저장 실패
- 잘못된 body
- 누락된 값

---

# 3. Cursor Provider 구조 구현

## 목표

Dashboard가 Redis 기반 Cursor 세션 사용.

---

## 구현 위치

```text
/lib/providers/cursor.ts
```

---

## 요구사항

기존:

```text
.env.local 기반
```

사용 제거.

---

변경 후:

```text
Redis 기반 세션 조회
```

구조로 변경.

---

## 동작 흐름

```text
Redis 세션 조회
→ Cursor API 요청
→ Usage 반환
```

---

# 4. Chrome Extension Background Worker 구현

## 목표

Cursor 세션 자동 동기화.

---

## 구현 위치

```text
/extension/ai-auto/background.ts
```

---

## 요구사항

주기적으로 자동 실행.

권장:

```text
5~10분
```

---

## 수행 작업

자동으로:

- Cursor 쿠키 읽기
- 세션 변경 감지
- API 전송

수행.

---

## 사용 Chrome APIs

필수:

```text
cookies
alarms
storage
tabs
```

---

# 5. Cursor Cookie 추출 구현

## 목표

cursor.com 로그인 세션 자동 감지.

---

## 요구사항

자동으로:

- WorkosCursorSessionToken 읽기
- 전체 cookie string 생성

구현.

---

## 대상 도메인

```text
.cursor.com
```

---

# 6. Session Sync API 연동

## 목표

Extension → Dashboard API 연결.

---

## 동작 흐름

```text
Extension
→ POST /api/session-sync
→ Redis 저장
```

---

## 전송 데이터

```text
service
cookies
updatedAt
```

---

## 보안

반드시:

```text
x-sync-secret
```

헤더 포함.

---

# 7. Extension Permission 구성

## 목표

필수 Chrome 권한 구성.

---

## 요구사항

다음 권한 포함:

```text
cookies
tabs
storage
alarms
host_permissions
```

---

## 허용 도메인

```text
https://*.cursor.com/*
https://*.chatgpt.com/*
```

---

# 8. ChatGPT Web 구조 구현 (2차)

## 목표

ChatGPT Web 자동 세션 추출.

---

## 구현 위치

```text
/extension/ai-auto/contents/
```

---

## 요구사항

다음 정보 추출:

- bearer token
- cookies
- user-agent

---

## 구현 방식

가능한 방식:

- localStorage 접근
- sessionStorage 접근
- fetch interception
- request header 감지

---

# 9. ChatGPT Provider 구조 구현

## 목표

Dashboard가 Redis 기반 ChatGPT 세션 사용.

---

## 요구사항

Redis에서:

```text
session:chatgpt
```

조회 후 ChatGPT usage 로직 연동.

---

# 10. Session 상태 UI 추가

## 목표

Dashboard에서 현재 세션 상태 표시.

---

## 표시 정보 예시

- 마지막 동기화 시간
- Session Active 여부
- Cursor 연결 상태
- ChatGPT 연결 상태
- 마지막 업데이트 시각

---

# 11. 에러 처리 구현

## 반드시 처리할 항목

- SESSION_EXPIRED
- INVALID_SESSION
- REDIS_ERROR
- NETWORK_ERROR
- INVALID_SECRET
- RATE_LIMIT

---

# 12. 구조 분리

## 목표

Provider별 독립 유지.

---

## 권장 구조

```text
/lib/providers
  /cursor.ts
  /chatgpt.ts
  /openai.ts
```

---

# 구현 시 중요 조건

## 반드시 유지

- TypeScript strict 유지
- 기존 Dashboard 구조 최대한 유지
- 기존 API 구조 최대한 유지
- 주석 제거 금지
- 기존 코드 불필요한 삭제 금지

---

# 금지 사항

## 금지

- 토큰 console.log 출력
- 쿠키 로그 출력
- Secret 하드코딩
- Client Component에서 Redis 직접 접근
- 브라우저에 Session 노출

---

# 목표 상태

최종적으로:

```text
브라우저 로그인 상태 유지
=
Extension 자동 동기화
=
Redis 최신 세션 유지
=
Dashboard 자동 반영
```

상태를 구현한다.