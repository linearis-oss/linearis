/**
 * Minimal ambient types for the semantic-release plugins exercised by the
 * release tests. The upstream packages ship no declarations, and we only call
 * a single entry point, so a hand-written surface is cheaper (and clearer)
 * than pulling in a full third-party type dependency.
 */
declare module "@semantic-release/release-notes-generator" {
  export function generateNotes(
    pluginConfig: Record<string, unknown>,
    context: Record<string, unknown>,
  ): Promise<string>;
}
