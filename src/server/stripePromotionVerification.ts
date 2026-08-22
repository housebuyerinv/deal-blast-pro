export const stripeCouponRetrievalPath = (couponId: string) =>
  `coupons/${encodeURIComponent(couponId)}?expand[]=applies_to`

export const couponAppliesOnlyToProduct = (coupon: any, productId: string) => {
  const products = Array.isArray(coupon?.applies_to?.products)
    ? coupon.applies_to.products.map((value: unknown) => String(value || '').trim()).filter(Boolean)
    : []

  return products.length === 1 && products[0] === String(productId || '').trim()
}
