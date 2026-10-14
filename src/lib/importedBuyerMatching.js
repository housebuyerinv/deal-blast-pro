// Imported mandates stay separate: never combine one mandate's geography with
// another mandate's price. This returns fit information, never delivery consent.
export function importedMandateFit(deal, buyer) {
  if (buyer.importVersion !== 2) return null;
  if (buyer.doNotEmail || buyer.suppressed || buyer.blastEligible !== true || buyer.consentStatus !== 'granted' ||
      /inactive|do not|suppressed/i.test(buyer.status || '') ||
      !['Verified Buyer', 'VIP Buyer'].includes(buyer.verificationStatus)) {
    return { score: 0, reasons: ['Imported contact requires verification and consent review'], missing: ['Verification / outreach permission'] };
  }
  const equal = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
  const property = deal.property || {}, pricing = deal.pricing || {};
  const price = pricing.askingPrice || pricing.contractPrice;
  const results = (buyer.buyingMandates || []).map(mandate => {
    const missing = [];
    if (mandate.requiresReview) missing.push('Mandate review');
    if (!mandate.markets?.length) missing.push('Market');
    else if (!mandate.markets.some(m => equal(m.state, property.state) && (!m.city || equal(m.city, property.city)) && (!m.zips?.length || m.zips.includes(property.zip)))) missing.push('Market mismatch');
    if (!mandate.assetTypes?.length) missing.push('Property type');
    else if (!mandate.assetTypes.some(asset => equal(asset, property.type))) missing.push('Property type mismatch');
    const criteria = mandate.purchaseCriteria || {};
    if (!price) missing.push('Deal price');
    if (mandate.purchaseMin && price < mandate.purchaseMin) missing.push('Below purchase minimum');
    if (mandate.purchaseMax && price > mandate.purchaseMax) missing.push('Above purchase maximum');
    if (criteria.allInMax) {
      if (pricing.rehab == null) missing.push('Repairs for all-in budget');
      else if (price + pricing.rehab > criteria.allInMax) missing.push('Above all-in budget');
    }
    if (criteria.formula) {
      const formula = criteria.formula;
      if (!pricing.arv || (formula.subtractRepairs && pricing.rehab == null)) missing.push('ARV / repairs for formula');
      else if (price > pricing.arv * formula.maxArvRatio - (formula.subtractRepairs ? pricing.rehab : 0)) missing.push('Above ARV formula');
    }
    if (!mandate.purchaseMin && !mandate.purchaseMax && !criteria.allInMax && !criteria.formula) missing.push('Purchase criteria');
    return { score: missing.length ? 0 : 100, reasons: missing.length ? ['Mandate requires review or does not fit'] : ['Complete individual buying mandate fits'], missing };
  });
  return results.find(result => result.score === 100) || results[0] || { score: 0, reasons: ['No reviewed mandate'], missing: ['Buying mandate'] };
}
