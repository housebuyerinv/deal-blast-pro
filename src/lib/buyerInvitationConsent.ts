export function hasRecordedBuyerInvitationConsent(submission: any, now = Date.now()) {
  const consent = submission?.consent
  return consent?.version === 'buyer-intake-consent-v1' && consent.accuracy === true &&
    consent.dealInvitations === true && typeof consent.recordedAt === 'string' &&
    Number.isFinite(Date.parse(consent.recordedAt)) && Date.parse(consent.recordedAt) <= now + 60000
}
