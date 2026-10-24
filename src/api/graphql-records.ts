import type { APIRequestContext } from '@playwright/test';
import { z } from 'zod';

import { graphql } from './graphql';
import type { CrudApi } from './records';

function unwrap(type: z.ZodType): z.ZodType {
  let inner = type;
  while (inner instanceof z.ZodNullable || inner instanceof z.ZodOptional) {
    inner = inner.unwrap() as z.ZodType;
  }
  return inner;
}

/**
 * The GraphQL selection for everything a schema checks, e.g. `id name { firstName }`,
 * so a query asks for exactly the fields its response is checked against.
 * Arrays are JSON values in Twenty's schema and need no subselection.
 */
export function selectionOf(schema: z.ZodObject): string {
  return Object.entries(schema.shape)
    .map(([field, type]) => {
      const inner = unwrap(type as z.ZodType);
      return inner instanceof z.ZodObject ? `${field} { ${selectionOf(inner)} }` : field;
    })
    .join(' ');
}

export interface ObjectNames {
  /** `company`: the query for one record, and the base of the mutation names */
  singular: string;
  /** `Company`: the base of the input type names, e.g. `CompanyCreateInput` */
  type: string;
}

/** CRUD over one object of the GraphQL API at `/graphql`. */
export function graphqlRecordsApi<Item extends z.ZodObject, Input>(
  request: APIRequestContext,
  token: string,
  names: ObjectNames,
  item: Item,
): CrudApi<z.output<Item>, Input> {
  const { singular, type } = names;
  const fields = selectionOf(item);
  const result = (key: string) => z.object({ [key]: item });

  return {
    create: async (input) => {
      const key = `create${type}`;
      const data = await graphql(request, '/graphql', {
        query: `mutation($data: ${type}CreateInput!) { ${key}(data: $data) { ${fields} } }`,
        variables: { data: input },
        token,
        data: result(key),
      });
      return data[key] as z.output<Item>;
    },
    get: async (id) => {
      const data = await graphql(request, '/graphql', {
        query: `query($id: UUID!) { ${singular}(filter: { id: { eq: $id } }) { ${fields} } }`,
        variables: { id },
        token,
        data: result(singular),
      });
      return data[singular] as z.output<Item>;
    },
    update: async (id, input) => {
      const key = `update${type}`;
      const data = await graphql(request, '/graphql', {
        query: `mutation($id: UUID!, $data: ${type}UpdateInput!) { ${key}(id: $id, data: $data) { ${fields} } }`,
        variables: { id, data: input },
        token,
        data: result(key),
      });
      return data[key] as z.output<Item>;
    },
    delete: async (id) => {
      const key = `delete${type}`;
      await graphql(request, '/graphql', {
        query: `mutation($id: UUID!) { ${key}(id: $id) { id deletedAt } }`,
        variables: { id },
        token,
        data: z.object({ [key]: z.object({ id: z.uuid(), deletedAt: z.iso.datetime() }) }),
      });
    },
    restore: async (id) => {
      const key = `restore${type}`;
      const data = await graphql(request, '/graphql', {
        query: `mutation($id: UUID!) { ${key}(id: $id) { ${fields} } }`,
        variables: { id },
        token,
        data: result(key),
      });
      return data[key] as z.output<Item>;
    },
    destroy: async (id) => {
      const key = `destroy${type}`;
      await graphql(request, '/graphql', {
        query: `mutation($id: UUID!) { ${key}(id: $id) { id } }`,
        variables: { id },
        token,
        data: z.object({ [key]: z.object({ id: z.uuid() }) }),
      });
    },
  };
}
