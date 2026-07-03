/**
 * JSON value types encoding Linearis' "JSON-only output" contract at the type
 * level. Anything reaching {@link ./output.outputSuccess} must serialize to
 * JSON without data loss or a runtime error.
 */

/** A JSON scalar: the leaves of any JSON document. */
type JsonPrimitive = string | number | boolean | null;

/**
 * A value that serializes to JSON losslessly — no functions, `undefined`,
 * symbols, `bigint`, or class instances with behaviour. This is the strict
 * contract the output boundary ultimately targets. It is not consumed directly
 * yet: functions and other non-JSON values vacuously satisfy its index
 * signature, so {@link JsonSerializable} does the real enforcement. Kept as the
 * documented target for issue #202's path to strict compile-time enforcement.
 *
 * @public exported as the project-level JSON contract type; not consumed
 * internally yet (see above), so it is tagged to document intent.
 */
export type JsonValue =
  | JsonPrimitive
  | { readonly [key: string]: JsonValue }
  | readonly JsonValue[];

/**
 * Transitional constraint for the output boundary. It is meaningfully stricter
 * than `unknown` — it rejects the values that break `JSON.stringify` or lose
 * data (functions, `symbol`, `bigint`) at every position — while tolerating the
 * shapes today's generated GraphQL result types legitimately produce:
 *
 *   - optional (`field?:`) properties that widen to `undefined` (dropped by
 *     `JSON.stringify`);
 *   - opaque `Record<string, unknown>` / `unknown` JSON blobs (e.g. attachment
 *     `metadata`) that TypeScript cannot prove are pure JSON but which the
 *     Linear API only ever populates with parsed JSON;
 *   - named `interface`/type shapes that lack an implicit index signature and so
 *     are not structurally assignable to {@link JsonValue}.
 *
 * Each object is validated member-by-member, so nominal result types are
 * accepted without per-call-site casts. See issue #202 for the path to
 * requiring {@link JsonValue} directly once the generated types are narrowed.
 */
export type JsonSerializable<T> = T extends (...args: never[]) => unknown
  ? never
  : T extends bigint | symbol
    ? never
    : T extends JsonPrimitive | undefined
      ? T
      : T extends readonly (infer U)[]
        ? readonly JsonSerializable<U>[]
        : T extends object
          ? { [K in keyof T]: JsonSerializable<T[K]> }
          : // `unknown`/`any` opaque values fall through, tolerated transitionally
            T;
