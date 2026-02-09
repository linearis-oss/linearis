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

  const signatures = subcommands.map((c) => formatCommandSignature(c));
  const maxSigLen = Math.max(...signatures.map((s) => s.length));

  for (let i = 0; i < subcommands.length; i++) {
    const sig = signatures[i];
    const desc = subcommands[i].description();
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

  if (meta.seeAlso.length > 0) {
    lines.push("");
    lines.push(`see also: ${meta.seeAlso.join(", ")}`);
  }

  return lines.join("\n");
}
