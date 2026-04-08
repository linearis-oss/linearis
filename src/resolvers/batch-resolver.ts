import type { GraphQLClient } from "../client/graphql-client.js";
import { notFoundError } from "../common/errors.js";
import { isUuid, tryParseIssueIdentifier } from "../common/identifier.js";
import {
  BatchResolveForCreateDocument,
  type BatchResolveForCreateQuery,
  BatchResolveForUpdateDocument,
  type BatchResolveForUpdateQuery,
} from "../gql/graphql.js";

type LabelNode = {
  id: string;
  name: string;
  isGroup: boolean;
  children: { nodes: { id: string; name: string }[] };
};

function extractLabelIds(nodes: LabelNode[], names: string[]): string[] {
  const ids: string[] = [];
  for (const name of names) {
    const label = nodes.find(
      (n) => n.name.toLowerCase() === name.toLowerCase(),
    );
    if (!label) throw notFoundError("Label", name);
    if (label.isGroup) {
      ids.push(...label.children.nodes.map((c) => c.id));
    } else {
      ids.push(label.id);
    }
  }
  return ids;
}

export interface CreateBatchResult {
  teamId?: string;
  projectId?: string;
  labelIds?: string[];
  parentId?: string;
  projectMilestones: { id: string; name: string }[];
}

export async function batchResolveForCreate(
  gql: GraphQLClient,
  opts: {
    team?: string;
    project?: string;
    labelNames?: string[];
    parentTicket?: string;
  },
): Promise<CreateBatchResult> {
  const { team, project, labelNames, parentTicket } = opts;

  const teamIsUuid = !team || isUuid(team);
  const projectIsUuid = !project || isUuid(project);
  const parentParsed =
    parentTicket && !isUuid(parentTicket)
      ? tryParseIssueIdentifier(parentTicket)
      : null;

  const hasWork =
    (!teamIsUuid && team) ||
    (!projectIsUuid && project) ||
    (labelNames && labelNames.length > 0) ||
    parentParsed;

  if (!hasWork) return { projectMilestones: [] };

  const data = await gql.request<BatchResolveForCreateQuery>(
    BatchResolveForCreateDocument,
    {
      teamKey: !teamIsUuid ? team : undefined,
      teamName: !teamIsUuid ? team : undefined,
      projectName: !projectIsUuid ? project : undefined,
      labelNames: labelNames?.length ? labelNames : undefined,
      parentTeamKey: parentParsed?.teamKey ?? undefined,
      parentIssueNumber: parentParsed?.issueNumber ?? undefined,
    },
  );

  const result: CreateBatchResult = { projectMilestones: [] };

  if (!teamIsUuid && team) {
    const node = data.teams?.nodes[0];
    if (!node) throw notFoundError("Team", team);
    result.teamId = node.id;
  }

  if (!projectIsUuid && project) {
    const node = data.projects?.nodes[0];
    if (!node) throw notFoundError("Project", project);
    result.projectId = node.id;
    result.projectMilestones = node.projectMilestones?.nodes ?? [];
  }

  if (labelNames?.length) {
    result.labelIds = extractLabelIds(data.labels?.nodes ?? [], labelNames);
  }

  if (parentParsed) {
    const node = data.parentIssues?.nodes[0];
    if (!node) throw notFoundError("Issue", parentTicket!);
    result.parentId = node.id;
  }

  return result;
}

export interface UpdateBatchResult {
  labelIds?: string[];
  projectId?: string;
  milestoneId?: string;
  issueContext?: {
    id: string;
    labels: { nodes: { id: string; name: string }[] };
    team: { id: string; key: string; name: string };
    project: {
      id: string;
      projectMilestones: { nodes: { id: string; name: string }[] };
    } | null;
  };
}

export async function batchResolveForUpdate(
  gql: GraphQLClient,
  opts: {
    issueIdentifier?: string; // ABC-123, not UUID
    project?: string;
    labelNames?: string[];
    milestoneName?: string;
  },
): Promise<UpdateBatchResult> {
  const { issueIdentifier, project, labelNames, milestoneName } = opts;

  const projectIsUuid = !project || isUuid(project);
  const milestoneIsUuid = !milestoneName || isUuid(milestoneName);
  const issueParsed = issueIdentifier
    ? tryParseIssueIdentifier(issueIdentifier)
    : null;

  const hasWork =
    (labelNames && labelNames.length > 0) ||
    (!projectIsUuid && project) ||
    (!milestoneIsUuid && milestoneName) ||
    issueParsed;

  if (!hasWork) return {};

  const data = await gql.request<BatchResolveForUpdateQuery>(
    BatchResolveForUpdateDocument,
    {
      labelNames: labelNames?.length ? labelNames : undefined,
      projectName: !projectIsUuid ? project : undefined,
      teamKey: issueParsed?.teamKey ?? undefined,
      issueNumber: issueParsed?.issueNumber ?? undefined,
      milestoneName: !milestoneIsUuid ? milestoneName : undefined,
    },
  );

  const result: UpdateBatchResult = {};

  if (labelNames?.length) {
    result.labelIds = extractLabelIds(data.labels?.nodes ?? [], labelNames);
  }

  if (!projectIsUuid && project) {
    const node = data.projects?.nodes[0];
    if (!node) throw notFoundError("Project", project);
    result.projectId = node.id;
  }

  if (!milestoneIsUuid && milestoneName) {
    const projectMilestones =
      data.projects?.nodes[0]?.projectMilestones?.nodes ?? [];
    const fromProject = projectMilestones.find(
      (m) => m.name.toLowerCase() === milestoneName.toLowerCase(),
    );
    const milestone = fromProject ?? data.milestones?.nodes[0];
    if (!milestone) throw notFoundError("Milestone", milestoneName);
    result.milestoneId = milestone.id;
  }

  if (issueParsed && data.issues?.nodes[0]) {
    const node = data.issues.nodes[0];
    result.issueContext = {
      id: node.id,
      labels: node.labels,
      team: node.team,
      project: node.project ?? null,
    };
  }

  return result;
}
