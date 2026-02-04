/**
 * Outputs successful command result as formatted JSON.
 */
export function outputSuccess(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

/**
 * Outputs error as JSON and exits with status code 1.
 */
export function outputError(error: Error): void {
  console.error(JSON.stringify({ error: error.message }, null, 2));
  process.exit(1);
}

/**
 * Wraps command handler with error handling.
 *
 * Catches errors from async command handlers and outputs them
 * as formatted JSON before exiting. Use this wrapper for all
 * Commander.js `.action()` handlers.
 */
export function handleCommand(
  asyncFn: (...args: unknown[]) => Promise<void>,
): (...args: unknown[]) => Promise<void> {
  return async (...args: unknown[]) => {
    try {
      await asyncFn(...args);
    } catch (error) {
      outputError(error instanceof Error ? error : new Error(String(error)));
    }
  };
}
