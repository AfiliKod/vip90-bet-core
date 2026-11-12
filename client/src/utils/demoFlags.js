// client/src/utils/demoFlags.js
//
// Demo feature flags as seen by the admin client (GET /admin/demo-flags).
// Nav items may carry `demoFlags: [...]`; such an item is visible only when at
// least one of its listed flags is on. The server is the real guard (disabled
// demo routes answer 404); hiding entries here is a visual convenience.

export const NO_DEMO_FLAGS = Object.freeze({
  bots: false,
  fakeWinners: false,
  instantDeposit: false,
  data: false,
});

export function isNavItemVisible(item, flags) {
  const required = item?.demoFlags;
  if (!Array.isArray(required) || required.length === 0) return true;
  const effective = flags || NO_DEMO_FLAGS;
  return required.some((key) => effective[key] === true);
}

export function filterNavByDemoFlags(groups, flags) {
  return (groups || [])
    .map((group) => ({ ...group, items: (group.items || []).filter((item) => isNavItemVisible(item, flags)) }))
    .filter((group) => group.items.length > 0);
}
