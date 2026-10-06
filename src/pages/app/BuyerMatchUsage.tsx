type Data = Record<string, any>;
export function UsageCards({ usage }: { usage?: Data }) {
  return <section className="grid sm:grid-cols-3 gap-4" aria-label="Billing period usage">
    {Object.entries({analysis:'BuyerMatch Analysis',softwareDistribution:'Software Distribution',managedDispo:'Managed Dispo / Network'}).map(([key,label]) => {
      const counter=usage?.[key];
      return <article key={key} className="border border-slate-700 rounded-xl p-5">
        <h2 className="text-xl">{label}</h2>
        <p>{counter?.active ? `${counter.used} of ${counter.allowance} used · ${counter.remaining} remaining` : 'Not activated'}</p>
        {counter?.periodEnd && <p className="text-sm text-slate-400">Period ends {new Date(counter.periodEnd).toLocaleDateString()}{!counter.active && ` · ${counter.used} recorded in that period`}</p>}
      </article>;
    })}
  </section>;
}

export function AdminUsage({ metrics }: { metrics?: Data }) {
  if (!metrics) return null;
  return <section className="border border-slate-700 rounded-xl p-5 space-y-4" aria-label="Owner-only operating metrics">
    <h2 className="text-xl">Usage & buyer invitation fanout</h2>
    <p className="text-sm text-slate-400">{metrics.scope}. Metrics do not activate a plan. Synthetic staging data is not a forecast of real buyer volume.</p>
    <dl className="grid sm:grid-cols-3 gap-3">
      {Object.entries({softwareDistributions:'Software distributions',managedDispoDistributions:'Managed Dispo distributions',unclassifiedDistributions:'Unclassified legacy requests',exposures:'All buyer exposures',softwareExposures:'Software buyer exposures',acceptedInvitations:'Accepted invitations',deliveredInvitations:'Delivered invitations',uniqueAttemptedExposures:'Unique attempted exposures',claimedAttempts:'Claimed attempts',retryAttempts:'Retry attempts',buyerInterests:'Interests',buyerOffers:'Offers',buyerMessages:'Buyer messages',passes:'Passes',suppressedOrUnsubscribedBuyers:'Suppressed / unsubscribed buyers'}).map(([key,label]) => <div key={key}><dt className="text-sm text-slate-400">{label}</dt><dd>{metrics[key]}</dd></div>)}
    </dl>
    <p>Software fanout — average {metrics.softwareFanout?.average == null ? 'N/A' : Number(metrics.softwareFanout.average).toFixed(2)}, median {metrics.softwareFanout?.median ?? 'N/A'}, minimum {metrics.softwareFanout?.minimum ?? 'N/A'}, maximum {metrics.softwareFanout?.maximum ?? 'N/A'}.</p>
    <p className="text-sm">Historical deduplicated / rejected attempt total: unavailable. {metrics.attemptNote}</p>
    <p className="text-sm">{metrics.providerCost}</p>
    <h3>Hypothetical plans — not purchased or activated</h3>
    {metrics.accounts?.map((account: Data) => <details key={account.ownerId} className="border-t border-slate-700 pt-3">
      <summary>Account {account.ownerId}</summary>
      <p>Software exposures in current subscription period: {account.softwareExposures}; average per distribution: {account.usage.softwareDistribution.used ? (account.softwareExposures/account.usage.softwareDistribution.used).toFixed(2) : 'N/A'}.</p>
      {Object.entries(account.hypothetical as Record<string, Data>).map(([name,plan]) => <p key={name}>{name === 'starter' ? 'Starter candidate' : 'Pro candidate'}: analyses {plan.analysis.used}/{plan.analysis.allowance} ({plan.analysis.remaining} remaining); software distributions {plan.softwareDistribution.used}/{plan.softwareDistribution.allowance} ({plan.softwareDistribution.remaining} remaining).</p>)}
    </details>)}
  </section>;
}
