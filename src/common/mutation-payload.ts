/**
 * Assert a Linear mutation payload succeeded and return its entity field.
 *
 * The entity field name varies per mutation (`issue`, `project`, `entity`,
 * `comment`, …), so the caller supplies the key. Typing stays exact via
 * `keyof` + `NonNullable`, so no `any` is needed and the returned value is
 * narrowed to the non-null entity type.
 */
export function requireMutationEntity<
  P extends { success: boolean },
  K extends keyof P,
>(payload: P, key: K, message: string): NonNullable<P[K]> {
  const entity = payload[key];
  if (!payload.success || entity == null) {
    throw new Error(message);
  }
  return entity as NonNullable<P[K]>;
}

/** Assert a mutation payload succeeded when there is no entity to return. */
export function requireMutationSuccess(
  payload: { success: boolean },
  message: string,
): void {
  if (!payload.success) {
    throw new Error(message);
  }
}
