import type { APIRequestContext } from '@playwright/test';
import { z } from 'zod';

import { graphql } from './graphql';

// Twenty's search across objects, on /graphql: what the app's search in the command
// menu asks for.

export const SearchResult = z.object({
  recordId: z.uuid(),
  /** e.g. `company` */
  objectNameSingular: z.string(),
  /** The record's name as search shows it, e.g. "Ивайло Петров". */
  label: z.string(),
});
export type SearchResult = z.infer<typeof SearchResult>;

/**
 * Searches records by text, in every searchable object or only in `objects`, e.g.
 * `['person']`. Returns up to 50 results, best first.
 */
export async function search(
  request: APIRequestContext,
  token: string,
  text: string,
  objects?: string[],
): Promise<SearchResult[]> {
  const data = await graphql(request, '/graphql', {
    query: `query($text: String!, $objects: [String!]) {
      search(searchInput: $text, limit: 50, includedObjectNameSingulars: $objects) {
        edges { node { recordId objectNameSingular label } }
      }
    }`,
    variables: { text, objects },
    token,
    data: z.object({
      search: z.object({ edges: z.array(z.object({ node: SearchResult })) }),
    }),
  });
  return data.search.edges.map((edge) => edge.node);
}
