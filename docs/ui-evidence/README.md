# Actual local browser evidence

October 26, 2026. All captures are of the credential-free local application or its
explicitly synthetic demo, not Production and not a paid subscription test.

- `mobile-route-checks.json`: 12 actual browser heading/width checks at 390px.
- `desktop-route-checks.json`: nine actual browser heading/width checks at 1280px.
- `buyermatch-overview-mobile.png`, `buyermatch-pricing-mobile.png`,
  `buyermatch-workspace-mobile.png`: actual captures during implementation. The
  final code additionally tightens the pricing header, replaces cramped mobile
  branding with its accessible logo, and lays demo navigation out in two columns.
- The three `*-desktop.png` files retain actual early desktop capture evidence;
  the capture surface clipped their right edges. They are not full-width desktop
  acceptance screenshots. Later screenshot attempts became unavailable even though
  browser DOM interaction and responsive checks continued successfully.

No image was fabricated or replaced by a generated mockup. Final route geometry and
component behavior were verified after the refinements. The separate tiny buyer
capture is not committed as evidence because its stale scaled composition does not
verify the intended mobile buyer view. It remains preserved locally.

For the current interface, use the local `/buyermatch` and `/buyermatch/demo` routes.
For exact code/tests, see local implementation commit
`de54725586bfa592d364131572eea2692a32e6d3` and `../BUYERMATCH_PRODUCT_BUILD.md`.
