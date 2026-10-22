// This selects UI navigation only. Access always comes from server entitlements.
export function subscriberDestination(search: string, serverDestination = '/app/dashboard') {
  const params = new URLSearchParams(search)
  if (params.get('product') === 'buyermatch') {
    const tier = params.get('tier') === 'pro' ? 'pro' : 'starter'
    return `/app/buyermatch/plans?tier=${tier}`
  }
  return /^\/app\/buyermatch\/plans\?tier=(starter|pro)$/.test(serverDestination) ? serverDestination : '/app/dashboard'
}
