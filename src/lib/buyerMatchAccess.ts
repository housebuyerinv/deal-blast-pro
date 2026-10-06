export type BuyerMatchEntitlement = {
  product: string;
  status: string;
  period_start: string;
  period_end: string;
};

// Allowances govern actions separately; zero remaining does not hide existing work.
export function hasBuyerMatchAccess(entitlements: BuyerMatchEntitlement[], now = Date.now()) {
  return entitlements.some((item) => item.product === 'buyermatch' &&
    item.status === 'active' && Date.parse(item.period_start) <= now &&
    Date.parse(item.period_end) > now);
}

export function isBuyerMatchRoute(path: string) {
  return path === '/app/buyermatch' || path.startsWith('/app/buyermatch/');
}

export function isBuyerMatchAccountRoute(path: string) {
  return isBuyerMatchRoute(path) || path === '/app/settings';
}
