# Cursor Dashboard Usage Notes

This file keeps only the non-secret parts needed to reproduce Cursor dashboard usage fetching.
Do not store cookie values here.

## Environment

Use full browser Cookie headers for each Cursor account:

```env
CURSOR_COOKIE_STRINGS=account1_cookie_header||account2_cookie_header
```

Use `||` between accounts because Cookie values can contain commas and semicolons.

Fallback, less complete:

```env
CURSOR_SESSION_TOKENS=account1_workos_token,account2_workos_token
```

`CURSOR_SESSION_TOKENS` can authenticate basic legacy usage endpoints, but may return zero usage.
`CURSOR_COOKIE_STRINGS` is preferred.

## Required Cookie Source

For each account:

1. Open `https://cursor.com/dashboard/spending`.
2. Open Chrome DevTools > Network.
3. Enable Disable cache.
4. Refresh the page.
5. Copy the full `Cookie` request header from a successful dashboard request.
6. Put the Cookie header value into `CURSOR_COOKIE_STRINGS`.

Do not include the literal `Cookie:` prefix.

## Dashboard Endpoints Used

All requests are `POST https://cursor.com/...` with:

```http
Origin: https://cursor.com
Referer: https://cursor.com/dashboard/spending
Content-Type: application/json
Accept: application/json
Cookie: <full browser cookie header>
```

### Current Period

```http
POST /api/dashboard/get-current-period-usage
Body: {}
```

Useful fields:

- `billingCycleStart`
- `billingCycleEnd`
- `planUsage.totalSpend`
- `planUsage.includedSpend`
- `planUsage.bonusSpend`
- `planUsage.limit`
- `planUsage.autoPercentUsed`
- `planUsage.apiPercentUsed`
- `planUsage.totalPercentUsed`

### Aggregated Usage

```http
POST /api/dashboard/get-aggregated-usage-events
Body:
{
  "startDate": <billingCycleStart millis>,
  "endDate": <min(billingCycleEnd millis, now)>
}
```

Useful fields:

- `aggregations[]`
- `totalInputTokens`
- `totalOutputTokens`
- `totalCacheWriteTokens`
- `totalCacheReadTokens`
- `totalCostCents`

### Usage Events

```http
POST /api/dashboard/get-filtered-usage-events
Body:
{
  "startDate": <billingCycleStart millis>,
  "endDate": <min(billingCycleEnd millis, now)>,
  "page": 1,
  "pageSize": 1000
}
```

Useful fields:

- `totalUsageEventsCount`
- `usageEventsDisplay[].timestamp`
- `usageEventsDisplay[].model`
- `usageEventsDisplay[].chargedCents`
- `usageEventsDisplay[].tokenUsage.inputTokens`
- `usageEventsDisplay[].tokenUsage.outputTokens`
- `usageEventsDisplay[].tokenUsage.cacheWriteTokens`
- `usageEventsDisplay[].tokenUsage.cacheReadTokens`
- `usageEventsDisplay[].tokenUsage.totalCents`

## Current Normalization

The service sums all accounts in `CURSOR_COOKIE_STRINGS`.

Token totals:

```text
input = totalInputTokens + totalCacheWriteTokens + totalCacheReadTokens
output = totalOutputTokens
total = input + output
```

Cost:

```text
thisMonth = totalCostCents / 100 summed across accounts
today = chargedCents / 100 summed from usageEventsDisplay for today's date
```

Requests:

```text
requests = totalUsageEventsCount summed across accounts
```

Model breakdown:

- Uses `aggregation.model` when present.
- Uses `modelIntent` when present and not `default`.
- Uses `auto` for tier `2`.
- Uses `api` for tier `1`.

## Semantics

Cursor Pro included usage is represented by Cursor's dashboard usage APIs as usage value and included-plan consumption.
The dashboard `cost` fields in this app currently represent Cursor usage value from dashboard APIs, not the monthly Pro subscription fee itself.
## Local Cookie Values

These are full browser Cookie headers copied from `.env.local`. Treat this section as secret.

```env
CURSOR_COOKIE_STRINGS=workos_id=user_01KJ9HN3MDE74Z3XGXB557JTAT; WorkosCursorSessionToken=user_01KJ9HN3MDE74Z3XGXB557JTAT%3A%3AeyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJnb29nbGUtb2F1dGgyfHVzZXJfMDFLSjlITjNNREU3NFozWEdYQjU1N0pUQVQiLCJ0aW1lIjoiMTc3ODY1MTAyMiIsInJhbmRvbW5lc3MiOiJkYmQ0ZGU4MS02ZjlkLTRkNmYiLCJleHAiOjE3ODM4MzUwMjIsImlzcyI6Imh0dHBzOi8vYXV0aGVudGljYXRpb24uY3Vyc29yLnNoIiwic2NvcGUiOiJvcGVuaWQgcHJvZmlsZSBlbWFpbCBvZmZsaW5lX2FjY2VzcyIsImF1ZCI6Imh0dHBzOi8vY3Vyc29yLmNvbSIsInR5cGUiOiJ3ZWIiLCJ3b3Jrb3NTZXNzaW9uSWQiOiJzZXNzaW9uXzAxS1JGWFNHODhZUkpUWTJKNTlUUzRKMFZUIn0.39tryq6ppZp_TI-eAdaBFPt3qKRjoL6xL7CymsZ2fpk; cursor-web-target-synced-user=user_01KJ9HN3MDE74Z3XGXB557JTAT; generaltranslation.locale-routing-enabled=true; generaltranslation.referrer-locale=en-US; __stripe_mid=a49160a6-ed0f-43ad-a149-23a232915cdcd02bb8; _dd_s=aid=7702a759-5c81-402c-a0d2-67791f918dc4&rum=2&id=9c3d595e-5c10-4fe9-9e5f-95f2b3058f78&created=1778653621598&expire=1778654533152||workos_id=user_01JJ4GKYWBRQ0KW4HDYWYQ0FGE; WorkosCursorSessionToken=user_01JJ4GKYWBRQ0KW4HDYWYQ0FGE%3A%3AeyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJnb29nbGUtb2F1dGgyfHVzZXJfMDFKSjRHS1lXQlJRMEtXNEhEWVdZUTBGR0UiLCJ0aW1lIjoiMTc3ODY1MDY3NiIsInJhbmRvbW5lc3MiOiI4NmEyMzgyZi04ZjQ2LTQ2YjUiLCJleHAiOjE3ODM4MzQ2NzYsImlzcyI6Imh0dHBzOi8vYXV0aGVudGljYXRpb24uY3Vyc29yLnNoIiwic2NvcGUiOiJvcGVuaWQgcHJvZmlsZSBlbWFpbCBvZmZsaW5lX2FjY2VzcyIsImF1ZCI6Imh0dHBzOi8vY3Vyc29yLmNvbSIsInR5cGUiOiJ3ZWIiLCJ3b3Jrb3NTZXNzaW9uSWQiOiJzZXNzaW9uXzAxS1JGWEVZOUhIVDRUODFROTNQQ1ExREFEIn0.n2OtoE9SSRfFGUndx0wY4gwn4uokevew1G5KX-V1bMQ; cursor-web-target-synced-user=user_01JJ4GKYWBRQ0KW4HDYWYQ0FGE; generaltranslation.locale-routing-enabled=true; generaltranslation.referrer-locale=en-US; __stripe_mid=3cc17a05-b771-4f65-8d8b-8b0dc0f2068e9726ab
```

