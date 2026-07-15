# Deal Blast Pro - API Route Plan (REST + Best Practices)

Base URL: `/api/v1`

All routes (except public auth) require authentication via JWT in `Authorization: Bearer <token>` header.

## Authentication

| Method | Endpoint              | Description                  | Auth |
|--------|-----------------------|------------------------------|------|
| POST   | /auth/register        | Create new user + team       | Public |
| POST   | /auth/login           | Email + password login       | Public |
| POST   | /auth/logout          | Invalidate refresh token     | Required |
| GET    | /auth/me              | Get current user + team      | Required |
| POST   | /auth/refresh         | Refresh access token         | Refresh token |

## Deals

| Method | Endpoint                    | Description                          | Notes |
|--------|-----------------------------|--------------------------------------|-------|
| GET    | /deals                      | List deals (with filters)            | teamId filtered |
| POST   | /deals                      | Create new deal                      | From portal or manual intake |
| GET    | /deals/:id                  | Get single deal with all relations   | |
| PATCH  | /deals/:id                  | Update deal (any field)              | |
| DELETE | /deals/:id                  | Soft delete                          | |
| POST   | /deals/:id/approve          | Move to Approved status              | Triggers quality checks |
| POST   | /deals/:id/reject           | Reject submission                    | |
| POST   | /deals/:id/request-info     | Request more information             | |

**Query params for GET /deals**: `status`, `type`, `search`, `page`, `limit`

## Buyers

| Method | Endpoint                    | Description                     |
|--------|-----------------------------|---------------------------------|
| GET    | /buyers                     | List buyers (filters supported) |
| POST   | /buyers                     | Create buyer                    |
| GET    | /buyers/:id                 | Get single buyer                |
| PATCH  | /buyers/:id                 | Update buyer                    |
| DELETE | /buyers/:id                 | Delete buyer                    |
| POST   | /buyers/import              | Bulk import (CSV/JSON)          |
| POST   | /buyers/:id/suppress        | Global suppression              |

## Matching & Suppression

| Method | Endpoint                                      | Description |
|--------|-----------------------------------------------|-------------|
| GET    | /deals/:id/matches                            | Get live buyer matches for a deal |
| POST   | /deals/:dealId/suppress-buyer                 | Suppress buyer from this deal only |
| DELETE | /deals/:dealId/suppress-buyer/:buyerId        | Remove per-deal suppression |
| GET    | /deals/:dealId/suppressions                   | List suppressed buyers for deal |
| PATCH  | /deals/:dealId/buyers/:buyerId/response       | Record buyer response (Interested, Passed, etc.) |

## Blasts

| Method | Endpoint                    | Description |
|--------|-----------------------------|-------------|
| GET    | /deals/:id/blasts           | List blast history for deal |
| POST   | /deals/:id/blasts           | Send a blast (records BlastLog) |
| POST   | /blasts/:id/follow-up       | Schedule or send follow-up |

## Follow-Ups

| Method | Endpoint              | Description |
|--------|-----------------------|-------------|
| GET    | /follow-ups           | List follow-ups (with filters) |
| POST   | /follow-ups           | Create follow-up task |
| PATCH  | /follow-ups/:id       | Update (complete, reschedule, etc.) |
| DELETE | /follow-ups/:id       | Delete / skip |

## Documents

| Method | Endpoint                    | Description |
|--------|-----------------------------|-------------|
| POST   | /deals/:id/documents        | Upload document(s) |
| GET    | /documents/:id              | Get document metadata + signed URL |
| DELETE | /documents/:id              | Delete document |
| PATCH  | /documents/:id              | Update flags (isBuyerFacing, requiresNDA) |

## Analytics

| Method | Endpoint                    | Description |
|--------|-----------------------------|-------------|
| GET    | /analytics/dashboard        | Main dashboard metrics |
| GET    | /analytics/deals            | Deal performance breakdown |
| GET    | /analytics/buyers           | Buyer response & heat analytics |
| GET    | /analytics/blasts           | Blast performance |

## Settings

| Method | Endpoint     | Description |
|--------|--------------|-------------|
| GET    | /settings    | Get team settings |
| PATCH  | /settings    | Update weights, templates, required fields, etc. |

## Error Handling Convention

All errors return:
```json
{
  "error": "Short code",
  "message": "Human readable message",
  "details": {} // optional
}
```

Common error codes: `VALIDATION_ERROR`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `TRIAL_LIMIT_REACHED`

---

## Recommended Patterns

- Use **cursor-based pagination** for large lists (deals, buyers, activities).
- All write operations should return the updated resource.
- Use **webhooks** or **Supabase Realtime** for live updates (optional but high value).
- Rate limit blast endpoints heavily.