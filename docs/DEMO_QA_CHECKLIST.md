# Deal Blast Pro - Demo QA Checklist

Use this checklist before every important demo or investor presentation.

## Pre-Demo Setup

- [ ] Fresh browser or cleared localStorage
- [ ] `VITE_APP_MODE=local` (default)
- [ ] Run `npm run dev` and confirm no console errors on load

## Core Demo Flow (10-12 minutes)

1. **First Login**
   - [ ] Use "Use Demo Login" button
   - [ ] Onboarding tour appears (or can be restarted from Settings)
   - [ ] Dashboard loads with widgets

2. **Run Sample Workflow**
   - [ ] Click "Run Sample Workflow" from Dashboard or Settings
   - [ ] Success toast appears
   - [ ] Deal terminal opens automatically with realistic data

3. **Submissions → Approval Gate**
   - [ ] Go to Submissions
   - [ ] Click "Review & Approve" on a submission
   - [ ] Verify Deal Quality Score + checklist is shown
   - [ ] Approve the deal

4. **Inventory & Terminal**
   - [ ] Open the approved deal from Inventory
   - [ ] Verify all 9 tabs load without errors
   - [ ] Check Buyer Match tab shows live scores

5. **Buyer CRM**
   - [ ] Go to Global Buyer DB
   - [ ] Open a buyer profile
   - [ ] Verify Heat Score and Match History appear
   - [ ] Test suppression from profile

6. **Blast Builder**
   - [ ] Go to Blast Builder
   - [ ] Select a deal
   - [ ] Select buyers + documents
   - [ ] Send blast
   - [ ] Verify blast log appears in deal Activity

7. **Follow-Up Center**
   - [ ] Go to Follow-Up Task Center
   - [ ] Schedule or generate a follow-up email
   - [ ] Mark one as complete

8. **Analytics & Pipeline**
   - [ ] Open Analytics page — verify charts and top lists render
   - [ ] Open Pipeline Board — change status on 2-3 cards
   - [ ] Confirm status changes persist and log to Activity

9. **Export / Backup**
   - [ ] Go to Settings → Data Management
   - [ ] Export full backup JSON
   - [ ] Clear data
   - [ ] Import backup and verify data returns

10. **Settings & Demo Controls**
    - [ ] Verify Demo Readiness Checklist shows green checks
    - [ ] Test "Reset All Demo Data" (with confirmation)
    - [ ] Restart Onboarding Tour from Settings

## Post-Demo Cleanup

- [ ] Run "Reset All Demo Data" or full localStorage clear
- [ ] Confirm app returns to clean demo state on next load

**Sign-off:** ___________________________ Date: ___________
