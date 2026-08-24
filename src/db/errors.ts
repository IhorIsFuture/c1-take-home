export function isDeadlockError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'parent' in error &&
    typeof error.parent === 'object' &&
    error.parent !== null &&
    'code' in error.parent &&
    error.parent.code === 'ER_LOCK_DEADLOCK'
  );
}
