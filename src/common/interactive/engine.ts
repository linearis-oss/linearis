import type { CommandContext } from "../context.js";
import { InteractiveCancelledError } from "../errors.js";
import { clackIO } from "./clack-io.js";
import { type InteractiveRootOptions, shouldPrompt } from "./gating.js";
import type { FieldPrompt, PromptIO, PromptSpec } from "./types.js";

/**
 * Walk a {@link PromptSpec} and collect answers for every field that still
 * needs one, merging them onto a copy of `provided`.
 *
 * Behavior:
 *  - fields are processed in declared order;
 *  - a field is skipped when `when(draft) === false`;
 *  - a field is skipped when `skipIfProvided !== false` and the draft already
 *    has a defined value for it (so an explicit flag wins);
 *  - `choices(ctx, draft)` is invoked lazily, only when the field is reached,
 *    so cross-field ordering deps (team before cycle) hold;
 *  - the prompt's initial value is seeded from `default(draft)`;
 *  - an empty answer (a blank text prompt, or an empty-valued "none" choice) is
 *    treated as "leave unset" and not written to the draft, so update builders
 *    that test `!== undefined` do not clear the existing value;
 *  - on cancellation (`io.isCancel`) an {@link InteractiveCancelledError} is
 *    thrown.
 */
export async function collectInteractive<O extends Record<string, unknown>>(
  ctx: CommandContext,
  spec: PromptSpec<O>,
  provided: O,
  io: PromptIO = clackIO,
): Promise<O> {
  const draft: Record<string, unknown> = { ...provided };
  let introRendered = false;

  for (const field of spec.fields) {
    const partial = draft as Partial<O>;

    if (field.when && !field.when(partial)) continue;

    const skipIfProvided = field.skipIfProvided !== false;
    if (skipIfProvided && draft[field.name] !== undefined) continue;

    // Render the intro lazily, exactly once, immediately before the first field
    // that actually prompts — never when every field is skipped/provided (and
    // not for a select/multiselect whose choices resolve empty, which
    // promptField treats as an empty submission rather than a real prompt).
    const renderIntro = (): void => {
      if (!introRendered && spec.intro !== undefined) {
        io.intro?.(spec.intro);
        introRendered = true;
      }
    };

    const initial = field.default?.(partial);
    const answer = await promptField(
      ctx,
      field,
      partial,
      io,
      initial,
      renderIntro,
    );

    if (io.isCancel(answer)) {
      throw new InteractiveCancelledError();
    }

    // An empty submission means "leave unset": a blank text prompt (clack
    // returns "") or an explicit empty-valued "none" choice. Writing "" would
    // make update builders that test `!== undefined` clear the existing value,
    // so skip it and let the draft keep its prior (usually undefined) value.
    if (answer === "") continue;

    draft[field.name] = answer;
  }

  return draft as O;
}

async function promptField<O>(
  ctx: CommandContext,
  field: FieldPrompt<O>,
  draft: Partial<O>,
  io: PromptIO,
  initial: string | undefined,
  onPrompt: () => void,
): Promise<string | string[] | boolean | symbol> {
  switch (field.kind) {
    case "text":
      onPrompt();
      return io.text({
        message: field.message,
        ...(initial !== undefined ? { initialValue: initial } : {}),
        ...(field.validate !== undefined ? { validate: field.validate } : {}),
      });
    case "multiline":
      onPrompt();
      return io.multiline({
        message: field.message,
        // Enter inserts a newline; a visible, Tab-focusable [ submit ] button
        // makes confirming discoverable (Enter on a blank line also submits).
        showSubmit: true,
        ...(initial !== undefined ? { initialValue: initial } : {}),
        ...(field.validate !== undefined ? { validate: field.validate } : {}),
      });
    case "select": {
      const options = (await field.choices?.(ctx, draft)) ?? [];
      // Nothing to choose from (e.g. team has estimates disabled, or no
      // current/future cycles): treat as an empty submission so the field is
      // left unset instead of rendering an unusable empty picker.
      if (options.length === 0) return "";
      onPrompt();
      const args = {
        message: field.message,
        options,
        ...(initial !== undefined ? { initialValue: initial } : {}),
      };
      return field.searchable ? io.autocomplete(args) : io.select(args);
    }
    case "multiselect": {
      const options = (await field.choices?.(ctx, draft)) ?? [];
      if (options.length === 0) return "";
      onPrompt();
      const args = {
        message: field.message,
        options,
        ...(field.required !== undefined ? { required: field.required } : {}),
        ...(initial !== undefined ? { initialValues: [initial] } : {}),
      };
      return field.searchable
        ? io.autocompleteMultiselect(args)
        : io.multiselect(args);
    }
    case "confirm":
      onPrompt();
      return io.confirm({
        message: field.message,
        ...(initial !== undefined ? { initialValue: initial === "true" } : {}),
      });
    case "date": {
      // No min/max is passed to the picker: the non-interactive CLI enforces no
      // date range (it allows backdated due dates and does not require
      // targetDate >= startDate), so constraining the interactive path would
      // reject inputs the CLI otherwise accepts. This is a pure input-ergonomics
      // swap — semantics stay identical.
      onPrompt();

      // A segmented date picker cannot produce an empty value (its only escape
      // is Esc = cancel). For optional fields we gate the picker behind a
      // confirm so "leave unset / leave unchanged" (return "") stays reachable.
      if (field.required !== true) {
        const proceed = await io.confirm({
          message: `Set a ${field.message.toLowerCase()}?`,
          initialValue: false,
        });
        if (io.isCancel(proceed)) return proceed;
        if (!proceed) return "";
      }

      const seed =
        initial !== undefined ? parseDatePromptInitial(initial) : undefined;
      const answer = await io.date({
        message: field.message,
        ...(seed !== undefined ? { initialValue: seed } : {}),
      });
      if (io.isCancel(answer)) return answer as symbol;
      return formatLocalDate(answer as Date);
    }
  }
}

/**
 * Parse a `YYYY-MM-DD` seed string into a local `Date` for the picker's initial
 * value. Returns undefined when the string is not a parseable date so the
 * picker simply opens on today.
 */
function parseDatePromptInitial(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined;
  }
  return date;
}

/**
 * Format a `Date` as a local `YYYY-MM-DD` string. Uses local getters (not
 * `toISOString`, which is UTC) so the day never shifts across timezones.
 */
function formatLocalDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Descriptor for a positional argument that can be filled by an entity picker
 * when it is absent and gating passes. {@link maybeCollectInteractive} invokes
 * `picker(ctx, io)` when `value` is undefined and gating allows a prompt.
 */
interface PositionalPicker<T> {
  /** Positional argument name (for messaging). */
  name: string;
  /** The current value parsed from the CLI (undefined when absent). */
  value: T | undefined;
  /**
   * Resolve a value interactively. Must respect the same cancellation contract
   * as the field engine (throw {@link InteractiveCancelledError} on cancel).
   */
  picker(ctx: CommandContext, io: PromptIO): Promise<T>;
}

/** Result of {@link maybeCollectInteractive}: filled options + positional. */
export interface MaybeCollectResult<O, T> {
  options: O;
  positional: T | undefined;
}

export interface MaybeCollectArgs<O extends Record<string, unknown>, T> {
  spec: PromptSpec<O>;
  options: O;
  /** True when a required input is missing (drives auto-launch gating). */
  missingRequired: boolean;
  /** Optional positional picker descriptor. */
  positional?: PositionalPicker<T>;
  io?: PromptIO;
}

/**
 * Call-site helper. Runs {@link shouldPrompt}; when it returns false the inputs
 * are returned untouched (zero change for agents/pipes). When true it runs the
 * options wizard and, if a positional picker was supplied and its value is
 * absent, the picker.
 */
export async function maybeCollectInteractive<
  O extends Record<string, unknown>,
  T,
>(
  ctx: CommandContext,
  rootOpts: InteractiveRootOptions,
  args: MaybeCollectArgs<O, T>,
): Promise<MaybeCollectResult<O, T>> {
  const io = args.io ?? clackIO;

  if (!shouldPrompt(rootOpts, { missingRequired: args.missingRequired })) {
    return {
      options: args.options,
      positional: args.positional?.value,
    };
  }

  const filledOptions = await collectInteractive(
    ctx,
    args.spec,
    args.options,
    io,
  );

  let positional = args.positional?.value;
  if (args.positional && positional === undefined) {
    // Run the entity picker to fill an absent positional argument. Cancellation
    // inside the picker must throw InteractiveCancelledError (same contract as
    // the field engine) so it flows to outputError.
    positional = await args.positional.picker(ctx, io);
  }

  return { options: filledOptions, positional };
}
