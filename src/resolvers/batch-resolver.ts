import { parse } from "graphql";
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

// Dynamic document for case-insensitive label lookup using or+eqIgnoreCase.
// Not generated — the static batch queries use `in` which is case-sensitive,
// but label names typed by users may not match stored case exactly.
const LabelsByNameDocument = parse(`
  query LabelsByName($filters: [IssueLabelFilter!]!) {
    issueLabels(filter: { or: $filters }) {
      nodes {
        id
        name
        isGroup
        children {
          nodes {
            id
            name
          }
        }
      }
    }
  }
`);

async function fetchLabelsByName(
  gql: GraphQLClient,
  names: string[],
): Promise<LabelNode[]> {
  const filters = names.map((n) => ({ name: { eqIgnoreCase: n } }));
  const data = await gql.request<{
    issueLabels: { nodes: LabelNode[] };
  }>(LabelsByNameDocument, { filters });
  return data.issueLabels.nodes;
}

function extractLabelIds(nodes: LabelNode[], names: string[]): string[] {
  const ids: string[] = [];
  for (const name of names) {
    const label = nodes.find(
      (n) => n.name.toLowerCase() === name.toLowerCase(),
    );
    if (!label) throw notFoundError("Label", name);
    if (label.isGroup) {
      // group labels expand to all their children — this is intentional:
      // applying a group label applies all its children to the issue
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

  const needsBatch =
    (!teamIsUuid && team) || (!projectIsUuid && project) || parentParsed;

  if (!needsBatch && !labelNames?.length) return { projectMilestones: [] };

  // Run batch query and label lookup in parallel
  const [data, labelNodes] = await Promise.all([
    needsBatch
      ? gql.request<BatchResolveForCreateQuery>(BatchResolveForCreateDocument, {
          teamKey: !teamIsUuid ? team : undefined,
          teamName: !teamIsUuid ? team : undefined,
          projectName: !projectIsUuid ? project : undefined,
          parentTeamKey: parentParsed?.teamKey ?? undefined,
          parentIssueNumber: parentParsed?.issueNumber ?? undefined,
        })
      : Promise.resolve(null),
    labelNames?.length
      ? fetchLabelsByName(gql, labelNames)
      : Promise.resolve([]),
  ]);

  const result: CreateBatchResult = { projectMilestones: [] };

  if (!teamIsUuid && team) {
    const node = data?.teams?.nodes[0];
    if (!node) throw notFoundError("Team", team);
    result.teamId = node.id;
  }

  if (!projectIsUuid && project) {
    const node = data?.projects?.nodes[0];
    if (!node) throw notFoundError("Project", project);
    result.projectId = node.id;
    result.projectMilestones = node.projectMilestones?.nodes ?? [];
  }

  if (labelNames?.length) {
    result.labelIds = extractLabelIds(labelNodes, labelNames);
  }

  if (parentParsed) {
    const node = data?.parentIssues?.nodes[0];
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

  const needsBatch =
    (!projectIsUuid && project) ||
    (!milestoneIsUuid && milestoneName) ||
    issueParsed;

  if (!needsBatch && !labelNames?.length) return {};

  const [data, labelNodes] = await Promise.all([
    needsBatch
      ? gql.request<BatchResolveForUpdateQuery>(BatchResolveForUpdateDocument, {
          projectName: !projectIsUuid ? project : undefined,
          teamKey: issueParsed?.teamKey ?? undefined,
          issueNumber: issueParsed?.issueNumber ?? undefined,
          milestoneName: !milestoneIsUuid ? milestoneName : undefined,
        })
      : Promise.resolve(null),
    labelNames?.length
      ? fetchLabelsByName(gql, labelNames)
      : Promise.resolve([]),
  ]);

  const result: UpdateBatchResult = {};

  if (labelNames?.length) {
    result.labelIds = extractLabelIds(labelNodes, labelNames);
  }

  if (!projectIsUuid && project) {
    const node = data?.projects?.nodes[0];
    if (!node) throw notFoundError("Project", project);
    result.projectId = node.id;
  }

  if (!milestoneIsUuid && milestoneName) {
    const projectMilestones =
      data?.projects?.nodes[0]?.projectMilestones?.nodes ?? [];
    const fromProject = projectMilestones.find(
      (m) => m.name.toLowerCase() === milestoneName.toLowerCase(),
    );
    const milestone = fromProject ?? data?.milestones?.nodes[0];
    if (!milestone) throw notFoundError("Milestone", milestoneName);
    result.milestoneId = milestone.id;
  }

  if (issueParsed && data?.issues?.nodes[0]) {
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
