const LIMIT = 5;
const WINDOW_MS = 15 * 60 * 1_000;
const attemptsByClient = new Map<string, number[]>();

/**
 * A lightweight, process-local safeguard. Client identifiers are used only
 * in memory and are never written to the feedback database.
 */
export function canSubmitFeedback(clientId: string) {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const recentAttempts = (attemptsByClient.get(clientId) ?? []).filter(
    (attemptedAt) => attemptedAt > cutoff,
  );

  if (recentAttempts.length >= LIMIT) {
    attemptsByClient.set(clientId, recentAttempts);
    return false;
  }

  recentAttempts.push(now);
  attemptsByClient.set(clientId, recentAttempts);
  return true;
}
