import type { APIRequestContext } from '@playwright/test';
import { z } from 'zod';

/** Twenty serves records on /graphql and everything else (auth, workspace, roles) on /metadata. */
export type GraphQLEndpoint = '/graphql' | '/metadata';

const Envelope = z.object({
  data: z.unknown().optional(),
  errors: z
    .array(
      z.object({
        message: z.string(),
        extensions: z.object({ code: z.string().optional() }).loose().optional(),
      }),
    )
    .optional(),
});

/** Raised when a GraphQL response has errors, whatever its HTTP status. */
export class GraphQLError extends Error {
  constructor(
    readonly endpoint: GraphQLEndpoint,
    readonly messages: string[],
    readonly codes: (string | undefined)[],
  ) {
    super(`${endpoint}: ${messages.join('; ')}`);
    this.name = 'GraphQLError';
  }
}

export interface Operation<Data extends z.ZodType> {
  query: string;
  variables?: Record<string, unknown>;
  token?: string;
  /** Schema of the `data` field; the response is checked against it. */
  data: Data;
}

export async function graphql<Data extends z.ZodType>(
  request: APIRequestContext,
  endpoint: GraphQLEndpoint,
  operation: Operation<Data>,
): Promise<z.output<Data>> {
  const response = await request.post(endpoint, {
    data: { query: operation.query, variables: operation.variables ?? {} },
    headers: operation.token ? { Authorization: `Bearer ${operation.token}` } : {},
  });
  // Signing in also sets a session cookie for the web app. The suite authenticates with
  // tokens only, so the cookie is dropped: kept, it makes Twenty treat later calls as
  // cookie-authenticated (refused without an Origin header), and it would sign in calls
  // that are meant to be anonymous.
  await request.clearCookies({ name: 'twenty-session' });
  const body = Envelope.parse(await response.json());
  if (body.errors?.length) {
    throw new GraphQLError(
      endpoint,
      body.errors.map((error) => error.message),
      body.errors.map((error) => error.extensions?.code),
    );
  }
  if (!response.ok()) {
    throw new Error(`${endpoint} answered ${String(response.status())} without errors`);
  }
  return operation.data.parse(body.data);
}
