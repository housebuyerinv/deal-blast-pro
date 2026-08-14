# Authenticated Preview Smoke Test

Use only a disposable QA account/workspace with synthetic data. Do not send a blast, purchase credits, or call RentCast.

## Desktop pass

1. Open the Preview URL and confirm the session is authenticated.
2. Complete First Login Setup using the Free plan; record the displayed workspace and plan.
3. Navigate Dashboard, Buyers, Deal Calculator, Deal Submissions, Inventory, Pipeline, Follow-Ups, Analytics, Settings, and Hot Zones.
4. Buyers: create one synthetic buyer, edit the name/company, search and filter it, import `tests/fixtures/buyers.csv` if present, and verify duplicate handling.
5. Deals: create one synthetic deal, edit it, open matching, select recipients, and prepare (but do not send) a blast preview.
6. Settings: verify plan badge, included/purchased credit separation, zero purchased balance, upgrade controls, and billing links without opening checkout.
7. Property Intelligence: verify loading, paused-provider messaging, cached/manual fallback, autocomplete attribution, and no-credit handling; do not invoke RentCast.
8. Sign out, verify protected navigation redirects to login, sign in again, and confirm session persistence after refresh.
9. Record console errors and failed application requests. Any error involving auth, RLS, workspace scope, billing, credits, or data loss is a blocker.

## Mobile pass

Repeat the same route and state checks at viewport `390x844`. Verify no horizontal overflow, clipped dialogs, inaccessible controls, or unusable tables/forms.

## Evidence to record

- QA workspace/user identifier (non-sensitive label only)
- Preview commit/deployment
- Desktop and mobile pass/fail
- Console errors and failed request URLs/statuses (without tokens or payloads)
- Buyer/deal synthetic records created and removed
- Confirmation that no blast, checkout, RentCast request, or credit mutation occurred
