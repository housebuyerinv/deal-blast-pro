export function canShowSamplePropertyIntelligence(input: {
  isOwnerAdmin: boolean
  ownerPreviewActive: boolean
  explicitDemo?: boolean
}) {
  return Boolean(input.explicitDemo || (input.isOwnerAdmin && input.ownerPreviewActive))
}

export function getBillingControlPolicy(input: {
  plan: string
  billingStatus: string
  ownerPreviewActive: boolean
  cancelAtPeriodEnd: boolean
}) {
  const plan = String(input.plan || 'Free')
  const paidStatus = ['Paid Active', 'Past Due', 'Payment Pending', 'Comped'].includes(String(input.billingStatus || ''))
  const hasPaidSubscription = plan !== 'Free' && paidStatus

  return {
    showUpgrade: input.ownerPreviewActive || !hasPaidSubscription || ['Free', 'Starter'].includes(plan),
    showManage: input.ownerPreviewActive || hasPaidSubscription,
    showChange: input.ownerPreviewActive || hasPaidSubscription,
    showDowngrade: input.ownerPreviewActive || hasPaidSubscription,
    showCancel: (input.ownerPreviewActive || hasPaidSubscription) && !input.cancelAtPeriodEnd,
    showUndoCancellation: (input.ownerPreviewActive || hasPaidSubscription) && input.cancelAtPeriodEnd,
    simulated: input.ownerPreviewActive,
  }
}
