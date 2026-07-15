# Deal Blast Pro - Backend Handoff Guide

## Current Architecture (Client-Side Only)

Deal Blast Pro is currently a fully functional, production-feeling **client-side only** SaaS demo built with:

- **Vite + React 18 + TypeScript**
- **Zustand** for global state management (with `persist` middleware)
- **localStorage** as the persistence layer
- **React Router v6** for routing
- Tailwind CSS for styling

### Core State Management
The single source of truth is `src/store/useAppStore.ts`.

Key persisted slices:
- `deals: Deal[]`
- `buyers: Buyer[]`
- `offers: Record<dealId, Offer[]>`
- `activities: Record<dealId, Activity[]>`
- `documents: Record<dealId, Doc[]>`
- `blastLogs: Record<dealId, BlastLog[]>`
- `buyerResponses: Record<buyerId, Record<dealId, BuyerResponse>>`
- `dealSuppressions: Record<dealId, DealSuppression[]>`
- `followUps: FollowUp[]`
- `settings: AppSettings`
- `trial: TrialState`
- `user: User | null`
- `viewedDealIds`, `viewedBuyerIds`, `suppressionList`

All data is automatically serialized to localStorage under the key `dealblastpro-v1`.

### Current Limitations (Intentional for Demo)
- No real authentication (mock login/register)
- No multi-user or team collaboration
- No real file persistence (uploads use object URLs that disappear on refresh)
- Data is per-browser only

---

## Recommended Backend Stack

For a production version, we recommend:

**Core**
- Node.js + TypeScript
- Express or NestJS (or Next.js API routes if you want full-stack)
- PostgreSQL (with Prisma ORM recommended)
- Redis (for sessions, rate limiting, caching)

**Auth**
- NextAuth.js / Auth.js **or**
- Clerk / Supabase Auth / Firebase Auth (fastest to production)
- JWT + refresh tokens for custom implementation

**File Storage**
- AWS S3 + CloudFront (recommended)
- Or Supabase Storage / Cloudflare R2

**Email**
- Resend or SendGrid for transactional emails (blast confirmations, follow-up reminders)

**Real-time (optional but nice)**
- Supabase Realtime or Pusher for live updates on deals/offers

---

## Migration Strategy

1. **Phase 1 (Current)**: localStorage + Zustand (done)
2. **Phase 2**: Adapter layer + feature flag (see `src/services/storage.ts` + `VITE_APP_MODE`)
3. **Phase 3**: Build backend API + database
4. **Phase 4**: Implement real `apiAdapter.ts` and switch `VITE_APP_MODE=api`
5. **Phase 5**: Add real auth + multi-tenancy

### How the Adapter Feature Flag Works
- `VITE_APP_MODE=local` (default) → uses `localStorageAdapter`
- `VITE_APP_MODE=api` → uses `apiAdapter.stub` (shows clear warning in UI)
- The central selector lives in `src/services/storage.ts`
- UI and Zustand persistence are **never broken** when switching modes

To switch later: set the env var and implement the real API calls inside `apiAdapter.ts`.

See `docs/DEPLOYMENT_NOTES.md` for detailed migration steps.

---

## Next Steps After Handoff

1. Review `docs/DATA_MODEL.md` and `docs/API_ROUTES.md`
2. Set up database + Prisma schema from the data model
3. Implement the API routes (start with Auth + Deals + Buyers)
4. Replace `localStorageAdapter` with real API calls
5. Add proper file upload endpoints + signed URLs
6. Implement team/organization multi-tenancy

This documentation + the adapter layer should give any backend engineer everything they need to take over cleanly.