import type { IssueFilterOptions } from "../common/issue-filter.js";
import type { IssueFilter } from "../gql/graphql.js";

export function buildIssueFilter(
  options: IssueFilterOptions,
): IssueFilter | undefined {
  const fragments: IssueFilter[] = [];

  if (options.teamId) {
    fragments.push({ team: { id: { eq: options.teamId } } });
  }
  if (options.assigneeId) {
    fragments.push({ assignee: { id: { eq: options.assigneeId } } });
  }
  if (options.creatorId) {
    fragments.push({ creator: { id: { eq: options.creatorId } } });
  }
  if (options.projectId) {
    fragments.push({ project: { id: { eq: options.projectId } } });
  }
  if (options.stateIds && options.stateIds.length > 0) {
    fragments.push({ state: { id: { in: options.stateIds } } });
  }
  if (options.labelIds && options.labelIds.length > 0) {
    fragments.push({ labels: { some: { id: { in: options.labelIds } } } });
  }
  if (options.cycleId) {
    fragments.push({ cycle: { id: { eq: options.cycleId } } });
  }
  if (options.parentId) {
    fragments.push({ parent: { id: { eq: options.parentId } } });
  }
  if (options.milestoneId) {
    fragments.push({ projectMilestone: { id: { eq: options.milestoneId } } });
  }
  if (options.priority !== undefined) {
    fragments.push({ priority: { eq: options.priority } });
  }
  if (options.estimate !== undefined) {
    fragments.push({ estimate: { eq: options.estimate } });
  }
  if (options.dueAfter) {
    fragments.push({ dueDate: { gt: options.dueAfter } });
  }
  if (options.dueBefore) {
    fragments.push({ dueDate: { lt: options.dueBefore } });
  }
  if (options.createdAfter) {
    fragments.push({ createdAt: { gt: options.createdAfter } });
  }
  if (options.createdBefore) {
    fragments.push({ createdAt: { lt: options.createdBefore } });
  }
  if (options.completedAfter) {
    fragments.push({ completedAt: { gt: options.completedAfter } });
  }
  if (options.completedBefore) {
    fragments.push({ completedAt: { lt: options.completedBefore } });
  }
  if (options.updatedAfter) {
    fragments.push({ updatedAt: { gt: options.updatedAfter } });
  }
  if (options.updatedBefore) {
    fragments.push({ updatedAt: { lt: options.updatedBefore } });
  }
  if (options.unassigned) {
    fragments.push({ assignee: { null: true } });
  }
  if (options.stateType) {
    fragments.push({ state: { type: { eq: options.stateType } } });
  }
  if (options.subscriberId) {
    fragments.push({
      subscribers: { some: { id: { eq: options.subscriberId } } },
    });
  }
  if (options.hasBlockers !== undefined) {
    fragments.push({ hasBlockedByRelations: { eq: options.hasBlockers } });
  }
  if (options.isBlocking !== undefined) {
    fragments.push({ hasBlockingRelations: { eq: options.isBlocking } });
  }

  if (fragments.length === 0) {
    return undefined;
  }

  return { and: fragments };
}
