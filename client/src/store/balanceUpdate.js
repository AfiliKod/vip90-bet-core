// Applies a balance:update payload (or a /users/me answer) to the auth user.
// `balance` replaces the platform balance when it is a number.
// `activeIgamesBalance` (F3): a number sets the casino balance shown beside
// it; null clears it (the igames session was closed and credited); absent
// leaves it as is.
export function applyBalanceUpdate(user, { balance, activeIgamesBalance } = {}) {
  if (!user) return user;
  const next = { ...user };
  let changed = false;
  if (typeof balance === 'number') { next.balance = balance; changed = true; }
  if (typeof activeIgamesBalance === 'number') { next.activeIgamesBalance = activeIgamesBalance; changed = true; }
  else if (activeIgamesBalance === null) { delete next.activeIgamesBalance; changed = true; }
  return changed ? next : user;
}
