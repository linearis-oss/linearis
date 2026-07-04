import {
  autocomplete as clackAutocomplete,
  autocompleteMultiselect as clackAutocompleteMultiselect,
  confirm as clackConfirm,
  date as clackDate,
  isCancel as clackIsCancel,
  multiline as clackMultiline,
  multiselect as clackMultiselect,
  select as clackSelect,
  text as clackText,
} from "@clack/prompts";
import type {
  ConfirmPromptOptions,
  DatePromptOptions,
  MultiLinePromptOptions,
  MultiSelectPromptOptions,
  PromptIO,
  SelectPromptOptions,
  TextPromptOptions,
} from "./types.js";

/**
 * `@clack/prompts` adapter implementing {@link PromptIO}. Every primitive is
 * routed to `process.stderr` via `{ output: process.stderr }` so that stdout
 * stays reserved for the final JSON payload. This adapter never calls
 * console.log.
 */
export const clackIO: PromptIO = {
  intro(message: string): void {
    // Routed to stderr like every other primitive so stdout stays reserved for
    // the final JSON payload.
    process.stderr.write(`${message}\n`);
  },

  text(options: TextPromptOptions): Promise<string | symbol> {
    return clackText({
      message: options.message,
      output: process.stderr,
      ...(options.placeholder !== undefined
        ? { placeholder: options.placeholder }
        : {}),
      ...(options.initialValue !== undefined
        ? { initialValue: options.initialValue }
        : {}),
      ...(options.defaultValue !== undefined
        ? { defaultValue: options.defaultValue }
        : {}),
      ...(options.validate !== undefined
        ? {
            validate: (value: string | undefined) =>
              options.validate?.(value ?? ""),
          }
        : {}),
    });
  },

  multiline(options: MultiLinePromptOptions): Promise<string | symbol> {
    return clackMultiline({
      message: options.message,
      output: process.stderr,
      ...(options.placeholder !== undefined
        ? { placeholder: options.placeholder }
        : {}),
      ...(options.initialValue !== undefined
        ? { initialValue: options.initialValue }
        : {}),
      ...(options.defaultValue !== undefined
        ? { defaultValue: options.defaultValue }
        : {}),
      ...(options.showSubmit !== undefined
        ? { showSubmit: options.showSubmit }
        : {}),
      ...(options.validate !== undefined
        ? {
            validate: (value: string | undefined) =>
              options.validate?.(value ?? ""),
          }
        : {}),
    });
  },

  select(options: SelectPromptOptions): Promise<string | symbol> {
    return clackSelect<string>({
      message: options.message,
      output: process.stderr,
      options: options.options.map((choice) => ({
        value: choice.value,
        label: choice.label,
        ...(choice.hint !== undefined ? { hint: choice.hint } : {}),
      })),
      ...(options.initialValue !== undefined
        ? { initialValue: options.initialValue }
        : {}),
    });
  },

  autocomplete(options: SelectPromptOptions): Promise<string | symbol> {
    return clackAutocomplete<string>({
      message: options.message,
      output: process.stderr,
      placeholder: "Type to search…",
      options: options.options.map((choice) => ({
        value: choice.value,
        label: choice.label,
        ...(choice.hint !== undefined ? { hint: choice.hint } : {}),
      })),
      ...(options.initialValue !== undefined
        ? { initialValue: options.initialValue }
        : {}),
    });
  },

  multiselect(options: MultiSelectPromptOptions): Promise<string[] | symbol> {
    return clackMultiselect<string>({
      message: options.message,
      output: process.stderr,
      options: options.options.map((choice) => ({
        value: choice.value,
        label: choice.label,
        ...(choice.hint !== undefined ? { hint: choice.hint } : {}),
      })),
      ...(options.initialValues !== undefined
        ? { initialValues: options.initialValues }
        : {}),
      ...(options.required !== undefined ? { required: options.required } : {}),
    });
  },

  autocompleteMultiselect(
    options: MultiSelectPromptOptions,
  ): Promise<string[] | symbol> {
    return clackAutocompleteMultiselect<string>({
      message: options.message,
      output: process.stderr,
      placeholder: "Type to search…",
      options: options.options.map((choice) => ({
        value: choice.value,
        label: choice.label,
        ...(choice.hint !== undefined ? { hint: choice.hint } : {}),
      })),
      ...(options.initialValues !== undefined
        ? { initialValues: options.initialValues }
        : {}),
      ...(options.required !== undefined ? { required: options.required } : {}),
    });
  },

  confirm(options: ConfirmPromptOptions): Promise<boolean | symbol> {
    return clackConfirm({
      message: options.message,
      output: process.stderr,
      ...(options.initialValue !== undefined
        ? { initialValue: options.initialValue }
        : {}),
    });
  },

  date(options: DatePromptOptions): Promise<Date | symbol> {
    return clackDate({
      message: options.message,
      output: process.stderr,
      ...(options.initialValue !== undefined
        ? { initialValue: options.initialValue }
        : {}),
    });
  },

  isCancel(value: unknown): boolean {
    return clackIsCancel(value);
  },
};
