import { expect } from "vitest";

/**
 * Await a call expected to reject and hand back the thrown error, so a test can
 * assert on several parts of one message without invoking the call once per
 * assertion.
 *
 * `promise.catch((caught) => caught as Error)` looks equivalent but widens the
 * result to `Error | T` — the resolved type survives — which then fails the
 * test type check on `error.message`. Rejecting explicitly when the promise
 * fulfils keeps the return type honest at `Error` and turns a call that
 * silently stopped throwing into a failure rather than a passing test.
 */
export async function captureRejection(
  promise: Promise<unknown>,
): Promise<Error> {
  return promise.then(
    () => expect.unreachable("expected the call to reject, but it resolved"),
    (caught: Error) => caught,
  );
}
