import type { Command } from "commander";
import {
  type CommandContext,
  createContext,
  getRootOpts,
} from "../common/context.js";
import {
  InteractiveCancelledError,
  invalidParameterError,
} from "../common/errors.js";
import type { UUID } from "../common/identifier.js";
import { teamChoices, userChoices } from "../common/interactive/choices.js";
import { maybeCollectInteractive } from "../common/interactive/engine.js";
import type { ChoicePicker } from "../common/interactive/pickers.js";
import type { PromptIO, PromptSpec } from "../common/interactive/types.js";
import { handleCommand, outputSuccess, parseLimit } from "../common/output.js";
import { buildPaginationOptions } from "../common/types.js";
import { type DomainMeta, formatDomainUsage } from "../common/usage.js";
import { resolveTeamId } from "../resolvers/team-resolver.js";
import { resolveUserId } from "../resolvers/user-resolver.js";
import {
  addTeamMember,
  type CreateTeamInput,
  createTeam,
  getTeam,
  listTeamMembers,
  listTeams,
  removeTeamMember,
  type UpdateTeamInput,
  updateTeam,
} from "../services/team-service.js";

export const TEAMS_META: DomainMeta = {
  name: "teams",
  summary: "organizational units owning issues and cycles",
  context: [
    "a team is a group of users that owns issues, cycles, statuses, and",
    "labels. teams are identified by a short key (e.g. ENG), name, or UUID.",
    "teams can be created and updated, and their membership managed with",
    "add-member/remove-member. boolean settings take an explicit true|false",
    "value so scripts can set or unset them unambiguously. run create/update/",
    "add-member/remove-member with -i (or omit a required value on a TTY) to",
    "fill missing input interactively; piped/--no-interactive usage stays JSON.",
  ].join("\n"),
  arguments: {
    team: "team identifier (key, name, or UUID)",
    name: "team display name",
    user: "user identifier (display name, email, or UUID)",
  },
  seeAlso: ["users list", "issues create --team", "cycles list --team"],
};

/**
 * Entity picker for an absent `[team]` positional. Returns the selected team's
 * UUID, which the resolver passes through via `isUuid(...)`.
 */
async function teamPicker(ctx: CommandContext, io: PromptIO): Promise<string> {
  const options = await teamChoices(ctx);
  const answer = await io.select({ message: "Team", options });
  if (io.isCancel(answer)) {
    throw new InteractiveCancelledError();
  }
  return answer as string;
}

const EMPTY_SPEC: PromptSpec<Record<string, never>> = { fields: [] };

const ESTIMATION_TYPES = [
  "notUsed",
  "exponential",
  "fibonacci",
  "linear",
  "tShirt",
] as const;

function parseBooleanOption(flag: string, value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw invalidParameterError(flag, `expected true or false, got "${value}"`);
}

function parseIntegerOption(flag: string, value: string): number {
  // Number("") and Number("   ") coerce to 0, so reject blank input first.
  const parsed = value.trim() === "" ? Number.NaN : Number(value);
  if (!Number.isInteger(parsed)) {
    throw invalidParameterError(flag, `expected an integer, got "${value}"`);
  }
  return parsed;
}

// Linear types cycle/auto-close durations and cycleStartDay as Float, so
// fractional values are valid (e.g. a cycleStartDay with a time-of-day
// component). Only finite numbers are accepted.
function parseNumberOption(flag: string, value: string): number {
  // Number("") and Number("   ") coerce to 0, so reject blank input first.
  const parsed = value.trim() === "" ? Number.NaN : Number(value);
  if (!Number.isFinite(parsed)) {
    throw invalidParameterError(flag, `expected a number, got "${value}"`);
  }
  return parsed;
}

function parseEstimationType(value: string): string {
  if (!(ESTIMATION_TYPES as readonly string[]).includes(value)) {
    throw invalidParameterError(
      "--estimation-type",
      `expected one of ${ESTIMATION_TYPES.join(", ")}, got "${value}"`,
    );
  }
  return value;
}

// Shared mutable fields accepted by both `create` and `update`. `name` is
// handled by the caller (positional for create, --name for update).
interface TeamFieldOptions {
  key?: string;
  description?: string;
  private?: string;
  icon?: string;
  color?: string;
  timezone?: string;
  parent?: string;
  estimationType?: string;
  estimationExtended?: string;
  estimationAllowZero?: string;
  defaultEstimate?: string;
  inheritEstimation?: string;
  cyclesEnabled?: string;
  cycleDuration?: string;
  cycleCooldown?: string;
  cycleStartDay?: string;
  triageEnabled?: string;
  requirePriorityToLeaveTriage?: string;
  autoClosePeriod?: string;
  autoArchivePeriod?: string;
}

/**
 * Wizard shape for `teams create`/`update`: the promptable core fields only.
 * `name` is the create positional / update `--name`; `key` and `description`
 * are shared. The index signature carries the untouched advanced flag settings
 * through the engine so they reach {@link buildTeamFields} unchanged.
 */
interface TeamWizardOptions extends Record<string, unknown> {
  name?: string;
  key?: string;
  description?: string;
}

// IMPORTANT: keep these specs to string-valued `text` fields only. The ~20
// advanced settings (private, cyclesEnabled, triage, estimation…) are parsed
// from strings via parseBooleanOption, which `.trim()`s its input and therefore
// throws on a real boolean. The engine's `confirm` kind returns a boolean, so
// adding a boolean setting here as a `confirm` field would crash
// buildTeamFields. They stay flag-only unless buildTeamFields is first taught to
// accept booleans.
export const teamCreateSpec: PromptSpec<TeamWizardOptions> = {
  intro: "Create a new team",
  fields: [
    { name: "name", kind: "text", message: "Name", required: true },
    {
      name: "key",
      kind: "text",
      message: "Key (uppercase; auto-derived from name if blank)",
    },
    { name: "description", kind: "multiline", message: "Description" },
  ],
};

export const teamUpdateSpec: PromptSpec<TeamWizardOptions> = {
  intro: "Update a team",
  fields: [
    { name: "name", kind: "text", message: "Name" },
    { name: "key", kind: "text", message: "Key" },
    { name: "description", kind: "multiline", message: "Description" },
  ],
};

// Build the shared mutable field set once, resolving the parent team to a
// UUID. Only fields the user provided are included, so `update` never
// overwrites untouched settings.
async function buildTeamFields(
  ctx: CommandContext,
  options: TeamFieldOptions,
): Promise<UpdateTeamInput> {
  const input: UpdateTeamInput = {};

  if (options.key !== undefined) input.key = options.key;
  if (options.description !== undefined)
    input.description = options.description;
  if (options.icon !== undefined) input.icon = options.icon;
  if (options.color !== undefined) input.color = options.color;
  if (options.timezone !== undefined) input.timezone = options.timezone;

  if (options.private !== undefined) {
    input.private = parseBooleanOption("--private", options.private);
  }

  if (options.parent !== undefined) {
    input.parentId = await resolveTeamId(ctx.gql, options.parent);
  }

  if (options.estimationType !== undefined) {
    input.issueEstimationType = parseEstimationType(options.estimationType);
  }
  if (options.estimationExtended !== undefined) {
    input.issueEstimationExtended = parseBooleanOption(
      "--estimation-extended",
      options.estimationExtended,
    );
  }
  if (options.estimationAllowZero !== undefined) {
    input.issueEstimationAllowZero = parseBooleanOption(
      "--estimation-allow-zero",
      options.estimationAllowZero,
    );
  }
  if (options.defaultEstimate !== undefined) {
    input.defaultIssueEstimate = parseIntegerOption(
      "--default-estimate",
      options.defaultEstimate,
    );
  }
  if (options.inheritEstimation !== undefined) {
    input.inheritIssueEstimation = parseBooleanOption(
      "--inherit-estimation",
      options.inheritEstimation,
    );
  }

  if (options.cyclesEnabled !== undefined) {
    input.cyclesEnabled = parseBooleanOption(
      "--cycles-enabled",
      options.cyclesEnabled,
    );
  }
  if (options.cycleDuration !== undefined) {
    input.cycleDuration = parseNumberOption(
      "--cycle-duration",
      options.cycleDuration,
    );
  }
  if (options.cycleCooldown !== undefined) {
    input.cycleCooldownTime = parseNumberOption(
      "--cycle-cooldown",
      options.cycleCooldown,
    );
  }
  if (options.cycleStartDay !== undefined) {
    input.cycleStartDay = parseNumberOption(
      "--cycle-start-day",
      options.cycleStartDay,
    );
  }

  if (options.triageEnabled !== undefined) {
    input.triageEnabled = parseBooleanOption(
      "--triage-enabled",
      options.triageEnabled,
    );
  }
  if (options.requirePriorityToLeaveTriage !== undefined) {
    input.requirePriorityToLeaveTriage = parseBooleanOption(
      "--require-priority-to-leave-triage",
      options.requirePriorityToLeaveTriage,
    );
  }
  if (options.autoClosePeriod !== undefined) {
    input.autoClosePeriod = parseNumberOption(
      "--auto-close-period",
      options.autoClosePeriod,
    );
  }
  if (options.autoArchivePeriod !== undefined) {
    input.autoArchivePeriod = parseNumberOption(
      "--auto-archive-period",
      options.autoArchivePeriod,
    );
  }

  return input;
}

// Register the estimation/cycle/triage flags shared by create and update.
function addTeamSettingFlags(command: Command): Command {
  return command
    .option("--description <text>", "team description")
    .option("--private <true|false>", "whether the team is private")
    .option("--icon <icon>", "team icon")
    .option("--color <color>", "team color (hex)")
    .option("--timezone <tz>", "team timezone (e.g. America/New_York)")
    .option("--parent <team>", "parent team (key, name, or UUID)")
    .option(
      "--estimation-type <type>",
      `estimation scale (${ESTIMATION_TYPES.join(" | ")})`,
    )
    .option(
      "--estimation-extended <true|false>",
      "add extended estimate points",
    )
    .option(
      "--estimation-allow-zero <true|false>",
      "allow zero-point estimates",
    )
    .option("--default-estimate <n>", "default estimate for unestimated issues")
    .option(
      "--inherit-estimation <true|false>",
      "inherit estimation from parent (sub-teams only)",
    )
    .option("--cycles-enabled <true|false>", "whether the team uses cycles")
    .option("--cycle-duration <weeks>", "cycle length in weeks")
    .option("--cycle-cooldown <n>", "cooldown between cycles in weeks")
    .option("--cycle-start-day <n>", "day of week a new cycle starts")
    .option("--triage-enabled <true|false>", "whether triage mode is enabled")
    .option(
      "--require-priority-to-leave-triage <true|false>",
      "require a priority before leaving triage",
    )
    .option("--auto-close-period <months>", "auto-close period in months")
    .option("--auto-archive-period <months>", "auto-archive period in months");
}

/**
 * Fill an absent `[team]` positional via the team picker when gating allows,
 * otherwise error. Returns the team identifier (or picked UUID) for the
 * resolver.
 */
async function resolveTeamPositional(
  ctx: CommandContext,
  command: Command,
  team: string | undefined,
): Promise<string> {
  const filled = await maybeCollectInteractive<Record<string, never>, string>(
    ctx,
    getRootOpts(command),
    {
      spec: EMPTY_SPEC,
      options: {},
      missingRequired: team === undefined,
      positional: { name: "team", value: team, picker: teamPicker },
    },
  );
  if (filled.positional === undefined) {
    throw invalidParameterError("team", "is required");
  }
  return filled.positional;
}

/**
 * Entity picker for an absent `--user` on the membership commands. Returns the
 * selected user's UUID, which `resolveUserId` passes through via `isUuid(...)`.
 */
async function userPicker(ctx: CommandContext, io: PromptIO): Promise<string> {
  const options = await userChoices(ctx);
  const answer = await io.select({ message: "User", options });
  if (io.isCancel(answer)) {
    throw new InteractiveCancelledError();
  }
  return answer as string;
}

/**
 * Fill an absent `--user` value via the user picker when gating allows,
 * otherwise error. Returns the user identifier (or picked UUID) for the resolver.
 */
async function resolveUserOption(
  ctx: CommandContext,
  command: Command,
  user: string | undefined,
): Promise<string> {
  const filled = await maybeCollectInteractive<Record<string, never>, string>(
    ctx,
    getRootOpts(command),
    {
      spec: EMPTY_SPEC,
      options: {},
      missingRequired: user === undefined,
      positional: { name: "user", value: user, picker: userPicker },
    },
  );
  if (filled.positional === undefined) {
    throw invalidParameterError("--user", "is required");
  }
  return filled.positional;
}

/**
 * Fill an absent `--user` on `remove-member` via a picker scoped to the team's
 * CURRENT members (unlike {@link resolveUserOption}, which offers all users) so
 * a non-member — which the API would reject — cannot be selected. Returns the
 * selected user's UUID for the resolver.
 */
async function resolveTeamMemberOption(
  ctx: CommandContext,
  command: Command,
  teamId: UUID,
  user: string | undefined,
): Promise<string> {
  const memberPicker: ChoicePicker = async (pickerCtx, io) => {
    const { nodes } = await listTeamMembers(pickerCtx.gql, { id: teamId });
    const options = nodes.flatMap((member) =>
      member.user
        ? [
            {
              value: member.user.id,
              label: member.user.displayName,
              hint: member.user.email,
            },
          ]
        : [],
    );
    if (options.length === 0) {
      throw invalidParameterError("--user", "the selected team has no members");
    }
    const answer = await io.select({ message: "User", options });
    if (io.isCancel(answer)) {
      throw new InteractiveCancelledError();
    }
    return answer as string;
  };
  const filled = await maybeCollectInteractive<Record<string, never>, string>(
    ctx,
    getRootOpts(command),
    {
      spec: EMPTY_SPEC,
      options: {},
      missingRequired: user === undefined,
      positional: { name: "user", value: user, picker: memberPicker },
    },
  );
  if (filled.positional === undefined) {
    throw invalidParameterError("--user", "is required");
  }
  return filled.positional;
}

export function setupTeamsCommands(program: Command): void {
  const teams = program.command("teams").description("Team operations");

  teams.action(() => teams.help());

  teams
    .command("list")
    .description("list all teams")
    .option("-l, --limit <n>", "max results", "50")
    .option("--after <cursor>", "cursor for next page")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [options, command] = args as [
          { limit: string; after?: string },
          Command,
        ];
        const ctx = createContext(getRootOpts(command));
        const result = await listTeams(
          ctx.gql,
          buildPaginationOptions(parseLimit(options.limit), options.after),
        );
        outputSuccess(result);
      }),
    );

  teams
    .command("read [team]")
    .description("get team details")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const teamArg = args[0] as string | undefined;
        const command = args.at(-1) as Command;
        const ctx = createContext(getRootOpts(command));

        const team = await resolveTeamPositional(ctx, command, teamArg);
        const teamId = await resolveTeamId(ctx.gql, team);
        const result = await getTeam(ctx.gql, { id: teamId });
        outputSuccess(result);
      }),
    );

  addTeamSettingFlags(
    teams
      .command("create [name]")
      .description("create a new team")
      .option(
        "--key <key>",
        "unique team key (auto-derived from name if omitted)",
      ),
  ).action(
    handleCommand(async (...args: unknown[]) => {
      const [nameArg, rawOptions, command] = args as [
        string | undefined,
        TeamFieldOptions,
        Command,
      ];
      const ctx = createContext(getRootOpts(command));

      const filled = await maybeCollectInteractive<TeamWizardOptions, never>(
        ctx,
        getRootOpts(command),
        {
          spec: teamCreateSpec,
          options: {
            ...rawOptions,
            ...(nameArg !== undefined ? { name: nameArg } : {}),
          } as TeamWizardOptions,
          missingRequired: nameArg === undefined,
        },
      );
      const options = filled.options as unknown as TeamFieldOptions;
      const name = (filled.options.name as string | undefined) ?? nameArg;
      if (name === undefined) {
        throw invalidParameterError("name", "is required");
      }

      const fields = await buildTeamFields(ctx, options);
      const input: CreateTeamInput = { ...fields, name };
      const result = await createTeam(ctx.gql, input);
      outputSuccess(result);
    }),
  );

  addTeamSettingFlags(
    teams
      .command("update [team]")
      .description("update an existing team")
      .option("--name <name>", "new team name")
      .option("--key <key>", "new team key"),
  ).action(
    handleCommand(async (...args: unknown[]) => {
      const [teamArg, rawOptions, command] = args as [
        string | undefined,
        TeamFieldOptions & { name?: string },
        Command,
      ];
      const ctx = createContext(getRootOpts(command));

      // Wizard first: it picks the `[team]` positional AND fills name/key/
      // description, so the "at least one field" guard below sees prompted input
      // rather than firing before the user is asked.
      const filled = await maybeCollectInteractive<TeamWizardOptions, string>(
        ctx,
        getRootOpts(command),
        {
          spec: teamUpdateSpec,
          options: { ...rawOptions } as TeamWizardOptions,
          missingRequired: teamArg === undefined,
          positional: { name: "team", value: teamArg, picker: teamPicker },
        },
      );
      if (filled.positional === undefined) {
        throw invalidParameterError("team", "is required");
      }
      const options = filled.options as unknown as TeamFieldOptions & {
        name?: string;
      };

      const input = await buildTeamFields(ctx, options);
      if (options.name !== undefined) input.name = options.name;

      if (Object.keys(input).length === 0) {
        throw invalidParameterError(
          "update options",
          "at least one field must be provided",
        );
      }

      const teamId = await resolveTeamId(ctx.gql, filled.positional);
      const result = await updateTeam(ctx.gql, teamId, input);
      outputSuccess(result);
    }),
  );

  teams
    .command("members [team]")
    .description("list a team's members")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const teamArg = args[0] as string | undefined;
        const command = args.at(-1) as Command;
        const ctx = createContext(getRootOpts(command));
        const team = await resolveTeamPositional(ctx, command, teamArg);
        const teamId = await resolveTeamId(ctx.gql, team);
        const result = await listTeamMembers(ctx.gql, { id: teamId });
        outputSuccess(result);
      }),
    );

  teams
    .command("add-member [team]")
    .description("add a user to a team")
    .option("--user <user>", "user display name, email, or UUID")
    .option("--owner <true|false>", "grant team-admin (owner) rights")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [teamArg, options, command] = args as [
          string | undefined,
          { user?: string; owner?: string },
          Command,
        ];
        const ctx = createContext(getRootOpts(command));
        const team = await resolveTeamPositional(ctx, command, teamArg);
        const user = await resolveUserOption(ctx, command, options.user);
        const [teamId, userId] = await Promise.all([
          resolveTeamId(ctx.gql, team),
          resolveUserId(ctx.gql, user),
        ]);
        const result = await addTeamMember(ctx.gql, {
          teamId,
          userId,
          ...(options.owner === undefined
            ? {}
            : { owner: parseBooleanOption("--owner", options.owner) }),
        });
        outputSuccess(result);
      }),
    );

  teams
    .command("remove-member [team]")
    .description("remove a user from a team")
    .option("--user <user>", "user display name, email, or UUID")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [teamArg, options, command] = args as [
          string | undefined,
          { user?: string },
          Command,
        ];
        const ctx = createContext(getRootOpts(command));
        const team = await resolveTeamPositional(ctx, command, teamArg);
        const teamId = await resolveTeamId(ctx.gql, team);
        const user = await resolveTeamMemberOption(
          ctx,
          command,
          teamId,
          options.user,
        );
        const userId = await resolveUserId(ctx.gql, user);
        const result = await removeTeamMember(ctx.gql, { teamId, userId });
        outputSuccess(result);
      }),
    );

  teams
    .command("usage")
    .description("show detailed usage for teams")
    .action(() => {
      console.log(formatDomainUsage(teams, TEAMS_META));
    });
}
