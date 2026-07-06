import type { CommandOptions } from "../auth.js";

/** Root options that influence whether interactive prompts may fire. */
export type InteractiveRootOptions = Pick<
  CommandOptions,
  "interactive" | "compact" | "fields"
>;

/**
 * Decide whether the interactive engine may prompt. Hard-gated so agents and
 * pipes never trigger a prompt.
 *
 * Returns true only when ALL of the following hold:
 *  - both stdin and stdout are TTYs;
 *  - `--no-interactive` was not passed (`rootOpts.interactive !== false`);
 *  - neither `CI` nor `LINEARIS_NO_INTERACTIVE` is set in the environment;
 *  - `--compact` was not passed;
 *  - `--fields` is empty/undefined;
 * AND either `-i` was explicit (`rootOpts.interactive === true`) or a required
 * argument is missing (`opts.missingRequired === true`).
 */
export function shouldPrompt(
  rootOpts: InteractiveRootOptions,
  opts: { missingRequired: boolean },
): boolean {
  if (process.stdin.isTTY !== true) return false;
  if (process.stdout.isTTY !== true) return false;
  if (rootOpts.interactive === false) return false;
  if (process.env["CI"]) return false;
  if (process.env["LINEARIS_NO_INTERACTIVE"]) return false;
  if (rootOpts.compact) return false;
  if (rootOpts.fields && rootOpts.fields.length > 0) return false;

  return rootOpts.interactive === true || opts.missingRequired === true;
}
