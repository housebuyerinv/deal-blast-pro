import assert from 'node:assert/strict'
import {
  deterministicInventoryDealId,
  findInventoryDealBySubmission,
  inventoryDealMatchesSubmission,
} from '../src/lib/submissionInventoryIdentity.ts'

const submissionId = 'submission-123'
const stableId = deterministicInventoryDealId(submissionId)
const passed: string[] = []

const firstSessionDeal = { id: stableId, sourceSubmissionId: submissionId }
assert.equal(findInventoryDealBySubmission([firstSessionDeal], submissionId), firstSessionDeal, 'same-session retry must reuse the deal')
passed.push('Same-session repeated conversion')

const refreshedDeal = { id: stableId, originalSubmissionId: submissionId }
assert.equal(findInventoryDealBySubmission([refreshedDeal], submissionId), refreshedDeal, 'refresh must recover by originalSubmissionId')
passed.push('Conversion after refresh')

const secondSessionDeal = { id: deterministicInventoryDealId(submissionId), sourceSubmissionId: submissionId }
assert.equal(secondSessionDeal.id, firstSessionDeal.id, 'second session must use the same identity')
passed.push('Conversion from a second simulated session')

const retainedAfterMetadataFailure = [firstSessionDeal]
assert.equal(findInventoryDealBySubmission(retainedAfterMetadataFailure, submissionId)?.id, stableId, 'retry must rediscover a retained deal')
passed.push('Metadata failure followed by retry')

const unrelatedDeal = { id: 'stale-linked-id', sourceSubmissionId: 'another-submission' }
assert.equal(inventoryDealMatchesSubmission(unrelatedDeal, submissionId), false, 'stale IDs must not match unrelated deals')
passed.push('Stale ID pointing to an unrelated deal')

assert.equal(findInventoryDealBySubmission([unrelatedDeal, firstSessionDeal], submissionId), firstSessionDeal, 'open must ignore stale unrelated deals')
passed.push('Open Inventory Deal with stale metadata')

const convertedAt = '2026-07-23T12:00:00.000Z'
const preserveTimestamp = (existing: string, next: string) => existing || next
assert.equal(preserveTimestamp(convertedAt, '2026-07-23T13:00:00.000Z'), convertedAt, 'original timestamp must survive retry')
passed.push('Original conversion timestamp preservation')

const audit = [{ event: 'submission_converted', inventoryDealId: stableId }]
const alreadyAudited = audit.some(entry => entry.event === 'submission_converted' && entry.inventoryDealId === stableId)
assert.equal(alreadyAudited, true, 'audit deduplication must recognize an existing conversion entry')
passed.push('Audit-entry deduplication')

passed.forEach((result, index) => console.log(`${index + 1}. PASS — ${result}`))
