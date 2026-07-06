import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { shouldPrompt } from "../../../src/common/interactive/gating.js";

const origStdin = process.stdin.isTTY;
const origStdout = process.stdout.isTTY;
const origCI = process.env["CI"];
const origNoInteractive = process.env["LINEARIS_NO_INTERACTIVE"];

function setTTY(stdin: boolean, stdout: boolean): void {
  Object.defineProperty(process.stdin, "isTTY", {
    value: stdin,
    configurable: true,
  });
  Object.defineProperty(process.stdout, "isTTY", {
    value: stdout,
    configurable: true,
  });
}

beforeEach(() => {
  // Default: a clean interactive terminal with no suppress signals.
  setTTY(true, true);
  process.env["CI"] = "";
  process.env["LINEARIS_NO_INTERACTIVE"] = "";
});

afterEach(() => {
  Object.defineProperty(process.stdin, "isTTY", {
    value: origStdin,
    configurable: true,
  });
  Object.defineProperty(process.stdout, "isTTY", {
    value: origStdout,
    configurable: true,
  });
  if (origCI === undefined) delete process.env["CI"];
  else process.env["CI"] = origCI;
  if (origNoInteractive === undefined)
    delete process.env["LINEARIS_NO_INTERACTIVE"];
  else process.env["LINEARIS_NO_INTERACTIVE"] = origNoInteractive;
});

describe("shouldPrompt", () => {
  it("prompts when a required arg is missing on a clean TTY", () => {
    expect(shouldPrompt({}, { missingRequired: true })).toBe(true);
  });

  it("prompts when -i is explicit even with no missing required", () => {
    expect(
      shouldPrompt({ interactive: true }, { missingRequired: false }),
    ).toBe(true);
  });

  it("does not prompt when nothing missing and -i not passed", () => {
    expect(shouldPrompt({}, { missingRequired: false })).toBe(false);
  });

  it("does not prompt when stdin is not a TTY", () => {
    setTTY(false, true);
    expect(shouldPrompt({}, { missingRequired: true })).toBe(false);
  });

  it("does not prompt when stdout is not a TTY", () => {
    setTTY(true, false);
    expect(shouldPrompt({ interactive: true }, { missingRequired: true })).toBe(
      false,
    );
  });

  it("does not prompt when --no-interactive passed", () => {
    expect(
      shouldPrompt({ interactive: false }, { missingRequired: true }),
    ).toBe(false);
  });

  it("does not prompt when CI is set", () => {
    process.env["CI"] = "true";
    expect(shouldPrompt({}, { missingRequired: true })).toBe(false);
  });

  it("does not prompt when LINEARIS_NO_INTERACTIVE is set", () => {
    process.env["LINEARIS_NO_INTERACTIVE"] = "1";
    expect(shouldPrompt({}, { missingRequired: true })).toBe(false);
  });

  it("does not prompt when --compact passed", () => {
    expect(shouldPrompt({ compact: true }, { missingRequired: true })).toBe(
      false,
    );
  });

  it("does not prompt when --fields passed", () => {
    expect(
      shouldPrompt({ fields: ["identifier"] }, { missingRequired: true }),
    ).toBe(false);
  });

  it("prompts when --fields is an empty array", () => {
    expect(shouldPrompt({ fields: [] }, { missingRequired: true })).toBe(true);
  });
});
