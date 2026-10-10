/** Q-026 opt-in classification of pg-pool pending-queue timeout. */
export function foiTimeoutNaFilaDoPoolPg(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.message !== "timeout exceeded when trying to connect") return false;
  return (error as Error & { code?: unknown }).code === undefined;
}
