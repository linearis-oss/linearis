/**
 * Return the first element of `items`, or throw when the array is empty.
 *
 * Preferred over a non-null assertion (`items[0]!`) at call sites where the
 * array is expected to be non-empty: it keeps the narrowing explicit and yields
 * a meaningful error instead of a downstream `undefined` access under
 * `noUncheckedIndexedAccess`. Pass a string for an ad-hoc message, a ready-made
 * `Error` (e.g. `notFoundError(...)`) to preserve domain-specific messaging, or
 * a factory returning either — the factory form defers constructing the error
 * (and capturing its stack) to the empty path, avoiding wasted work on the
 * common non-empty case.
 */
export function firstOrThrow<T>(
  items: readonly T[],
  error: string | Error | (() => string | Error),
): T {
  if (items.length === 0) {
    const resolved = typeof error === "function" ? error() : error;
    throw typeof resolved === "string" ? new Error(resolved) : resolved;
  }
  return items[0] as T;
}
