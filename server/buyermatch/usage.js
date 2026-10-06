// Admin-only display model: never persists allowances or grants entitlements.
export function simulatePlans(usage) {
  return Object.fromEntries([['starter',20],['pro',50]].map(([name,allowance]) => [name, {
    hypothetical: true,
    analysis: { allowance, used: usage.analysis.used, remaining: Math.max(0,allowance-usage.analysis.used) },
    softwareDistribution: { allowance, used: usage.softwareDistribution.used, remaining: Math.max(0,allowance-usage.softwareDistribution.used) },
  }]));
}
