import { emojify, get } from "node-emoji";

const SHORTCODE_ALIASES = new Map<string, string>([["thumbs_up", "+1"]]);

function lookupEmojiByShortcode(shortcode: string): string | undefined {
  const directEmoji = get(shortcode);
  if (directEmoji) {
    return directEmoji;
  }

  const alias = SHORTCODE_ALIASES.get(shortcode);
  return alias ? get(alias) : undefined;
}

export function normalizeReactionEmojiInput(raw: string): string {
  const emoji = raw.trim();
  if (!emoji) {
    throw new Error("emoji must not be empty");
  }
  return emoji;
}

export function resolveReactionEmojiInput(
  positionalEmoji: string | undefined,
  shortcode: string | undefined,
): string {
  const normalizedPositionalEmoji = positionalEmoji?.trim();
  const normalizedShortcode = shortcode?.trim();

  if (normalizedPositionalEmoji && normalizedShortcode) {
    throw new Error("cannot provide both positional emoji and --shortcode");
  }

  if (normalizedPositionalEmoji) {
    return normalizeReactionEmojiInput(normalizedPositionalEmoji);
  }

  if (!normalizedShortcode) {
    throw new Error("emoji or --shortcode is required");
  }

  const emojified = emojify(`:${normalizedShortcode}:`);
  const emoji =
    emojified !== `:${normalizedShortcode}:`
      ? emojified
      : lookupEmojiByShortcode(normalizedShortcode);

  if (!emoji) {
    throw new Error(`unknown emoji shortcode "${normalizedShortcode}"`);
  }

  return normalizeReactionEmojiInput(emoji);
}
