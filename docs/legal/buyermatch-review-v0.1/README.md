# BuyerMatch review pack v0.1

Four editable review drafts, NOT approved customer agreements. No file is deployed,
published, inserted into bm_documents, or accepted by a user. Outstanding commercial
choices are deliberately bracketed; proposed defaults require explicit approval.

October 29 revision: Terms and Privacy now carry `-r2` review versions. The retained
directory name identifies the review series, not approval or final publication.
Terms includes the approved 250/1,250 monthly invitation ceilings and 10/hour
analysis limit; Privacy describes implemented private proof replacement/history,
review/expiry boundaries and consent withdrawal. No commercial choice or legal
approval was inferred. The manifest records current review text using the canonical
line-ending convention below.

- TERMS.md: independent software/CRM/services, allowances, ownership/privacy and
  jurisdiction/licensing/compensation review.
- RENEWAL_CANCELLATION.md: monthly renewal, period-end cancellation and the proposed
  immediate/prorated change policy, aligned to TEST facts without live approval.
- REFUNDS.md: reviewable starting policy, exceptions/disputes and owner decisions.
- PRIVACY.md: buyer/contact/consent, processors, retention and access questions.

manifest.json records canonical UTF-8 review-text hashes and review-only versions.
Its explicit `hashConvention` normalizes CRLF and lone CR to LF only, with no
trimming or Unicode normalization. Hash the UTF-8 bytes of that normalized text;
LF Git blobs and Windows CRLF checkouts must produce the same review digest.
Changing text other than line-ending representation requires updating its review hash; neither a hash nor an approved
TEST database flag is owner/counsel approval. Final versions must resolve all
brackets, receive approval and be separately published with consent evidence.
Use BUYERMATCH_LEGAL_REVIEW_PACKET.md for the decision log. Governing law, seller,
tax/territories, refunds/grace, proration/usage and retention remain unresolved.

Drafting preparation is complete for the currently implemented scope. Formal legal
approval, resolution of bracketed decisions, final versions and publication remain
blocked on owner/qualified reviewer decisions. See
`docs/BUYERMATCH_LEGAL_PREPARATION_COMPLETION_20261029.md` for the complete
behavior/coverage and consent-release handoff. No legal requirement is waived.
