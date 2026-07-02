import {
  AUTH_ERROR_CODE,
  AuthenticationError,
  invalidParameterError,
} from "./errors.js";

interface OutputOptions {
  compact?: boolean;
  fields?: string[]; // raw dot-paths, e.g. ["identifier", "state.name"]
}

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
 * nested object shape and traversing arrays mid-path. Missing keys are skipped
 * silently; a path that stops at a subtree keeps that whole subtree.
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
    if (!(head in src)) continue;
    out[head] = tails.length > 0 ? pickFields(src[head], tails) : src[head];
  }
  return out;
}

export function outputSuccess(data: unknown): void {
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
