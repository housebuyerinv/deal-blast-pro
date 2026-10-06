import plans from '../../supabase/functions/_shared/buyermatchPlans.json' with { type: 'json' };
export const commercialPlans = plans;
// Admin-only comparison: approved commercial limits do not grant entitlements.
export function simulatePlans(usage) {
  return Object.fromEntries(plans.map(plan => [plan.name.toLowerCase(), {
    hypothetical: true,
    maxDistributionFanout: plan.maxDistributionFanout,
    invitationCeiling: plan.distributionAllowance * plan.maxDistributionFanout,
    analysis: { allowance: plan.analysisAllowance, used: usage.analysis.used, remaining: Math.max(0,plan.analysisAllowance-usage.analysis.used) },
    softwareDistribution: { allowance: plan.distributionAllowance, used: usage.softwareDistribution.used, remaining: Math.max(0,plan.distributionAllowance-usage.softwareDistribution.used) },
  }]));
}
