# Local buyer self-service evidence

All screenshots contain synthetic fixtures only. The real React presentation is
rendered by `scripts/testing/buyer-account-fixture.html`; transport is in-memory,
provider/upload operations are disabled, and the fixture is not a production entry.
This is not hosted Auth/Storage acceptance or proof of a live buyer update.

- `profile-desktop-final-synthetic.jpg`: current styled private-profile form.
- `profile-mobile-final-synthetic.jpg`: current mobile account presentation.
- `history-synthetic.jpg`, `mobile-history-synthetic.jpg`: actual history control
  exercised with synthetic delivered-invitation/decline/conversation fixtures.
- Other screenshots are preserved intermediate local UI evidence, not the latest
  presentation. `profile-update-synthetic.jpg` predates the corrected input styling.
- `focused-tests.txt`: exact scoped local test results, no hosted suite repeated.
- `legal-draft-integrity.json`: all four unapproved review drafts still match.

Browser checks: 1100px desktop and 390px mobile, no horizontal document overflow
(1085/1100 and 375/390 respectively), all buyer form inputs associated with labels,
profile-save feedback and personal-history loading observed. The actual signed-out
`/buyermatch/buyers/account` route was visited with its email/password labels and
Free-login navigation. No credentials entered, no upload or provider action.

The viewport was reset and the updated public BuyerMatch page left open. Browser
captures are viewport images, not unsupported full-document screenshots.
