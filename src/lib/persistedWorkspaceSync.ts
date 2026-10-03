// A second tab starts with no authenticated workspace. Its initialization must
// not reset an already signed-in tab or cause identical writes to bounce forever.
export function shouldApplyWorkspaceSync<T extends object>(
  current: T,
  next: Partial<T>,
  scopeMatches: boolean,
) {
  return (
    scopeMatches &&
    (Object.keys(next) as (keyof T)[]).some(
      (key) => JSON.stringify(current[key]) !== JSON.stringify(next[key]),
    )
  );
}
