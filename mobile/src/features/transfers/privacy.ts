/** AppState-based best-effort cover, not an OS-level screenshot prevention guarantee. */
export function shouldCoverSensitiveContent(state: string): boolean {
  return state !== 'active';
}
