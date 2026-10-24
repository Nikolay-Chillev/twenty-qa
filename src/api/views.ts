import type { APIRequestContext } from '@playwright/test';
import { z } from 'zod';

import { graphql, GraphQLError } from './graphql';

// Saved views of the record tables. Twenty keeps them with the workspace's metadata, on
// /metadata; a view with WORKSPACE visibility is listed for every member.

const ViewField = z.object({
  fieldMetadataId: z.uuid(),
  position: z.number(),
  isVisible: z.boolean(),
  size: z.number(),
});

export const ViewFilter = z.object({
  fieldMetadataId: z.uuid(),
  operand: z.string(),
  value: z.json(),
});

export const ViewSort = z.object({
  fieldMetadataId: z.uuid(),
  direction: z.enum(['ASC', 'DESC']),
});

export const View = z.object({
  id: z.uuid(),
  name: z.string(),
  /** `INDEX` for the object's own view, e.g. "All Companies"; null for the views people save. */
  key: z.string().nullable(),
  position: z.number(),
  visibility: z.enum(['WORKSPACE', 'UNLISTED']),
  objectMetadataId: z.uuid(),
  viewFields: z.array(ViewField),
  viewFilters: z.array(ViewFilter),
  viewSorts: z.array(ViewSort),
});
export type View = z.infer<typeof View>;

const VIEW = `id name key position visibility objectMetadataId
  viewFields { fieldMetadataId position isVisible size }
  viewFilters { fieldMetadataId operand value }
  viewSorts { fieldMetadataId direction }`;

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

interface ObjectMetadata {
  id: string;
  /** Field ids by field name, e.g. `name` */
  fields: Map<string, string>;
}

function indexViewOf(object: string, views: View[]): View {
  const index = views.find((view) => view.key === 'INDEX');
  if (!index) throw new Error(`The ${object} table has no index view`);
  return index;
}

export interface NewView {
  name: string;
  /** Filters by field name, e.g. `{ field: 'name', operand: 'CONTAINS', value: 'Софт' }`. */
  filters?: { field: string; operand: string; value: string }[];
}

/** Saved views through the metadata API, with the suite's API key. */
export class ViewsApi {
  private readonly toRemove = new Set<string>();

  constructor(
    private readonly request: APIRequestContext,
    private readonly token: string,
  ) {}

  /** The views of an object's table, e.g. `company`. */
  async list(object: string): Promise<View[]> {
    const { id } = await this.object(object);
    const data = await this.call(
      `query($id: String!) { getViews(objectMetadataId: $id) { ${VIEW} } }`,
      { id },
      z.object({ getViews: z.array(View) }),
    );
    return data.getViews;
  }

  /**
   * The object's own view, e.g. "All Companies". The suite opens tables on it: views
   * other tests save cannot replace it, and it is only ever saved as a new view.
   */
  async index(object: string): Promise<View> {
    return indexViewOf(object, await this.list(object));
  }

  async get(id: string): Promise<View | null> {
    const data = await this.call(
      `query($id: String!) { getView(id: $id) { ${VIEW} } }`,
      { id },
      z.object({ getView: View.nullable() }),
    );
    return data.getView;
  }

  /**
   * Saves a view of an object's table with the columns of its index view, last in the
   * list of views. It is removed when the test ends.
   */
  async create(object: string, view: NewView): Promise<View> {
    const metadata = await this.object(object);
    const views = await this.list(object);
    const index = indexViewOf(object, views);
    const { createView } = await this.call(
      `mutation($input: CreateViewInput!) { createView(input: $input) { id } }`,
      {
        input: {
          name: view.name,
          objectMetadataId: metadata.id,
          type: 'TABLE',
          icon: 'IconTable',
          // Twenty opens /objects/<plural> on the first view in the list; last, this one
          // changes nothing for other tests.
          position: Math.max(...views.map((other) => other.position)) + 1,
          visibility: 'WORKSPACE',
        },
      },
      z.object({ createView: z.object({ id: z.uuid() }) }),
    );
    const viewId = createView.id;
    this.toRemove.add(viewId);

    await this.call(
      `mutation($inputs: [CreateViewFieldInput!]!) { createManyViewFields(inputs: $inputs) { id } }`,
      { inputs: index.viewFields.map((field) => ({ ...field, viewId })) },
      z.object({ createManyViewFields: z.array(z.object({ id: z.uuid() })) }),
    );
    for (const { field, operand, value } of view.filters ?? []) {
      const fieldMetadataId = metadata.fields.get(field);
      if (!fieldMetadataId) throw new Error(`The ${object} object has no field ${field}`);
      await this.call(
        `mutation($input: CreateViewFilterInput!) { createViewFilter(input: $input) { id } }`,
        { input: { viewId, fieldMetadataId, operand, value } },
        z.object({ createViewFilter: z.object({ id: z.uuid() }) }),
      );
    }

    const created = await this.get(viewId);
    if (!created) throw new Error(`View ${viewId} is missing right after it was created`);
    return created;
  }

  /** Removes a view when the test ends: for the views a test saves through the UI. */
  removeAfterTest(id: string): void {
    this.toRemove.add(id);
  }

  async destroy(id: string): Promise<void> {
    await this.call(
      `mutation($id: String!) { destroyView(id: $id) }`,
      { id },
      z.object({ destroyView: z.literal(true) }),
    );
  }

  /** Removes the views this test created; the `views` fixture calls it when the test ends. */
  async removeAll(): Promise<void> {
    for (const id of this.toRemove) {
      try {
        await this.destroy(id);
      } catch (error) {
        // The test may have deleted the view itself.
        if (!(error instanceof GraphQLError && error.codes.includes('NOT_FOUND'))) throw error;
      }
    }
    this.toRemove.clear();
  }

  private async object(nameSingular: string): Promise<ObjectMetadata> {
    const data = await this.call(
      `query { objects(paging: { first: 200 }) { edges { node { id nameSingular
        fields(paging: { first: 200 }) { edges { node { id name } } } } } } }`,
      {},
      Objects,
    );
    const found = data.objects.edges.find(({ node }) => node.nameSingular === nameSingular);
    if (!found) throw new Error(`No object named ${nameSingular}`);
    return {
      id: found.node.id,
      fields: new Map(found.node.fields.edges.map(({ node }) => [node.name, node.id])),
    };
  }

  private async call<Data extends z.ZodType>(
    query: string,
    variables: Record<string, unknown>,
    data: Data,
  ): Promise<z.output<Data>> {
    return graphql(this.request, '/metadata', { query, variables, token: this.token, data });
  }
}
