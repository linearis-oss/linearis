import type { GetIssuesQuery } from "../gql/graphql.js";

// Pagination types
type PageInfo = GetIssuesQuery["issues"]["pageInfo"];

export interface PaginatedResult<T> {
  nodes: T[];
  pageInfo: PageInfo;
}

export interface PaginationOptions {
  limit?: number;
  after?: string;
}

/**
 * Build a {@link PaginationOptions} object from raw CLI values, omitting `after`
 * when it is undefined. Keeping the key absent (rather than set to `undefined`)
 * is required under `exactOptionalPropertyTypes` and avoids repeating the
 * conditional spread at every list command.
 */
export function buildPaginationOptions(
  limit: number,
  after: string | undefined,
): PaginationOptions {
  return after === undefined ? { limit } : { limit, after };
}
