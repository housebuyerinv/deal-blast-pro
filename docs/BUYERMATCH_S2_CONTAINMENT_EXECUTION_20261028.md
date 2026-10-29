# Authorized S2 legacy Portal containment execution — 2026-10-28

Result: **STOPPED BEFORE PUBLICATION. Containment remains unverified; no billing campaign.**

Scope: dedicated S2 project `prj_XglHAvS3zjuyLWvHkuNt5U8BoUtl`, team `team_2ejXKYjjGXIFsIQTUMEqZ8Cf`. Application remains `68c5cf9f4d8fcd590e45dd536eab1eb29edecccc`. Starting operator was `e970909e7ae90b686d060ab026bbe842432787f9`.

## Actual provider operations and rollback

1. Fresh owner-profile API GETs verified the same nine deployments and two aliases, SSO protection on all deployments, and no active or draft custom firewall policy.
2. Local matcher verification covered all seven approved hostnames and all three path families with base, slash and dot variants. GET/HEAD remain excluded. Neighboring worker/response routes do not match.
3. Existing Vercel CLI accepted and validated the exact custom DENY rule. It was the sole custom rule and first in draft evaluation order. Rule ID: `rule_buyer_match_legacy_s2_portal_containment_zChu1e`. No purchase, plan change or paid service was initiated. Vercel documents basic custom rules as free and available on Hobby.
4. Independent draft readback also showed provider-initialized OWASP CRS categories `gen`, `rce`, `sqli`, and `xss` active in Log mode, despite the previous active configuration being null. There was only one explicit `rules.insert` change, but the resulting complete configuration contained these additional active settings. Their effective behavior and chargeability on this team were not established. The owner's explicit stop condition for unrelated settings/ambiguous behavior therefore prevented publication. This is not a claim that Vercel cannot ever support the desired custom rule.
5. A conditional WAF-bypass inventory GET returned 403: `Conditional bypass is unavailable for this team.` The aggregate overview had previously returned 402 on paid IP-bypass inventory. Neither was converted into fabricated empty bypass evidence; no upgrade was attempted.
6. The new reader was exercised with the actual configured Vercel GET transport and actual staged configuration. It rejected `UNPUBLISHED_POLICY` before any runtime HTTP probe or success receipt. This proves the negative live-provider path only, not successful hosted coverage.
7. Before rollback, exact complete draft equality with the saved draft, active=null, one explicit insertion and the exact owned rule ID were checked. Only our unpublished draft was discarded. Independent provider GET then returned `active=null`, `draft=null`, `versions=[]` at `2026-10-28T23:23:37.036Z`. No historical deployment, alias, SSO setting or active firewall policy was modified.

No Portal POST, hosted OPTIONS campaign, Checkout, subscription, webhook, deployment, migration, buyer query, key access, Production or MoneyMap change occurred. GET/HEAD behavior is preserved by absence of an active change; it was not falsely reported as a passed post-publication test.

## Correction to earlier read-only report and additional existing gate

Fresh project metadata has three SSO automation-bypass entries, not zero. Non-secret metadata identifies scope `automation-bypass` and creation timestamps `1793228845640`, `1793228845708`, `1793228845765` (during the prior parallel protected CLI requests). Inspection of the installed CLI source confirms it automatically PATCHes a protection-bypass entry when none exists, and otherwise reuses an existing entry. The timestamps align with that earlier behavior; no audit-log attribution beyond this evidence was obtained. Therefore the earlier blanket claim that those CLI requests caused no hosted settings changes was incorrect.

No bypass secret was displayed, exported, copied to source, or revoked. No new bypass entry was created by this execution. These SSO entries are distinct from WAF custom bypasses; SSO protection is still `all`. The existing campaign baseline's zero-bypass requirement remains unchanged and would reject the three entries. The focused evidence reader requires an existing native automation access path and refuses to bootstrap a missing one. Consequently the complete operator is **not campaign-ready**, even if the draft initialization issue were separately resolved. A provider-supported, owner-approved resolution of this access/baseline conflict is required; silently loosening the baseline or revoking credentials is outside this change.

## Focused local operator integration

`scripts/testing/s2-legacy-portal-coverage.mjs` is connected to the native provider and added to the exact-source execution-file manifest. It collects fresh provider configuration, complete inventory/aliases, canceled/static artifact evidence, and harmless OPTIONS responses. It requires the exact reviewed policy, no draft, no additional rules/bypasses, no active unrelated managed CRS, complete host/path/method coverage, provider-level denial markers/request IDs, unchanged fallback GET, and final policy/bypass/inventory/alias readback. It writes a durable success receipt only after every condition passes.

The reader recognizes the two canceled artifacts and static initialization deployment through current provider state plus runtime/output evidence. It does not rely on SSO, old source metadata, generic 401/403, status200 alone, stale receipts, or synthetic success flags. It allows only GET and OPTIONS in its native HTTP adapter. Baseline IDs remain the exact nine known deployments; unknown additions, changed aliases, resumed canceled artifacts, extra static functions or forwarding routes fail closed. Existing preservation/Stripe/lifecycle checks are unchanged.

Validation: **33/33 focused tests passed**, including connected fixture execution with 63 distinct OPTIONS path/host cases, policy/account/ownership drift, extra bypasses, unsupported evidence, unknown deployments, cancellation/static changes, redirects/SSO, generic403, partial failure, interruption before requests, and no success receipt after failure. Scoped ESLint with `--no-ignore` passed. Syntax and scoped whitespace checks passed. The previously completed 26 runtime checks and BuyerMatch acceptance tests were not rerun.

Important limit: the positive connected-reader case uses isolated synthetic provider fixtures. Successful actual hosted DENY responses, active-policy schema/marker compatibility, conditional-bypass readback, and GET preservation after publication remain **unverified**, because publication was stopped. The integration is committed locally as fail-closed work, not certified as a successfully operating hosted containment system. No exact-SHA campaign approval should be requested as a substitute for resolving these provider/access blockers.

## Exact remaining provider/access decisions

- Establish a supported first-configuration procedure that activates only the approved custom rule without silently introducing unrelated active CRS settings, or obtain explicit owner approval of a provider-verified complete initial configuration. Confirm its Hobby behavior/cost before publication; do not assume the populated Log defaults are harmless or charged.
- Obtain supported authoritative evidence for conditional WAF bypass absence on this team, or a supported equivalent provider proof. An unavailable/denied list is not an empty list.
- Resolve the existing zero-SSO-bypass baseline versus native protected access conflict through an explicitly approved provider-supported method. Do not revoke the three entries or weaken the check automatically.
- Only after these are resolved: publish the reviewed rule, prove all 63 OPTIONS cases and ordinary GET/fallback behavior through the actual provider, complete the revised operator's hosted evidence verification, then obtain exact-SHA approval before a separately authorized billing campaign.

Sanitized local evidence remains in `docs/release-evidence/2026-10-28/LEGACY_S2_AUTHORIZED_PREFLIGHT.json`, `LEGACY_S2_RULE_STAGE_RESULT.json`, `LEGACY_S2_RULE_DRAFT.json`, and `LEGACY_S2_RULE_STOP_AND_ROLLBACK.json`. These raw evidence files are not staged. Existing unrelated working-tree items remain unstaged.

Primary provider references:

- https://vercel.com/docs/vercel-firewall/vercel-waf/usage-and-pricing
- https://vercel.com/docs/vercel-firewall/vercel-waf/rule-configuration
- https://vercel.com/docs/rest-api/security/get-conditional-firewall-bypasses
- https://vercel.com/docs/rest-api/security/read-firewall-configuration

Public release remains **NO-GO**.
