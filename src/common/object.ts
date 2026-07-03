/**
 * Return a shallow copy of `obj` with every `undefined`-valued key removed.
 *
 * The result type marks each key optional and strips `undefined` from its value
 * type, so the object satisfies interfaces declared under
 * `exactOptionalPropertyTypes` (where an explicit `key: undefined` is not
 * assignable to `key?: T`). Preferred over a wall of conditional spreads when
 * building filter/option objects whose fields are all individually optional.
 */
export function omitUndefined<T extends object>(
  obj: T,
): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined),
  ) as { [K in keyof T]?: Exclude<T[K], undefined> };
}
