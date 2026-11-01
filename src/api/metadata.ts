import type { APIRequestContext } from '@playwright/test';
import { z } from 'zod';

import { graphql } from './graphql';

// The workspace's data model on /metadata: objects such as `company`, and their fields.
// Views and permissions refer to them by id.

const Objects = z.object({
  objects: z.object({
    edges: z.array(
      z.object({
        node: z.object({
          id: z.uuid(),
          nameSingular: z.string(),
          fields: z.object({
            edges: z.array(z.object({ node: z.object({ id: z.uuid(), name: z.string() }) })),
          }),
        }),
      }),
    ),
  }),
});

export interface ObjectMetadata {
  id: string;
  /** Field ids by field name, e.g. `name` */
  fields: Map<string, string>;
}

/** An object of the data model by its singular name, e.g. `company`. */
export async function objectMetadata(
  request: APIRequestContext,
  token: string,
  nameSingular: string,
): Promise<ObjectMetadata> {
  const data = await graphql(request, '/metadata', {
    query: `query { objects(paging: { first: 200 }) { edges { node { id nameSingular
      fields(paging: { first: 200 }) { edges { node { id name } } } } } } }`,
    token,
    data: Objects,
  });
  const found = data.objects.edges.find(({ node }) => node.nameSingular === nameSingular);
  if (!found) throw new Error(`No object named ${nameSingular}`);
  return {
    id: found.node.id,
    fields: new Map(found.node.fields.edges.map(({ node }) => [node.name, node.id])),
  };
}

/** The id of one of an object's fields, e.g. `name` of `company`. */
export function fieldId(object: ObjectMetadata, name: string): string {
  const id = object.fields.get(name);
  if (!id) throw new Error(`The object has no field ${name}`);
  return id;
}
