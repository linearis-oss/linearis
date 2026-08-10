import type { FilteredSearchIssuesQuery } from "../gql/graphql.js";

// Pagination types
type PageInfo = FilteredSearchIssuesQuery["issues"]["pageInfo"];

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

/** A Relay-style GraphQL connection page. */
interface Connection<T> {
  nodes: readonly T[];
  pageInfo: { hasNextPage: boolean; endCursor?: string | null };
}

/**
 * Exhaust a cursor-paginated GraphQL connection, returning every node. The
 * caller's `fetchPage` requests a single page for the given `after` cursor (and
 * performs any per-page guards, e.g. asserting the parent entity exists);
 * iteration stops once the server reports no further pages. Centralizes the
 * fetch-until-empty loop shared by services that must materialize a whole
 * connection before processing it.
 */
export async function collectConnection<TNode>(
  fetchPage: (after: string | undefined) => Promise<Connection<TNode>>,
): Promise<TNode[]> {
  const nodes: TNode[] = [];
  let after: string | undefined;

  while (true) {
    const connection = await fetchPage(after);
    nodes.push(...connection.nodes);

    if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) {
      break;
    }

    after = connection.pageInfo.endCursor;
  }

  return nodes;
}
