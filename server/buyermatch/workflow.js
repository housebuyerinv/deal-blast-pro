export function distributionReadiness(input) {
  const missing = [];
  for (const key of [
    "networkAgreementVersion",
    "feePolicyVersion",
    "dealCertificationAt",
    "contractObjectKey",
    "endOfContractDate",
    "titleCompany",
    "titleContactEmail",
  ])
    if (!input[key]) missing.push(key);
  if (!input.contractControlVerified) missing.push("contractControlVerified");
  if (!input.distributionConsent) missing.push("distributionConsent");
  if (!input.productEntitled) missing.push("productEntitled");
  if (!input.adminApproved) missing.push("adminApproved");
  if (!input.feePolicyApproved) missing.push("feePolicyApproved");
  if (
    !input.endOfContractDate ||
    !Number.isFinite(Date.parse(input.endOfContractDate)) ||
    Date.parse(input.endOfContractDate) < Date.now()
  )
    missing.push("validFutureEOC");
  return { ready: !missing.length, missing };
}
export function calculateFee(grossCents, policy) {
  if (!Number.isSafeInteger(grossCents) || grossCents < 0)
    throw new Error("Invalid compensation");
  if (!policy.approved || !policy.enabled)
    return { status: "disabled", amountCents: null };
  for (const key of [
    "minimumCents",
    "maximumCents",
    "fixedCents",
    "basisPoints",
  ])
    if (
      policy[key] !== undefined &&
      (!Number.isSafeInteger(policy[key]) || policy[key] < 0)
    )
      throw new Error(`Invalid ${key}`);
  if (policy.maximumCents < policy.minimumCents)
    throw new Error("Invalid fee limits");
  let fee;
  if (policy.mode === "fixed" && Number.isSafeInteger(policy.fixedCents))
    fee = policy.fixedCents;
  else if (
    policy.mode === "percentage" &&
    Number.isSafeInteger(policy.basisPoints) &&
    policy.basisPoints <= 10000
  )
    fee = Number(
      (BigInt(grossCents) * BigInt(policy.basisPoints) + 5000n) / 10000n,
    );
  else throw new Error("Invalid fee policy");
  if (Number.isSafeInteger(policy.minimumCents))
    fee = Math.max(fee, policy.minimumCents);
  if (Number.isSafeInteger(policy.maximumCents))
    fee = Math.min(fee, policy.maximumCents);
  return {
    status: "estimate",
    amountCents: fee,
    requiresSettlementVerification: true,
  };
}
export function closingAuthorizationStatus({
  buyerSelected,
  userSigned,
  titleAcknowledged,
  settlementVerified,
  paid,
}) {
  if (paid && settlementVerified) return "paid";
  if (settlementVerified && titleAcknowledged && userSigned)
    return "verified_due";
  if (titleAcknowledged && userSigned) return "title_acknowledged";
  if (userSigned) return "signed_awaiting_title";
  if (buyerSelected) return "awaiting_signature";
  return "not_triggered";
}
