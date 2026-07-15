# Deal Blast Pro - Deployment & Migration Notes

## Current State

The app runs completely in the browser using Vite + React + Zustand + localStorage.

**To run locally:**
```bash
npm install
npm run dev
```

No environment variables are required for the demo to work.

## Recommended Production Deployment Path

### Option A: Fastest (Recommended for MVP)
- Use **Supabase** (Postgres + Auth + Storage + Realtime)
- Use **Vercel** or **Netlify** for frontend
- Swap `localStorageAdapter` for Supabase client calls

### Option B: Full Control
- Custom Node/NestJS + PostgreSQL + Prisma
- AWS S3 for documents
- Deploy frontend to Vercel
- Backend to Railway / Render / AWS ECS / Fly.io

## Migration Steps (High Level)

1. **Set up database** using the model in `DATA_MODEL.md`
2. **Implement auth** (start with Supabase Auth or Clerk for speed)
3. **Build the API** following `API_ROUTES.md`
4. **Create the real `apiAdapter.ts`** that implements `StorageAdapter`
5. **Flip `VITE_APP_MODE=api`** — the app will automatically use the new adapter
6. **Migrate existing localStorage data** on first login (one-time import via existing export/import functions)
7. **Add proper file upload** (generate presigned URLs)
8. **Add multi-tenancy** (team/organization isolation)
9. **Add audit logging** at the database level
10. **Set up monitoring** (Sentry + logging)

### How to Switch to API Mode Later
1. Set `VITE_APP_MODE=api` in your environment
2. Implement all methods in `src/services/apiAdapter.ts` (copy from `apiAdapter.stub.ts`)
3. The app will show a warning banner in Settings until the real adapter is complete
4. All existing demo flows continue to work because we fall back gracefully

### Why the Stub Exists
The stub prevents crashes during development while clearly signaling "this is not connected yet". This is intentional for safe incremental rollout.

## Environment Variables (Future)

See `.env.example` for the current demo variables.

Production will need at minimum:
- `DATABASE_URL`
- `AUTH_SECRET` / JWT keys
- `S3_BUCKET`, `S3_REGION`, `AWS_ACCESS_KEY_ID`, etc.
- `EMAIL_PROVIDER_API_KEY` (Resend/SendGrid)

## Data Migration Strategy

When moving from localStorage → backend:

- On first authenticated session, offer to **"Import existing demo data"**
- Use the existing `exportAllData()` / `importAllData()` functions as the bridge
- After successful migration, optionally clear localStorage (with user confirmation)

## Security Considerations (Future)

- All document access must go through signed URLs (never direct S3 public links)
- Team isolation must be enforced at the database level (RLS in Supabase or row-level checks)
- Blast and email endpoints must be heavily rate-limited
- Audit logs should be immutable

## Testing Strategy

- Keep the current client-side demo as the primary **E2E test environment**
- Use the "Run Sample Workflow" button + Demo Controls as regression test helpers
- When backend is ready, the same UI flows should work identically (adapter swap)

---

**This documentation + the adapter layer + the data model should allow any competent backend team to take over with minimal hand-holding.**