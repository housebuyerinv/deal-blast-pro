export const supplied = value => value !== null && value !== undefined &&
  (typeof value !== 'string' || value.trim() !== '') &&
  (!Array.isArray(value) || value.length > 0) &&
  (typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 0);
const union = (left = [], right = []) => [...new Map([...left, ...right].map(value => [JSON.stringify(value), value])).values()];
export function preserveBuyerFields(existing, incoming, reviewed = false) {
  const result = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (!supplied(value)) continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = preserveBuyerFields(result[key] && typeof result[key] === 'object' ? result[key] : {}, value, reviewed);
    } else if (reviewed || !supplied(result[key])) result[key] = value;
  }
  return result;
}
// Imports fill gaps, preserving existing contact/authorization facts. Conflicting source
// values remain in sourceRecords for an explicit later profile review.
export function mergeImportedBuyer(existing, incoming, reviewed = false) {
  const result = preserveBuyerFields(existing, incoming, reviewed);
  result.originalFields = existing.originalFields || incoming.originalFields;
  for (const key of ['sourceRecords', 'buyingMandates']) result[key] = union(existing[key], incoming[key]);
  result.importVersion = 2;
  result.doNotEmail = Boolean(existing.doNotEmail || incoming.doNotEmail);
  result.suppressed = Boolean(existing.suppressed || result.doNotEmail);
  // No incoming verification/consent claim can enable delivery.
  result.verificationStatus = (reviewed ? result.verificationStatus : existing.verificationStatus) || 'Unverified';
  result.status = (reviewed ? result.status : existing.status) || 'Inactive';
  result.consentStatus = existing.consentStatus === 'denied' ? 'denied' : ((reviewed ? result.consentStatus : existing.consentStatus) || 'unknown');
  result.blastEligible = (reviewed ? result.blastEligible : existing.blastEligible) === true && !result.suppressed && result.consentStatus !== 'denied';
  result.distributionEligible = (reviewed ? result.distributionEligible : existing.distributionEligible) === true && !result.suppressed && result.consentStatus !== 'denied';
  if (result.suppressed) result.status = 'Do Not Blast';
  return result;
}
