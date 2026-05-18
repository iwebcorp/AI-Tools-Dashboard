# AI Usage Dashboard

AI Usage Dashboard is a case-study project for monitoring usage and cost across multiple AI tools in one place. It aggregates data from OpenAI, Gemini, Cursor, ChatGPT Web, and Figma, then presents the results through a single dashboard with charts, service cards, and drill-down views.

This repository has been sanitized for personal portfolio use. Internal company identifiers, private endpoints, and secrets are excluded.

## Overview

- Track usage and cost across multiple AI providers
- Centralize session and usage data through a Redis-backed flow
- Sync browser-captured session state with the server via a Chrome Extension
- Visualize token consumption, request volume, daily trends, and service-level details

## Architecture

```text
Chrome Extension
  -> POST /api/session-sync
  -> Next.js API
  -> Upstash Redis
  -> Provider service fetchers
  -> Dashboard UI
```

Key ideas:

1. The extension captures session state from supported web apps.
2. The server stores and resolves session data using Redis-first lookup.
3. Usage fetchers normalize provider-specific responses into a shared contract.
4. The dashboard renders aggregate and per-service views from the same model.

## Key Features

- Unified usage dashboard for OpenAI, Gemini, Cursor, ChatGPT, and Figma
- Cost, token, and request metrics at both aggregate and service level
- Date-range filtering for daily and monthly usage views
- Redis-backed session sync and lookup flow
- Chrome Extension support for session capture and server sync
- Figma project/file breakdown with recent activity visibility

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Recharts
- Zod
- Upstash Redis
- Vercel
- Chrome Extension
- Plasmo

## Project Structure

```text
app/
  api/
    session-sync/
    usage/
    proxy/gemini/
components/
lib/
  services/
  redis.ts
  session-store.ts
extension/
  ai-auto/
```

## Main Implementation Points

### Session Sync Pipeline

The `app/api/session-sync/route.ts` endpoint receives extension payloads and stores session data in Redis after validation.

### Redis-First Session Resolution

The usage fetchers resolve session state from Redis before falling back to environment-based configuration.

### Chrome Extension for Session Capture

The `extension/ai-auto` package handles browser-side session capture and syncs it to the server through a background script and content script flow.

### Usage Normalization

Provider-specific usage responses are normalized into a shared response contract so the dashboard can render a consistent experience across services.

## Challenges

- Different providers expose different response shapes and error behavior
- Session state is split across browser, service, and server contexts
- The dashboard needs to remain usable when one provider fails
- Chrome Extension development and production bundles behave differently

## What I Focused On

- End-to-end data flow from browser capture to dashboard rendering
- Shared data modeling across multiple AI providers
- Redis-backed session management and resolution
- Service-level error isolation and graceful fallback behavior
- UI surfaces for aggregate and service-specific analysis

## Local Setup

```bash
corepack pnpm install
cp .env.example .env.local
corepack pnpm dev
```

Required environment variables:

```env
KV_REST_API_URL=
KV_REST_API_TOKEN=
SYNC_SECRET=
OPENAI_ADMIN_KEY=
GOOGLE_PROJECT_ID=
```

### Chrome Extension Build

```bash
cd extension/ai-auto
npm run build
```

Production bundle output:

```text
extension/ai-auto/build/chrome-mv3-prod
```

## Why This Project Matters

This project shows full-stack ownership across UI, API, data modeling, caching, browser automation, and operational visibility. It is a useful example for roles that expect a developer to build and maintain an end-to-end internal tool, not just a front-end page or isolated backend endpoint.

## Notes for Portfolio Use

- Replace private URLs with public demo links if available
- Remove company names, internal hostnames, and secrets before publishing
- Include screenshots only for screens that do not expose sensitive data
- If you publish a public repository, keep only sanitized code and documentation

