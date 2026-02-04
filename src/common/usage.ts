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
    "auth: --api-token <token> | LINEAR_API_TOKEN | ~/.linear_api_token",
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
 * @deprecated Will be removed in Task 8 when main.ts is updated.
 */
export function outputUsageInfo(_program: Command): void {
  // Stub — replaced by formatOverview + formatDomainUsage
}
