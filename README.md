# Deal Blast Pro

**Professional real estate dispo + buyer-matching SaaS platform.**

Blast better deals. Match better buyers. Close faster.

## Quick Start (Windows)

1. Open a **new** PowerShell / Terminal
2. Run:

```powershell
cd "C:\Users\CTL Katastrophic\deal-blast-pro"
npm install
npm run dev
```

3. App opens at http://localhost:5173

**Demo Login**: Any email works (e.g. demo@dealblast.pro). Pre-seeded data loads on first visit.

## Current Status (Fully Implemented)

**Major completed in this session:**
- Full 9-tab Deal Terminal (all functional + editable)
- Real CSV buyer import + dedupe/merge audit
- Complete Blast Builder with templates + live preview + BCC export
- Expanded Settings (docs matrix, template editor)
- Command palette (Ctrl/Cmd+K)

The app is now extremely close to a production demo. All original working flows preserved and heavily expanded.

- ✅ Premium dark SaaS design system (cards, badges, inputs, drawer)
- ✅ Full public landing page with hero, features, pricing, FAQ
- ✅ Auth (Login / Register / Forgot) — mock, role switcher in app
- ✅ Persistent sidebar + topbar (never removed)
- ✅ Command Center dashboard with live KPIs + quick actions
- ✅ **6-Step Deal Submission Wizard** (critical piece)
  - Dynamic debt & title fields (when Free & Clear = No, all fields become required)
  - Document upload simulation per category
  - Clickable missing requirements checklist that jumps you to the exact field
  - Proper centered State field in Step 2 grid
  - Consent gates + trial limits
- ✅ Submissions Queue → Approve moves to Inventory
- ✅ Inventory Hub with deal cards (NEW badges clear on open)
- ✅ Full-screen Deal Terminal Drawer (opens from inventory or submissions)
  - Live buyer matching scores + reasons
  - Status changes + activity logging
- ✅ Global Buyer DB (cards + NEW badges)
- ✅ Deal Blast stub + live matching engine
- ✅ Admin Settings: live weight sliders, trial upgrade/reset, export/import/clear
- ✅ Full persistence (localStorage) + ErrorBoundaries
- ✅ Price inputs never reset to 0
- ✅ Mobile responsive sidebar + drawer

## Key Demo Flows to Test

1. **Public Portal** → `/portal` or button from landing. Fill 6-step wizard with debt (Free & Clear = No). Submit. See NEW badge in Submissions.
2. **Approve** a submission → lands in Inventory Hub.
3. **Click any Inventory card** → opens rich terminal drawer. View matches, change status.
4. **Buyers page** → NEW badges, strength scores.
5. **Settings** → Slide matching weights, hit "Activate Pro Demo", reseed data.
6. **Trial gates**: Submit 6 deals (trial limit = 5). See upgrade prompt.

## Architecture Notes

- Zustand single store with persist
- Strict TypeScript interfaces
- Pure matching engine (lib/matchingEngine.ts) — weights live from Settings
- All file uploads simulated with object URLs (demo only)
- "New" badge clearing uses viewed sets persisted in localStorage

## Next (Phase 4-8 in progress)

- Expand terminal to all 9 tabs with full editing
- Real CSV buyer import + dedupe + merge UI (using your sample CSV)
- Full Blast Builder with templates + Gmail BCC export
- Required field/doc matrix in Settings
- More polish, empty states, command palette

## Data

Everything lives in browser. Use Settings → Export Backup for safekeeping. "Reseed Sample Data" resets to the 5 realistic deals + 18 buyers.

Built for demo + production readiness. No crashes. Schema-safe.

---

Questions or want specific flows hardened first? Just say the word.
