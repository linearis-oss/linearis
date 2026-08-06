import type { CommandOptions } from "./auth.js";
import type { UsageErrorPayload } from "./cli-errors.js";
import {
  AUTH_ERROR_CODE,
  AuthenticationError,
  invalidParameterError,
  USAGE_ERROR_CODE,
} from "./errors.js";
import type { JsonSerializable } from "./json.js";

// Derived from CommandOptions so the two can never drift; `fields` holds raw
// dot-paths, e.g. ["identifier", "state.name"].
type OutputOptions = Pick<CommandOptions, "compact" | "fields">;

let currentOutputOptions: OutputOptions = {};

/**
 * Set once per process by the preAction hook in main.ts. Also used to reset
 * state between unit tests.
 */
export function setOutputOptions(opts: OutputOptions): void {
  currentOutputOptions = opts;
}

/** Commander option parser for `--fields`: "a, b ,, c" -> ["a","b","c"]. */
export function parseFieldsList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Recursively project `value` down to the given dot-path segments, preserving
 * nested object shape and traversing arrays mid-path. Only own properties are
 * matched (inherited members like `toString`/`constructor` are never picked),
 * and results are written with `Object.defineProperty` so a user-supplied
 * `--fields __proto__` cannot invoke the prototype setter. Missing keys are
 * skipped silently; a path that stops at a subtree keeps that whole subtree.
 */
export function pickFields(value: unknown, paths: string[][]): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => pickFields(item, paths));
  }
  if (value === null || typeof value !== "object") {
    return value; // path descends past a scalar; nothing to pick
  }
  const src = value as Record<string, unknown>;
  const byHead = new Map<string, string[][]>();
  for (const [head, ...tail] of paths) {
    if (head === undefined) continue;
    const tails = byHead.get(head) ?? [];
    if (tail.length > 0) tails.push(tail);
    byHead.set(head, tails);
  }
  const out: Record<string, unknown> = {};
  for (const [head, tails] of byHead) {
    if (!Object.hasOwn(src, head)) continue;
    const picked = tails.length > 0 ? pickFields(src[head], tails) : src[head];
    Object.defineProperty(out, head, {
      value: picked,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return out;
}

export function outputSuccess<T>(data: JsonSerializable<T>): void {
  const { compact, fields } = currentOutputOptions;
  const shaped =
    fields && fields.length > 0
      ? pickFields(
          data,
          fields.map((p) => p.split(".")),
        )
      : data;
  console.log(JSON.stringify(shaped, null, compact ? undefined : 2));
}

export function outputError(error: Error): void {
  console.error(JSON.stringify({ error: error.message }, null, 2));
  process.exit(1);
}

export function outputAuthError(error: AuthenticationError): void {
  console.error(
    JSON.stringify(
      {
        error: "AUTHENTICATION_REQUIRED",
        message: error.message,
        details: error.details,
        action: "USER_ACTION_REQUIRED",
        instruction:
          "Run 'linearis auth' to set up or refresh your authentication token.",
        exit_code: AUTH_ERROR_CODE,
      },
      null,
      2,
    ),
  );
  process.exit(AUTH_ERROR_CODE);
}

/**
 * Emit a malformed-invocation envelope. Classification lives in
 * `cli-errors.ts`; this layer only writes and exits.
 */
export function outputUsageError(payload: UsageErrorPayload): void {
  console.error(JSON.stringify(payload, null, 2));
  process.exit(USAGE_ERROR_CODE);
}

export function parseLimit(value: string): number {
  const limit = parseInt(value, 10);
  if (Number.isNaN(limit) || limit < 1) {
    throw invalidParameterError("--limit", "must be a positive integer");
  }
  return limit;
}

export function handleCommand(
  asyncFn: (...args: unknown[]) => Promise<void>,
): (...args: unknown[]) => Promise<void> {
  return async (...args: unknown[]) => {
    try {
      await asyncFn(...args);
    } catch (error) {
      if (error instanceof AuthenticationError) {
        outputAuthError(error);
        return;
      }
      outputError(error instanceof Error ? error : new Error(String(error)));
    }
  };
}

/**
 * Typed wrapper around {@link handleCommand} for Commander action handlers.
 *
 * Commander invokes an action with the positional arguments first, followed by
 * the parsed options object and the `Command` instance. That boundary is
 * inherently `unknown[]`, so command bodies used to open with a hand-written
 * tuple cast (`const [issue, options, command] = args as [...]`). Those casts
 * are invisible to the compiler: if a command signature changes, TypeScript
 * cannot flag the now-wrong destructuring.
 *
 * `commandAction` centralizes the cast in one place. Declare the expected
 * argument tuple once via the generic parameter and the handler receives fully
 * typed arguments, while `handleCommand` remains the single error wrapper.
 *
 * @example
 * .action(
 *   commandAction<[string, ReadOptions, Command]>(
 *     async (issue, options, command) => {
 *       const ctx = createContext(getRootOpts(command));
 *       // ...
 *     },
 *   ),
 * )
 */
export function commandAction<TArgs extends readonly unknown[]>(
  fn: (...args: TArgs) => Promise<void>,
): (...args: unknown[]) => Promise<void> {
  return handleCommand(async (...args: unknown[]) => {
    await fn(...(args as unknown as TArgs));
  });
}
