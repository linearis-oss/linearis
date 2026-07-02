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
