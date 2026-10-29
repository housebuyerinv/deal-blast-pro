// Approval of buying criteria is not consent to receive network invitations.
export async function portalConsentEvidence(db, sourceId, email, now = Date.now()) {
  const deny = () => { throw Object.assign(new Error('Recorded buyer invitation consent is required before network activation.'), { status: 409 }); };
  if (typeof sourceId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(sourceId)) deny();
  const result = await db.from('buyer_portal_submissions').select('id,buyer_data,status').eq('id', sourceId).maybeSingle();
  if (result.error) throw Object.assign(new Error('Buyer consent verification unavailable.'), { status: 503 });
  const row = result.data, consent = row?.buyer_data?.consent;
  if (!row || row.id !== sourceId || !['pending_review', 'approved', 'imported'].includes(row.status) ||
      String(row.buyer_data?.email || '').trim().toLowerCase() !== String(email || '').trim().toLowerCase() ||
      consent?.version !== 'buyer-intake-consent-v1' || consent.accuracy !== true || consent.dealInvitations !== true ||
      typeof consent.recordedAt !== 'string' || !Number.isFinite(Date.parse(consent.recordedAt)) || Date.parse(consent.recordedAt) > now + 60000) deny();
  return JSON.stringify({ source: 'buyer_portal', submissionId: sourceId, version: consent.version, recordedAt: consent.recordedAt, dealInvitations: true });
}
