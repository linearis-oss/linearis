import { describe, expect, it } from "vitest";
import { COMMON_REACTION_EMOJI } from "../../../src/common/interactive/emoji-choices.js";

describe("COMMON_REACTION_EMOJI", () => {
  it("is non-empty", () => {
    expect(COMMON_REACTION_EMOJI.length).toBeGreaterThan(0);
  });

  it("has a non-empty glyph and shortcode for every entry", () => {
    for (const choice of COMMON_REACTION_EMOJI) {
      expect(choice.emoji).toBeTruthy();
      expect(choice.emoji.length).toBeGreaterThan(0);
      expect(choice.shortcode).toBeTruthy();
      expect(choice.shortcode.length).toBeGreaterThan(0);
    }
  });
});
