export function deterministicInventoryDealId(submissionId: any) {
  const id = String(submissionId || '').trim()
  if (!id) throw new Error('Missing submission ID')
  return `D-SUB-${id}`
}

export function inventoryDealMatchesSubmission(deal: any, submissionId: any) {
  const expected = String(submissionId || '').trim()
  if (!deal || !expected) return false
  return [
    deal.sourceSubmissionId,
    deal.originalSubmissionId,
    deal.originalSubmission?.id,
  ].some(value => String(value || '').trim() === expected)
}

export function findInventoryDealBySubmission(deals: any[], submissionId: any) {
  return (deals || []).find(deal => inventoryDealMatchesSubmission(deal, submissionId))
}
