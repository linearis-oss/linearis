interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
}

interface RetryableError {
  response?: {
    status?: number;
  };
}

export function isRetryable(error: unknown): boolean {
  const err = error as RetryableError;
  const status = err?.response?.status;
  if (typeof status === "number") {
    return status === 429 || (status >= 500 && status < 600);
  }
  // network-level errors (ECONNRESET, ETIMEDOUT, etc.)
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("timed out") ||
      msg.includes("econnreset") ||
      msg.includes("network")
    );
  }
  return false;
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
