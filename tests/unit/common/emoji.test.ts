import { describe, expect, it } from "vitest";
import {
  normalizeReactionEmojiInput,
  resolveReactionEmojiInput,
} from "../../../src/common/emoji.js";

describe("resolveReactionEmojiInput", () => {
  it("accepts positional emoji", () => {
    expect(resolveReactionEmojiInput("👍", undefined)).toBe("👍");
  });

  it("accepts shortcode through the primary emojify path", () => {
    expect(resolveReactionEmojiInput(undefined, "smile")).toBe("😄");
  });

  it("accepts thumbs_up through the fallback alias path", () => {
    expect(resolveReactionEmojiInput(undefined, "thumbs_up")).toBe("👍");
  });

  it("treats whitespace-only shortcode input as missing", () => {
    expect(() => resolveReactionEmojiInput(undefined, "   ")).toThrow(
      "emoji or --shortcode is required",
    );
  });

  it("rejects unknown shortcode", () => {
    expect(() =>
      resolveReactionEmojiInput(undefined, "nonexistent_shortcode"),
    ).toThrow('unknown emoji shortcode "nonexistent_shortcode"');
  });

  it("rejects missing emoji input", () => {
    expect(() => resolveReactionEmojiInput(undefined, undefined)).toThrow(
      "emoji or --shortcode is required",
    );
  });

  it("treats whitespace-only positional input as absent when shortcode is provided", () => {
    expect(resolveReactionEmojiInput("   ", "smile")).toBe("😄");
  });

  it("rejects mixed positional emoji and shortcode", () => {
    expect(() => resolveReactionEmojiInput("👍", "thumbs_up")).toThrow(
      "cannot provide both positional emoji and --shortcode",
    );
  });

  it("treats whitespace-only shortcode as absent when positional emoji is provided", () => {
    expect(resolveReactionEmojiInput("👍", "   ")).toBe("👍");
  });
});

describe("normalizeReactionEmojiInput", () => {
  it("trims whitespace around emoji", () => {
    expect(normalizeReactionEmojiInput("  👍  ")).toBe("👍");
  });

  it("rejects empty emoji", () => {
    expect(() => normalizeReactionEmojiInput("   ")).toThrow(
      "emoji must not be empty",
    );
  });
});
