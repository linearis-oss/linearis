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
  lines.push("output: JSON");
  lines.push("ids: UUID or human-readable (team key, issue ABC-123, name)");
  lines.push(
    "agents: pass --no-interactive on every call to disable prompts (recommended for scripts/LLMs)",
  );
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

export function formatDomainUsage(command: Command, meta: DomainMeta): string {
  const lines: string[] = [];

  lines.push(`linearis ${meta.name} — ${meta.summary}`);
  lines.push("");
  lines.push(meta.context);
  lines.push("");

  const subcommands = command.commands.filter((c) => c.name() !== "usage");
  lines.push("commands:");

  const subcommandEntries = subcommands.map((c) => ({
    sig: formatCommandSignature(c),
    desc: c.description(),
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

  for (const cmd of subcommands) {
    const opts = cmd.options.filter((o) => !o.hidden);
    if (opts.length === 0) continue;

    lines.push("");
    lines.push(`${cmd.name()} options:`);

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
