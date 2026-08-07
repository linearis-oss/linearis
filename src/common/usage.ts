import type { Command } from "commander";

export interface DomainMeta {
  name: string;
  summary: string;
  context: string;
  arguments: Record<string, string>;
  seeAlso: string[];
}

export function formatOverview(version: string, metas: DomainMeta[]): string {
  const lines: string[] = [];
  lines.push(
    `linearis v${version} — CLI for Linear.app (project management / issue tracking)`,
  );
  lines.push("alias: linear (supported alias; docs/examples use linearis)");
  lines.push(
    "auth: linearis auth login | --api-token <token> | LINEAR_API_TOKEN | ~/.linearis/token",
  );
  lines.push(
    "graphql timeout: --graphql-timeout-ms <ms> | LINEAR_GRAPHQL_TIMEOUT_MS | default 30000",
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

function extractLongFlag(flags: string): string {
  const parts = flags.split(",").map((s) => s.trim());
  const longPart = parts.find((p) => p.startsWith("--"));
  return longPart || flags;
}

function formatCommandSignature(cmd: Command, path: string): string {
  const args = cmd.registeredArguments;
  const parts: string[] = [path];

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
 * Every runnable command under a domain, depth-first, each paired with the
 * space-separated path it is invoked by (`threads react`).
 *
 * Domains nest one level deep (`issues threads`, `issues relations`,
 * `initiatives updates`), and a bare nested group is a MISSING_SUBCOMMAND whose
 * recovery instruction points here — so listing the group's own name and
 * stopping would send the caller to an output that cannot answer the question
 * it was sent to answer. The group keeps its line, as the heading its children
 * hang off; the children are what make the reference complete.
 */
function collectCommands(
  parent: Command,
  prefix: string,
): { path: string; cmd: Command }[] {
  const entries: { path: string; cmd: Command }[] = [];
  for (const cmd of parent.commands) {
    if (cmd.name() === "usage") continue;
    const path = prefix.length > 0 ? `${prefix} ${cmd.name()}` : cmd.name();
    entries.push({ path, cmd });
    entries.push(...collectCommands(cmd, path));
  }
  return entries;
}

export function formatDomainUsage(command: Command, meta: DomainMeta): string {
  const lines: string[] = [];

  lines.push(`linearis ${meta.name} — ${meta.summary}`);
  lines.push("");
  lines.push(meta.context);
  lines.push("");

  const subcommands = collectCommands(command, "");
  lines.push("commands:");

  const subcommandEntries = subcommands.map(({ path, cmd }) => ({
    sig: formatCommandSignature(cmd, path),
    desc: cmd.description(),
  }));
  const maxSigLen = Math.max(...subcommandEntries.map((e) => e.sig.length));

  for (const { sig, desc } of subcommandEntries) {
    lines.push(`  ${sig.padEnd(maxSigLen + 2)}${desc}`);
  }

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

  for (const { path, cmd } of subcommands) {
    const opts = cmd.options.filter((o) => !o.hidden);
    if (opts.length === 0) continue;

    lines.push("");
    lines.push(`${path} options:`);

    const optionEntries = opts.map((o) => ({
      flag: extractLongFlag(o.flags),
      description: o.description,
      defaultValue: o.defaultValue,
    }));
    const maxFlagLen = Math.max(...optionEntries.map((e) => e.flag.length));

    for (const { flag, description, defaultValue } of optionEntries) {
      let desc = description;
      if (defaultValue !== undefined && defaultValue !== false) {
        desc += ` (default: ${defaultValue})`;
      }
      lines.push(`  ${flag.padEnd(maxFlagLen + 2)}${desc}`);
    }
  }

  if (meta.seeAlso.length > 0) {
    lines.push("");
    lines.push(`see also: ${meta.seeAlso.join(", ")}`);
  }

  return lines.join("\n");
}
