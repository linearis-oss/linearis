import { get } from "node-emoji";

/**
 * A curated set of common reaction shortcodes. Each shortcode is resolved via
 * node-emoji so the picker can show the glyph; only shortcodes node-emoji
 * recognises are surfaced (they are the ones `resolveReactionEmojiInput`
 * accepts). `thumbs_up` is aliased to `+1` (matching `src/common/emoji.ts`).
 */
const CANDIDATE_SHORTCODES: readonly string[] = [
  "+1",
  "-1",
  "heart",
  "tada",
  "rocket",
  "eyes",
  "fire",
  "smile",
  "laughing",
  "thinking_face",
  "raised_hands",
  "clap",
  "pray",
  "100",
  "white_check_mark",
  "x",
];

export interface EmojiChoice {
  shortcode: string;
  emoji: string;
}

export const COMMON_REACTION_EMOJI: readonly EmojiChoice[] =
  CANDIDATE_SHORTCODES.flatMap((shortcode) => {
    const emoji = get(shortcode);
    return emoji ? [{ shortcode, emoji }] : [];
  });
