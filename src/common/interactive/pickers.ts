import type { CommandContext } from "../context.js";
import { InteractiveCancelledError, invalidParameterError } from "../errors.js";
import type { Choice, PromptIO } from "./types.js";

/**
 * A single-select entity picker: prompts the user to choose one option and
 * returns the selected value.
 */
export type ChoicePicker = (
  ctx: CommandContext,
  io: PromptIO,
) => Promise<string>;

/**
 * Build a reusable flat single-select picker. Loads its options via `load`,
 * shows a `select` prompt with `message`, throws {@link InteractiveCancelledError}
 * on cancel, and returns the chosen value.
 *
 * Use for the truly identical flat pickers duplicated across the content
 * domains (the issue picker, the emoji picker). Cross-field pickers that first
 * select a parent (comment/thread, attachment, milestone, cycle) are NOT built
 * with this factory.
 *
 * Throws a clean {@link invalidParameterError} when `load` yields no options,
 * since clack's `select` crashes on an empty option list.
 */
export function makeChoicePicker(
  message: string,
  load: (ctx: CommandContext) => Promise<Choice[]>,
): ChoicePicker {
  return async (ctx, io) => {
    const options = await load(ctx);
    if (options.length === 0) {
      throw invalidParameterError(
        message.toLowerCase(),
        "none are available to choose from",
      );
    }
    const answer = await io.select({ message, options });
    if (io.isCancel(answer)) {
      throw new InteractiveCancelledError();
    }
    return answer as string;
  };
}
