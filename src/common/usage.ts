import { Command } from "commander";

/**
 * Metadata for a CLI domain, used to generate token-optimized usage output.
 */
export interface DomainMeta {
  /** Domain command name (e.g. "issues") */
  name: string;
  /** One-line summary shown in overview (e.g. "work items with status, priority, assignee, labels") */
  summary: string;
  /** Multi-line context explaining the domain's data model for LLM agents */
  context: string;
  /** Argument descriptions keyed by argument name without brackets (e.g. { issue: "issue identifier (UUID or ABC-123)" }) */
  arguments: Record<string, string>;
  /** Cross-references to related commands (e.g. ["comments create <issue>"]) */
  seeAlso: string[];
}

/**
 * Format tier 1 overview: all domains with one-line summaries.
 *
 * @param version - CLI version string
 * @param metas - Domain metadata array
 * @returns Formatted plain text overview
 */
export function formatOverview(version: string, metas: DomainMeta[]): string {
  const lines: string[] = [];
  lines.push(
    `linearis v${version} — CLI for Linear.app (project management / issue tracking)`,
  );
  lines.push(
    "auth: linearis auth login | --api-token <token> | LINEAR_API_TOKEN | ~/.linearis/token",
  );
  lines.push("output: JSON");
  lines.push("ids: UUID or human-readable (team key, issue ABC-123, name)");
  lines.push("");
  lines.push("domains:");
  for (const meta of metas) {
    lines.push(`  ${meta.name.padEnd(14)}${meta.summary}`);
  }
  lines.push("");
  lines.push("detail: linearis <domain> usage");
  return lines.join("\n");
}

/**
 * Extract long flag with value placeholder from Commander.js option flags string.
 * Strips short flag prefix (e.g. "-l, --limit <number>" → "--limit <number>").
 */
function extractLongFlag(flags: string): string {
  const parts = flags.split(",").map((s) => s.trim());
  const longPart = parts.find((p) => p.startsWith("--"));
  return longPart || flags;
}

/**
 * Build command signature string from Commander.js command.
 * Shows arguments if present, otherwise [options] if options exist.
 */
function formatCommandSignature(cmd: Command): string {
  const args = cmd.registeredArguments;
  const parts: string[] = [cmd.name()];

  if (args.length > 0) {
    for (const arg of args) {
      parts.push(arg.required ? `<${arg.name()}>` : `[${arg.name()}]`);
    }
  } else if (cmd.options.length > 0) {
    parts.push("[options]");
  }

  return parts.join(" ");
}

/**
 * Format tier 2 domain usage: full command reference for one domain.
 *
 * Introspects Commander.js command tree for commands and options.
 * Uses DomainMeta for context, argument descriptions, and cross-references.
 *
 * @param command - Commander.js command for this domain
 * @param meta - Domain metadata
 * @returns Formatted plain text domain usage
 */
export function formatDomainUsage(command: Command, meta: DomainMeta): string {
  const lines: string[] = [];

  // Header
  lines.push(`linearis ${meta.name} — ${meta.summary}`);
  lines.push("");

  // Context
  lines.push(meta.context);
  lines.push("");

  // Commands (exclude "usage" subcommand)
  const subcommands = command.commands.filter((c) => c.name() !== "usage");
  lines.push("commands:");

  const signatures = subcommands.map((c) => formatCommandSignature(c));
  const maxSigLen = Math.max(...signatures.map((s) => s.length));

  for (let i = 0; i < subcommands.length; i++) {
    const sig = signatures[i];
    const desc = subcommands[i].description();
    lines.push(`  ${sig.padEnd(maxSigLen + 2)}${desc}`);
  }

  // Arguments
  const argEntries = Object.entries(meta.arguments);
  if (argEntries.length > 0) {
    lines.push("");
    lines.push("arguments:");
    const maxArgLen = Math.max(
      ...argEntries.map(([name]) => `<${name}>`.length),
    );
    for (const [name, desc] of argEntries) {
      lines.push(`  ${`<${name}>`.padEnd(maxArgLen + 2)}${desc}`);
    }
  }

  // Options per subcommand
  for (const cmd of subcommands) {
    const opts = cmd.options.filter((o) => !o.hidden);
    if (opts.length === 0) continue;

    lines.push("");
    lines.push(`${cmd.name()} options:`);

    const flags = opts.map((o) => extractLongFlag(o.flags));
    const maxFlagLen = Math.max(...flags.map((f) => f.length));

    for (let j = 0; j < opts.length; j++) {
      const flag = flags[j];
      let desc = opts[j].description;
      const defaultVal = opts[j].defaultValue;
      if (defaultVal !== undefined && defaultVal !== false) {
        desc += ` (default: ${defaultVal})`;
      }
      lines.push(`  ${flag.padEnd(maxFlagLen + 2)}${desc}`);
    }
  }

  // See also
  if (meta.seeAlso.length > 0) {
    lines.push("");
    lines.push(`see also: ${meta.seeAlso.join(", ")}`);
  }

  return lines.join("\n");
}
