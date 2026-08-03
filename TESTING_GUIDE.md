# Testing Guide

## Local gate

Run `npm test`, `npx tsc --noEmit -p tsconfig.app.json`, targeted ESLint for changed/critical files, and `npm run build`. Do not use Production credentials in local tests.

## Critical workflow smoke test

1. Authenticate, refresh, and verify logout/deactivation handling.
2. Submit a unique test deal in Preview. Review it, convert twice, and confirm one inventory row with the original submission ID.
3. Refresh and open another browser session to confirm durable inventory.
4. Import buyers with duplicates and suppressed contacts; verify counts and match explanations.
5. Build a blast using only simulated sending; verify consent, suppression, deduplication, and recipient counts.
6. Search `1113 murtha`; test mouse and keyboard selection, normalized address, manual load, manual fallback, and Geoapify attribution.
7. Exercise cached and refresh Property Intelligence paths and safe failures. Confirm address selection alone makes no provider-data request.
8. Preview every plan and lifecycle state. Confirm route, feature, limit, and billing messaging.
9. Check mobile widths and keyboard-only navigation on Landing, Pricing, Portal, Dashboard, Submissions, Inventory, Buyers, Calculator, Blast, Settings, and legal pages.

## Safety

Use unique test labels and remove only test records through normal UI where permitted. Never send a live blast, cancel/change a real subscription, reset Supabase, or expose environment values. Report provider failures only as status code, safe category, and configured/not configured.
