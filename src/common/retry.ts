interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
}

interface RetryableError {
  response?: {
    status?: number;
  };
}

/**
 * Collect the lowercased messages of an error and its `cause` chain. Native
 * `fetch` (undici) rejects transport failures as `TypeError: fetch failed` and
 * carries the real error (e.g. `ECONNRESET`) on `cause`, so the top-level
 * message alone is not enough to classify the failure.
 */
function collectErrorMessages(error: unknown): string {
  const messages: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    messages.push(current.message);
    current = current.cause;
  }
  return messages.join(" ").toLowerCase();
}

export function isRetryable(error: unknown): boolean {
  const err = error as RetryableError;
  const status = err?.response?.status;
  if (typeof status === "number") {
    return status === 429 || (status >= 500 && status < 600);
  }
  // network-level errors (ECONNRESET, ETIMEDOUT, etc.). `fetch failed` is
  // undici's generic wrapper for transport failures with no HTTP status.
  const msg = collectErrorMessages(error);
  return (
    msg.includes("timed out") ||
    msg.includes("etimedout") ||
    msg.includes("econnreset") ||
    msg.includes("network") ||
    msg.includes("fetch failed")
  );
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 500 } = options ?? {};
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries || !isRetryable(error)) throw error;
      const delay = baseDelayMs * 2 ** attempt;
      await new Promise<void>((r) => setTimeout(r, delay));
    }
  }
  // unreachable, but TypeScript needs it
  throw new Error("withRetry: exhausted attempts");
}
