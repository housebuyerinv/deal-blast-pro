# Application history reconciliation

Production baseline: `029939becdc330f4d3d4c5296895dcb62eb1d6ca`. BuyerMatch parent: `bce189a5e5b74062e5b408a03cecb3c384a0e8e5`. Common ancestor: `1f61acf32b6bf8f59994fa79522a44b6e737d52d`. Neither parent descends from the other. Production evolved independently after BuyerMatch branched; merge both histories on a new Production-based branch. Production remains untouched.

## Production-only commits

```
029939b Add Explore Features homepage CTAs
5dfb8fa Add features showcase release note
c474250 Add public DBP features showcase
c1c67d7 Fix pricing auth session typing
8f7b656 Keep authenticated pricing flow in app
1cb2a0b Fix trial recovery assignment typing
0115ace Preserve trial eligibility checks during Checkout recovery
ef032db Unblock auth build after trial schema expansion
08c6492 Recover existing Pro trial Checkout before retry
c52dd5a Remove temporary LAUNCH20 predicate logging
fd0ecf1 Diagnose Stripe promotion verification
285ff53 Expand Stripe coupon product applicability
8af6dfe Trigger branch-scoped QA Preview deployment
79fb569 Allow dedicated QA trial checkout in Preview
155e782 Handle Supabase password recovery callbacks
c4d328a Fix Pro trial software access synchronization
52cb304 Repair Owner Admin lifecycle queries
77522c1 Add safe lifecycle query diagnostics
f06037f Use server-resolved Owner Admin authority
9476cbc Add trial-safe Pro preview verification flow
20fca65 Remove obsolete free-plan heading state
2e1c08b Clarify plan limits and current usage
5ecef9c Refine customer dashboard get started panel
fd8ffe1 Restore customer workspace snapshot
f7b6544 Hide owner public portal from customers
7080102 Wire support card actions
c8fd8e5 Make basic deal intake available on Free
55a3ca3 Add customer workspace snapshot
2f509a2 Prevent customer buyer queue reads
9d236c5 Restrict admin submission tools to owner workspace
4fcfbe2 Add production verification email resend flow
d15b8b8 Resolve signup launch merge markers
e01d8cd Merge branch 'feat/credit-email-reliability-hot-zones' of https://github.com/housebuyerinv/deal-blast-pro into feat/credit-email-reliability-hot-zones
3e79f63 Enable public signup after launch
50b344e Update landing page from waitlist to signup
ac75b06 Redirect legacy waitlist to sign up
debcbc2 Replace waitlist CTA with sign up now
a5b0e6e Add What's New release notes page
f2176fd Add durable Property Intelligence history and audit
55b8ad5 Fix Property Intelligence auth status handling
2e39bcd Fix owner workspace credit search
0d5ee7d Improve public launch UX and pipeline layout
b65f23e Fix security test URL import
8309fd0 Reconcile public pricing with Hot Zones entitlement
4e7905a Add authenticated Preview smoke test runbook
6ca28f0 Correct workspace isolation assertions
c0e8f8a Add workspace isolation regression coverage
042a41d Fix release contract lint declaration
8d36774 Refresh backend handoff architecture
98b7aad Fix Stripe diagnostic test lint
4837ed5 Preserve Stripe credit-pack provider diagnostics
7e5da38 Merge remote diagnostic history
f89fb60 Capture Stripe auth diagnostics
9d6f283 Persist Stripe RPC diagnostics
d3bf0f5 Persist Stripe RPC diagnostics
db917c0 Add safe Stripe RPC diagnostics
57b04eb Clarify purchased credit policy
cf0066f Fix Vercel credit policy import
52bcc3e Fix post-launch UI consistency
604f5b2 Read durable legacy email delivery records
b9dd9d3 Recover legacy Owner Admin email history
2e1ee9f Fix Email Operations delivery history
80c3bdd Expose authorized email delivery operations
3e6aa3b Fix first-run email operations visibility
a0af9be Repair recent activity release contract
1ea8c64 Harden email delivery and provider operations
632738c Keep credit controls available during provider pauses
6aeaaf6 Clarify Hot Zones plan requirements
9a36112 Fix Preview navigation routing
774b816 Enforce approved credit and Hot Zones policies
4af89fc Fix Preview sidebar navigation
020fa29 Keep Owner Preview tab-scoped and shrink browser persistence
1331cd3 Add zero-credit guidance and Admin credit operations
25d778a Enable purchased-credit access and ledger balances
96c877d Consolidate Preview server actions for Vercel Hobby
41b11ec Add durable credits email outbox and verified Hot Zones
b2bbcf6 Fix workspace labels and Admin plan preview behavior
4f9b5d1 Fix workspace labels and Admin plan preview behavior
571f47a Backfill legacy conversion metadata variants
a92fb4b Resolve converted inventory from durable workspace evidence
659594d Resolve legacy converted submission workspaces
3084375 Backfill workspace-assigned converted inventory
4fcaae3 Add public release operations documentation
ffbcb61 Scope submission review access to workspaces
7d6a349 Harden preview access and release runtime controls
d060553 Fix Geoapify autocomplete and remove duplicate upgrade controls
783f7d5 Replace Google Places autocomplete with Geoapify
1212c72 Add address autocomplete and finish customer billing controls
71b39ab Allow Owner Admin property intelligence lookups without credits
ce833c5 Fix Owner Admin access, loading states, billing controls, and blast consent
260aff4 Persist converted submissions in Supabase inventory
```

## BuyerMatch-only commits

```
bce189a fix: show fail-closed BuyerMatch integration availability
cb85607 test: rehearse BuyerMatch against reconciled production schema
2b1d71c Document restored production schema audit and migration blockers
00444a8 feat: add disabled production invitation delivery boundary
2cf5a6e test: cover terminal response races and document production gates
73c8997 fix: enforce atomic scoped buyer capabilities across environments
d82373a test: document BuyerMatch response acceptance and release blockers
e8600bf fix: deduplicate buyer responses across tabs and capability replays
9b5d35a fix: clear protected views when another tab changes auth
6a2a1d5 fix: clarify BuyerMatch actions and isolate cross-tab workspace sync
da045b5 docs: record authenticated BuyerMatch staging verification
f3ce472 fix: normalize staging delivery receipts and verify preview isolation
e3e4044 fix: verify existing BuyerMatch staging installation safely
59b0adb feat: integrate BuyerMatch private network and staging verification
```

## Production application inventory

Preserved auth recovery/reset/verification/public signup, server owner authority, durable workspace inventory, tab-scoped owner preview, admin credit/lifecycle/email operations, Pro trial recovery/eligibility/promotions, credit accounting, Hot Zones, property intelligence audit, public features, release notes, shell/navigation, error handling, Geoapify and Vite API routing. All Production-only files are retained. Legacy migration files are retained without applying them or changing database history.

## BuyerMatch inventory

Preserved all BuyerMatch API/pages/server modules, availability, accepted-outbox response boundary, lease/issuer authorization, response replay/concurrency, environment isolation, workspace synchronization, billing isolation, eleven migrations, staging scripts, fixtures and tests.

## Conflict decisions

Six conflicts: package scripts run both suites; App retains all Production routes/account-status billing logic plus BuyerMatch routes and auth invalidation; Sidebar retains Production navigation plus BuyerMatch; plan access retains owner-preview semantics plus BuyerMatch navigation (server authorization remains separate); store retains Production compact persistence/tab-scoped preview plus scoped duplicate-write suppression; Stripe webhook routes BuyerMatch to its own fail-closed handler before the existing CRM claim path, preserving CRM event deduplication.

Production dashboard had mutually contradictory old/new copy assertions; updated the stale snapshot assertion to the deployed Get Started wording without removing its customer visibility or action checks. Removed inherited @ts-nocheck; explicitly imported Node URL in tests instead of disabling lint.

## Route matrix

| Route | Production | BuyerMatch | Candidate | Expected element/behavior |
|---|---|---|---|---|
| `/` | yes | yes | yes | `{<Landing />}` |
| `/pricing` | yes | yes | yes | `{<Pricing />}` |
| `/features` | yes | no | yes | `{<Features />}` |
| `/contact` | yes | yes | yes | `{<Contact />}` |
| `/privacy` | yes | yes | yes | `{<Privacy />}` |
| `/terms` | yes | yes | yes | `{<Terms />}` |
| `/refund-policy` | yes | yes | yes | `{<RefundPolicy />}` |
| `/acceptable-use` | yes | yes | yes | `{<AcceptableUse />}` |
| `/security` | yes | yes | yes | `{<Security />}` |
| `/waitlist` | yes | yes | yes | `{<Waitlist />}` |
| `/portal` | yes | yes | yes | `{<Portal />}` |
| `/buyer-portal` | yes | yes | yes | `{<BuyerPortal />}` |
| `/admin-login` | yes | yes | yes | `{<Login />}` |
| `/refunds` | yes | yes | yes | `{<Navigate to="/refund-policy" replace />}` |
| `/admin-register` | yes | yes | yes | `{<Navigate to="/register" replace />}` |
| `/auth/callback` | yes | yes | yes | `{<AuthCallback />}` |
| `/forgot-password` | yes | yes | yes | `{<ForgotPassword />}` |
| `/reset-password` | yes | no | yes | `{<ResetPassword />}` |
| `/login` | yes | yes | yes | `{<Navigate to="/admin-login" replace />}` |
| `/register` | yes | yes | yes | `{<Register />}` |
| `/verify-email` | yes | no | yes | `{<VerifyEmail />}` |
| `/upgrade` | yes | yes | yes | `{<Navigate to="/pricing" replace />}` |
| `/app/*` | yes | yes | yes | `{
            <ProtectedRoute>
              <AppShell>
                <Routes>
                  <Route path="buyermatch" element={<BuyerMatch />} />
                  <Route path="buyermatch/plans" element={<BuyerMatch />} />
                  <Route path="buyermatch/admin" element={<BuyerMatch />} />
                  <Route path="buyermatch/deals/:id" element={<BuyerMatch />} />
                  <Route path="dashboard" element={<Dashboard />} />
                  <Route path="submissions" element={<Submissions />} />
                  <Route path="inventory" element={<Inventory />} />
                  <Route path="buyers" element={<Buyers />} />
                  <Route path="resources" element={<Resources />} />
                  <Route path="blast" element={<Blast />} />
                  <Route path="calculator" element={<DealCalculator />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="upgrade" element={<Upgrade />} />
                  <Route path="intake" element={<ManualIntake />} />
                  <Route path="followups" element={<FollowUps />} />
                  <Route path="analytics" element={<Analytics />} />
                  <Route path="hot-zones" element={<HotZones />} />
                  <Route path="pipeline" element={<Pipeline />} />
                  <Route path="whats-new" element={<WhatsNew />} />
                  <Route path="*" element={<Navigate to="dashboard" replace />} />
                </Routes>
              </AppShell>
            </ProtectedRoute>
          }` |
| `dashboard` | yes | yes | yes | `{<Dashboard />}` |
| `submissions` | yes | yes | yes | `{<Submissions />}` |
| `inventory` | yes | yes | yes | `{<Inventory />}` |
| `buyers` | yes | yes | yes | `{<Buyers />}` |
| `resources` | yes | yes | yes | `{<Resources />}` |
| `blast` | yes | yes | yes | `{<Blast />}` |
| `calculator` | yes | yes | yes | `{<DealCalculator />}` |
| `settings` | yes | yes | yes | `{<Settings />}` |
| `upgrade` | yes | yes | yes | `{<Upgrade />}` |
| `intake` | yes | yes | yes | `{<ManualIntake />}` |
| `followups` | yes | yes | yes | `{<FollowUps />}` |
| `analytics` | yes | yes | yes | `{<Analytics />}` |
| `hot-zones` | yes | no | yes | `{<HotZones />}` |
| `pipeline` | yes | yes | yes | `{<Pipeline />}` |
| `whats-new` | yes | no | yes | `{<WhatsNew />}` |
| `*` | yes | yes | yes | `{<Navigate to="dashboard" replace />}` |
| `/buyermatch/*` | no | yes | yes | `{<Navigate to={location.pathname.replace(/^\/buyermatch/, '/app/buyermatch')} replace />}` |
| `/buyer-response` | no | yes | yes | `{<BuyerMatchResponse />}` |
| `buyermatch` | no | yes | yes | `{<BuyerMatch />}` |
| `buyermatch/plans` | no | yes | yes | `{<BuyerMatch />}` |
| `buyermatch/admin` | no | yes | yes | `{<BuyerMatch />}` |
| `buyermatch/deals/:id` | no | yes | yes | `{<BuyerMatch />}` |

App wrapper `/app/*` remains protected. Two `*` declarations retain their public-home and authenticated-dashboard fallbacks. Automated route tests parse actual JSX and exercise React Router matching against the Production route fixture.

## Verification

Local verification: 160/160 tests (83 BuyerMatch, 70 existing application, 5 route parity, 2 API routing); nested 21/21 Production-mode fixture and 188/188 migration rehearsal assertions. TypeScript/build passed. Lint: 0 errors, 94 warnings. Exact-commit hosted parity remains pending. Do not treat prior 120-assertion bce189a Preview evidence as candidate verification. Production deployment is not authorized by this report.

The reconciliation merge is created locally on `codex/buyermatch-production-reconciliation` and published as a fast-forward of the existing `codex/buyermatch-network` Preview branch, retaining its verified staging-only environment scope. Creating overrides on an unpublished branch was rejected by Vercel (`branch_not_found`); no overrides were saved. Reuse the established staging branch rather than allowing an unconfigured new branch to inherit defaults.

## Hosted packaging correction

The first merged Preview (56c6dbd, dpl_KYfGk7jJgx5uEGjcMZgBLfzg9rQY) built but could not deploy: combined endpoints exceeded the Hobby 12-function limit. Consolidated three BuyerMatch handlers and existing email operations behind one strict allowlist router, retaining their public API URLs via explicit rewrites and retaining all handler authorization. Implementations now reside in server/http. Query parameters cannot select another handler. Added routing regression tests. Also made account plan repair selects return the same trial/promotion fields as the initial select, fixing API type-check failures without @ts-nocheck or deleting fields. Dedicated API tsc check passed. No Production deployment/config/database changes.
