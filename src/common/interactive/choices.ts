// ARCHITECTURAL EXCEPTION: the interactive estimate picker needs the selected
// team's estimation scale, which is exposed only through the team resolver's
// estimate-context helper (there is no lean list service for it). Reused here
// read-only to derive the allowed values; no ID resolution is performed.
import { resolveTeamEstimateContext } from "../../resolvers/team-resolver.js";
import { listCycles } from "../../services/cycle-service.js";
import { listDocuments } from "../../services/document-service.js";
import { listInitiatives } from "../../services/initiative-service.js";
import { listIssues } from "../../services/issue-service.js";
import { listLabels } from "../../services/label-service.js";
import { listMilestones } from "../../services/milestone-service.js";
import {
  listProjectStatuses,
  listProjects,
} from "../../services/project-service.js";
import { listTeams } from "../../services/team-service.js";
import { listUsers } from "../../services/user-service.js";
import { listWorkflowStates } from "../../services/workflow-state-service.js";
import type { CommandContext } from "../context.js";
import { getAllowedEstimates } from "../estimate-validation.js";
import { asUuid, type UUID } from "../identifier.js";
import { COMMON_REACTION_EMOJI } from "./emoji-choices.js";
import type { Choice } from "./types.js";

/**
 * Shared choice loaders for the interactive engine. Each reuses an EXISTING
 * list service via `ctx.gql` (never a resolver).
 *
 * DESIGN: for entity fields (team, assignee, project, milestone, cycle, status,
 * labels) the choice `value` is the entity's resolved UUID, with `label` = the
 * human name and `hint` = extra context. This means:
 *  - cross-field child loaders read the parent UUID straight from `draft`
 *    (e.g. `cycleChoices`/`statusChoices` read the team UUID selected earlier);
 *  - the final options object carries UUIDs, which the issue resolvers already
 *    short-circuit on via `isUuid(...)` passthrough — so the downstream
 *    resolve → service → outputSuccess path is unchanged and layers hold.
 *
 * Non-entity fields (priority) keep their scalar value.
 */

/** A draft carries prior answers keyed by option name; values are strings. */
type Draft = Record<string, unknown>;

/** Read a UUID a prior entity field wrote into the draft under `key`. */
function draftUuid(draft: Draft, key: string): UUID | undefined {
  const value = draft[key];
  return typeof value === "string" ? asUuid(value) : undefined;
}

/**
 * Prepend an empty-valued "none" sentinel to a choice list so a single-select
 * field can be left unset. The interactive engine treats an empty selection as
 * "leave unset" (see collectInteractive), so the field falls back to its
 * absent-flag behaviour (e.g. a workspace label, or an all-teams listing).
 */
export function withNoneChoice(choices: Choice[], label: string): Choice[] {
  return [{ value: "", label }, ...choices];
}

/**
 * Wrap a choice loader so it prepends an empty-valued sentinel (via
 * {@link withNoneChoice}) whenever it returns at least one real option. This
 * makes an otherwise-mandatory single-select escapable:
 *  - on create, picking the sentinel leaves the field unset (CLI default);
 *  - on update, it leaves the field unchanged.
 *
 * When the underlying loader returns no options (e.g. a team with estimates
 * disabled, or no upcoming cycles) the empty list is passed through unchanged,
 * so the engine skips the field entirely instead of rendering a select whose
 * only entry is the sentinel.
 */
export function optionalChoices(
  load: (ctx: CommandContext, draft: Draft) => Promise<Choice[]>,
  label: string,
): (ctx: CommandContext, draft: Draft) => Promise<Choice[]> {
  return async (ctx, draft) => {
    const base = await load(ctx, draft);
    return base.length === 0 ? [] : withNoneChoice(base, label);
  };
}

export async function teamChoices(ctx: CommandContext): Promise<Choice[]> {
  const { nodes } = await listTeams(ctx.gql);
  return nodes.map((team) => ({
    value: team.id,
    label: team.name,
    hint: team.key,
  }));
}

export async function userChoices(ctx: CommandContext): Promise<Choice[]> {
  const { nodes } = await listUsers(ctx.gql, true);
  return nodes.map((user) => ({
    value: user.id,
    label: user.name,
    hint: user.email,
  }));
}

/**
 * Assignee picker: the user list with a leading "None" sentinel so the field
 * can be left unassigned (the engine treats the empty value as "leave unset").
 */
export async function assigneeChoices(ctx: CommandContext): Promise<Choice[]> {
  return withNoneChoice(await userChoices(ctx), "None (unassigned)");
}

export async function projectChoices(
  ctx: CommandContext,
  draft: Draft = {},
): Promise<Choice[]> {
  const teamId = draftUuid(draft, "team");
  const { nodes } = await listProjects(ctx.gql);
  // When a team was selected earlier in the wizard, only offer projects that
  // team is involved in. With no team context (e.g. document/milestone
  // wizards) the full list is returned unchanged.
  const scoped =
    teamId === undefined
      ? nodes
      : nodes.filter((project) =>
          project.teams.nodes.some((team) => team.id === teamId),
        );
  return scoped.map((project) => ({
    value: project.id,
    label: project.name,
    hint: project.state,
  }));
}

/**
 * Project picker with a leading "None" sentinel so an issue can be created or
 * updated without a project (the engine treats the empty value as "leave
 * unset"). Team-scoping from {@link projectChoices} is preserved.
 */
export async function optionalProjectChoices(
  ctx: CommandContext,
  draft: Draft,
): Promise<Choice[]> {
  return withNoneChoice(await projectChoices(ctx, draft), "None (no project)");
}

/**
 * Recent issues, valued by their human `identifier` (e.g. ABC-123) — the same
 * string the issue resolver accepts. Unlike the entity choices above this is
 * NOT UUID-valued because the content-domain positionals (`comments create
 * <issue>`, `attachments list <issue>`) feed the identifier into
 * `resolveIssueId`, which resolves identifiers directly. Shared by every
 * content domain's issue picker so the loader is not duplicated.
 */
export async function issueChoices(ctx: CommandContext): Promise<Choice[]> {
  const { nodes } = await listIssues(ctx.gql, { limit: 50 }, undefined);
  return nodes.map((issue) => ({
    value: issue.identifier,
    label: `${issue.identifier} ${issue.title}`,
    hint: issue.state.name,
  }));
}

/**
 * Recent documents, valued by UUID (which `asUuid` accepts unchanged in the
 * documents domain read/update/delete positionals). Documents are standalone
 * entities (optionally attached to a project and/or issue), so this picker is
 * not parent-scoped.
 */
export async function documentChoices(ctx: CommandContext): Promise<Choice[]> {
  const { nodes } = await listDocuments(ctx.gql, { limit: 50 });
  return nodes.map((document) => ({
    value: document.id,
    label: document.title,
    ...(document.icon ? { hint: document.icon } : {}),
  }));
}

export async function labelChoices(
  ctx: CommandContext,
  draft: Draft,
): Promise<Choice[]> {
  const teamId = draftUuid(draft, "team");
  const { nodes } = await listLabels(ctx.gql, teamId);
  return nodes.map((label) => ({
    value: label.id,
    label: label.name,
    ...(label.description !== undefined ? { hint: label.description } : {}),
  }));
}

export async function cycleChoices(
  ctx: CommandContext,
  draft: Draft,
): Promise<Choice[]> {
  const teamId = draftUuid(draft, "team");
  const { nodes } = await listCycles(ctx.gql, teamId);
  const now = Date.now();
  // Only current and future cycles are selectable for a new/updated issue;
  // past cycles (already ended) are dropped.
  const upcoming = nodes.filter(
    (cycle) => new Date(cycle.endsAt).getTime() >= now,
  );
  // Surface the active (current) cycle first so it is the default highlighted
  // option; remaining future cycles follow in start-date order.
  upcoming.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
  });
  return upcoming.map((cycle) => ({
    value: cycle.id,
    label: cycle.name,
    hint: cycle.isActive ? "current" : `${cycle.startsAt} → ${cycle.endsAt}`,
  }));
}

/**
 * Every cycle for the draft's team, including ended ones. Unlike
 * {@link cycleChoices} (which drops past cycles because you cannot schedule work
 * into a finished cycle), reading a cycle is a retrospective operation, so the
 * `cycles read` picker must be able to reach historical cycles too. The active
 * cycle is surfaced first; the rest follow most-recent-first by start date.
 */
export async function allCycleChoices(
  ctx: CommandContext,
  draft: Draft,
): Promise<Choice[]> {
  const teamId = draftUuid(draft, "team");
  const { nodes } = await listCycles(ctx.gql, teamId);
  const sorted = [...nodes].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime();
  });
  return sorted.map((cycle) => ({
    value: cycle.id,
    label: cycle.name,
    hint: cycle.isActive ? "current" : `${cycle.startsAt} → ${cycle.endsAt}`,
  }));
}

export async function milestoneChoices(
  ctx: CommandContext,
  draft: Draft,
): Promise<Choice[]> {
  const projectId = draftUuid(draft, "project");
  if (projectId === undefined) return [];
  const { nodes } = await listMilestones(ctx.gql, projectId);
  return nodes.map((milestone) => ({
    value: milestone.id,
    label: milestone.name,
  }));
}

export async function statusChoices(
  ctx: CommandContext,
  draft: Draft,
): Promise<Choice[]> {
  const teamId = draftUuid(draft, "team");
  if (teamId === undefined) return [];
  const states = await listWorkflowStates(ctx.gql, teamId);
  return states.map((state) => ({
    value: state.id,
    label: state.name,
    hint: state.type,
  }));
}

export async function projectStatusChoices(
  ctx: CommandContext,
): Promise<Choice[]> {
  const nodes = await listProjectStatuses(ctx.gql);
  return nodes.map((status) => ({
    value: status.id,
    label: status.name,
  }));
}

export async function initiativeChoices(
  ctx: CommandContext,
): Promise<Choice[]> {
  const { nodes } = await listInitiatives(ctx.gql, { limit: 50 });
  return nodes.map((initiative) => ({
    value: initiative.id,
    label: initiative.name,
    ...(initiative.status !== null && initiative.status !== undefined
      ? { hint: String(initiative.status) }
      : {}),
  }));
}

/**
 * Estimate picker scoped to the selected team's configured estimation scale.
 * Reads the team estimate context and offers only the allowed point values.
 * Returns an empty list when no team is selected yet or when the team has
 * estimates disabled (`notUsed`), so the engine skips the field entirely.
 */
export async function estimateChoices(
  ctx: CommandContext,
  draft: Draft,
): Promise<Choice[]> {
  const teamId = draftUuid(draft, "team");
  if (teamId === undefined) return [];
  const config = await resolveTeamEstimateContext(ctx.gql, teamId);
  return getAllowedEstimates(config).map((value) => ({
    value: String(value),
    label: String(value),
  }));
}

/**
 * Static Linear priority scale. The "None" sentinel uses an empty value so the
 * engine leaves priority unset (the CLI's `--priority` accepts only 1-4; 0/no
 * priority is expressed by omitting the flag).
 */
export function priorityChoices(): Choice[] {
  return [
    { value: "", label: "None" },
    { value: "1", label: "Urgent", hint: "1" },
    { value: "2", label: "High", hint: "2" },
    { value: "3", label: "Medium", hint: "3" },
    { value: "4", label: "Low", hint: "4" },
  ];
}

/**
 * A curated set of common reaction emoji. Each choice `value` is the emoji
 * glyph, which flows into the existing `resolveReactionEmojiInput` unchanged as
 * the positional `[emoji]` (it normalises glyphs verbatim). The shortcode is
 * shown in the label/hint for recognition.
 */
export function emojiChoices(): Choice[] {
  return COMMON_REACTION_EMOJI.map(({ shortcode, emoji }) => ({
    value: emoji,
    label: `${emoji} :${shortcode}:`,
    hint: shortcode,
  }));
}
