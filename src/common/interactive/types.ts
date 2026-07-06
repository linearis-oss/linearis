import type { CommandContext } from "../context.js";

/** Field prompt kinds supported by the interactive engine. */
type PromptKind =
  | "text"
  | "multiline"
  | "select"
  | "multiselect"
  | "confirm"
  | "date";

/** A single selectable option shown in a select/multiselect prompt. */
export interface Choice {
  /** The human-facing string a user would type on the CLI (team key, project name, ...). */
  value: string;
  /** Display label shown in the picker. */
  label: string;
  /** Optional extra context shown alongside the label. */
  hint?: string;
}

/**
 * Injectable primitive options. These are modelled closely on
 * `@clack/prompts`' own option shapes so the {@link clackIO} adapter stays a
 * thin passthrough. Only the fields the engine actually drives are surfaced.
 */
export interface TextPromptOptions {
  message: string;
  placeholder?: string;
  initialValue?: string;
  defaultValue?: string;
  validate?: (value: string) => string | undefined;
}

/**
 * Options for the multi-line prompt. Modelled on clack's `MultiLineOptions`
 * (a superset of the text options) for entering multi-line markdown bodies.
 */
export interface MultiLinePromptOptions extends TextPromptOptions {
  /**
   * When true, a `[ submit ]` button is shown that can be focused with tab;
   * otherwise pressing Enter twice submits.
   */
  showSubmit?: boolean;
}

export interface SelectPromptOptions {
  message: string;
  options: Choice[];
  initialValue?: string;
}

export interface MultiSelectPromptOptions {
  message: string;
  options: Choice[];
  initialValues?: string[];
  required?: boolean;
}

export interface ConfirmPromptOptions {
  message: string;
  initialValue?: boolean;
}

/**
 * Options for the segmented date picker. Modelled on clack's `DateOptions`,
 * but deliberately minimal: only `message` and an optional seed value. No
 * min/max is exposed because the non-interactive CLI enforces no date range,
 * and the interactive path must stay semantically identical (see the engine's
 * `date` case).
 */
export interface DatePromptOptions {
  message: string;
  initialValue?: Date;
}

/**
 * Injectable IO primitives. Each returns either a resolved value or a cancel
 * `symbol` (mirroring clack's `symbol` cancellation contract). Tests supply a
 * scripted fake so CI never blocks on a TTY.
 */
export interface PromptIO {
  /**
   * Render an intro line above the first prompt. Optional so scripted test
   * fakes need not implement it.
   */
  intro?(message: string): void;
  text(options: TextPromptOptions): Promise<string | symbol>;
  multiline(options: MultiLinePromptOptions): Promise<string | symbol>;
  select(options: SelectPromptOptions): Promise<string | symbol>;
  /** Searchable single-select (combobox) — a select with a filter input. */
  autocomplete(options: SelectPromptOptions): Promise<string | symbol>;
  multiselect(options: MultiSelectPromptOptions): Promise<string[] | symbol>;
  /** Searchable multi-select (combobox) — a multiselect with a filter input. */
  autocompleteMultiselect(
    options: MultiSelectPromptOptions,
  ): Promise<string[] | symbol>;
  confirm(options: ConfirmPromptOptions): Promise<boolean | symbol>;
  /** Segmented date picker returning a `Date` (or a cancel `symbol`). */
  date(options: DatePromptOptions): Promise<Date | symbol>;
  isCancel(value: unknown): boolean;
}

/**
 * Declarative descriptor for one field the engine may prompt for. `O` is the
 * command's parsed-options interface, so `name` is constrained to real keys.
 */
export interface FieldPrompt<O> {
  /** Key on the options object this field fills. */
  name: keyof O & string;
  kind: PromptKind;
  /** Prompt message shown to the user. */
  message: string;
  /** Whether the field must be answered (drives multiselect `required`). */
  required?: boolean;
  /** Skip the field entirely when this returns false for the current draft. */
  when?(draft: Partial<O>): boolean;
  /** Lazily load select/multiselect options from a list service. */
  choices?(ctx: CommandContext, draft: Partial<O>): Promise<Choice[]>;
  /**
   * For `select`/`multiselect` fields, render a searchable combobox
   * (autocomplete) so large option lists can be filtered by typing. Ignored
   * for other kinds.
   */
  searchable?: boolean;
  /** Return an error string to reject the value, or undefined to accept. */
  validate?(value: string): string | undefined;
  /** Seed the initial value shown when the prompt first renders. */
  default?(draft: Partial<O>): string | undefined;
  /**
   * When true (the default), the field is skipped if the draft already has a
   * defined value — so an explicit flag wins over prompting.
   */
  skipIfProvided?: boolean;
}

/** A full prompt specification for a command's options interface. */
export interface PromptSpec<O> {
  fields: FieldPrompt<O>[];
  /** Optional intro line rendered above the first prompt. */
  intro?: string;
}
