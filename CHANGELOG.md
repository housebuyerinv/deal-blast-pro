# Deal Blast Pro - CHANGELOG / RELEASE NOTES

Generated as part of full transfer/backup package on 2026-06-01.

## Current Completed Pages / Features (as of latest build)
- **Public Site**:
  - Landing page with hero, features, pricing teaser, CTAs to register/login.
  - Pricing page: 5-tier (Free Demo $0, Starter $47/mo $500/yr, Pro $97/mo $1,000/yr, Agency $197/mo $2,000/yr, Enterprise $297/mo or Custom $3,000/yr or Custom). Monthly/Annual toggle, feature comparison matrix, realistic checkmarks.
  - /portal: Public submission portal with form (address, pricing, submitter info, consent, honeypot anti-spam, rate limit). Submits to app as 'Submitted' deals.
  - Login/Register: Demo auth flow, sets mock user, redirects to /app/dashboard.
  - Contact, Privacy, Terms, Security, ForgotPassword (basic).
  - PublicNav shared.

- **App (Protected /app/* - requires login via demo register/login)**:
  - AppShell + Sidebar + Topbar (with trial/plan badge, role switcher, logout).
  - Dashboard: Overview, quick actions, recent activity.
  - Submissions / Deal Submissions: Queue for public/internal subs (status Submitted/Needs Info/Draft). Approve to inventory.
  - Inventory: Approved deals list/grid, search, filters.
  - Buyers: CRM import, list, matching.
  - Blast: Email blast composer (Gmail BCC sim), history, tracking.
  - Pipeline: Kanban board for deal stages.
  - Analytics: KPIs, tax prep, income/deal performance, charts (sim data).
  - Settings (Admin): Multiple tabs - Trial (plan comparison 5-tiers, usage meters, countdown, upgrade flow), Matching (weights), Templates (blast), Data (import/export JSON, reseed), Demo, Team, Diagnostics, Production (checklists).
  - Deal Calculator, Manual Intake, FollowUps, Upgrade flow (plan select, sim payment, success splash, plan apply via store).
  - OnboardingTour.

- **Core Systems**:
  - Zustand store (useAppStore): deals, buyers, offers, activities, trial/plan (Free/Starter/Pro/Agency/Enterprise with limits), settings, persist to localStorage, exportAllData/importAllData JSON, add/update/approve deals, useTrialAction, matching engine integration, blast logs.
  - Local/demo storage (localStorageAdapter, no real backend yet).
  - Deal types: full property/pricing/debt/condition/submitter/docs.
  - Trial/plan: usage caps per tier, isPaid, upgradeToPlan, currentPlan updates badges/status/limits in UI (Topbar, Settings Trial tab, etc.).
  - Public submissions: land in Submissions queue.
  - Anti-spam in portal (honeypot, rate limit).
  - Demo auth: explicit login/register required for /app (guard in router, no auto mock on public loads after updates).
  - Build: Vite + TS + Tailwind, dark premium SaaS UI with cards, glows, tables.
  - Backup/Export: JSON full data export/import in Settings > Data; source ZIPs available.
  - Upgrade flow: /upgrade public + /app/upgrade, plan select, sim checkout ("Payment integration coming..."), success splash, applies to store/trial/plan state, updates UI everywhere.

- **Other**:
  - Matching engine (lib/matchingEngine.ts).
  - Constants, types, utils.
  - ErrorBoundary, tooltips, etc.
  - dist/ from build ready for static deploy.

## Working Features
- End-to-end public deal submission via /portal -> appears in admin Deal Submissions.
- Full 5-tier pricing/plan system with demo upgrade (sim payment), limits, badges, status updates across app (no real billing).
- Deal lifecycle: submit -> review/approve -> inventory -> blast -> pipeline -> analytics.
- Local persistence + full JSON backup/restore (import/export).
- Demo login/register for app access (mock admin user).
- Feature comparison, weights config, blast templates.
- Real-time-ish demo (countdowns, usage).
- Responsive cards/tables, hover effects, side panels for details.
- Production checklists and handoff docs in /docs.

## Pending Features
- Real backend/API (current is local demo only; see docs/BACKEND_HANDOFF.md, docs/API_ROUTES.md).
- Real payments/billing integration (currently sim only in upgrade; "coming with production launch").
- Full auth (real sessions, not demo mock; teams/roles beyond switcher).
- VA/Team mode, role-based permissions, shared pipelines.
- Public app versions / seller portal enhancements.
- Ecosystem Initialization (3rd party integrations, notifications, etc.).
- Hard enforcement for public form required fields/docs.
- Advanced blast (real Gmail API), follow-up automation, more analytics.
- Mobile PWA, advanced search/filters, photo uploads in public form.
- Investor matching marketplace public view.

## Known Issues
- No real Git repo (no .git; manual ZIPs/backups used for transfer).
- Demo always had auto-mock user in past (now guarded; fresh loads require login for /app).
- Large JS chunk warning in build (pre-existing; ~787kB+).
- Public form in portal is basic (no full wizard yet for public to avoid internal deps; uses store directly).
- "bird dogs" wording may linger in non-portal files (not edited per constraints).
- Data is browser localStorage only (export JSON for transfer; no server sync).
- Some Settings tabs/UI polished in prior but per this task no feature edits.
- Direct /app access without login now redirects (improved protection).
- No production deploy yet (dist/ static ok for netlify/vercel etc.).
- Some docs in /docs are drafts/placeholders.

## Next Build Priorities
- See TODO_NEXT.md
- Focus on real backend handoff, public portal enhancements (per prior), full auth/VA, payments sim to real, ecosystem.
- Maintain demo usability and backup/transfer process before more features.

Build status at package time: Successful (see below).

This file created as part of backup package (allowed per instructions: backup files only). Do not edit app code/features.
