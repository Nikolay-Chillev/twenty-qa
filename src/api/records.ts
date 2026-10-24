import { z } from 'zod';

import type { RestClient } from './rest';

const PageInfo = z.object({
  startCursor: z.string().nullable(),
  endCursor: z.string().nullable(),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
});

export interface Page<Item> {
  records: Item[];
  totalCount: number;
  pageInfo: z.infer<typeof PageInfo>;
}

export interface ListOptions {
  limit?: number;
  /** Twenty's filter syntax, e.g. `name[eq]:"Acme"`. */
  filter?: string;
  /** e.g. `name[AscNullsFirst]` or `closeDate[DescNullsLast]` */
  orderBy?: string;
  startingAfter?: string;
  endingBefore?: string;
}

/** Create, read, update, delete and restore one object's records, through REST or GraphQL. */
export interface CrudApi<Item, Input> {
  create(input: Input): Promise<Item>;
  get(id: string): Promise<Item>;
  update(id: string, input: Input): Promise<Item>;
  /** Moves the record to the trash, as the app's delete does. */
  delete(id: string): Promise<void>;
  /** Brings a record back from the trash. */
  restore(id: string): Promise<Item>;
  /** Deletes the record for good. */
  destroy(id: string): Promise<void>;
}

/** CRUD, lists and bulk operations over one object of the REST API, e.g. `/rest/companies`. */
export interface RecordsApi<Item, Input> extends CrudApi<Item, Input> {
  list(options?: ListOptions): Promise<Page<Item>>;
  createMany(inputs: Input[]): Promise<Item[]>;
  updateMany(filter: string, input: Input): Promise<Item[]>;
  /** Moves every record the filter matches to the trash; returns their ids. */
  deleteMany(filter: string): Promise<string[]>;
  restoreMany(filter: string): Promise<Item[]>;
}

// Twenty wraps each result in a key named after the operation, e.g.
// {"data":{"createCompany":{...}}} or {"data":{"companies":[...]}}.
function only<Value>(data: Record<string, Value>): Value {
  const values = Object.values(data);
  if (values.length !== 1) {
    throw new Error(`Expected one result, got keys: ${Object.keys(data).join(', ')}`);
  }
  return values[0] as Value;
}

const defined = (params: Record<string, string | number | boolean | undefined>) =>
  Object.fromEntries(
    Object.entries(params).filter((entry): entry is [string, string | number | boolean] => {
      return entry[1] !== undefined;
    }),
  );

export function recordsApi<Item extends z.ZodType, Input>(
  rest: RestClient,
  plural: string,
  item: Item,
): RecordsApi<z.output<Item>, Input> {
  const path = `/rest/${plural}`;
  const one = z.object({ data: z.record(z.string(), item) }).transform(({ data }) => only(data));
  const list = z
    .object({
      data: z.record(z.string(), z.array(item)),
      totalCount: z.number(),
      pageInfo: PageInfo,
    })
    .transform(({ data, totalCount, pageInfo }) => ({ records: only(data), totalCount, pageInfo }));
  const several = z
    .object({ data: z.record(z.string(), z.array(item)) })
    .transform(({ data }) => only(data));
  const ids = z.object({ data: z.record(z.string(), z.object({ id: z.uuid() })) });
  const manyIds = z
    .object({ data: z.record(z.string(), z.array(z.object({ id: z.uuid() }))) })
    .transform(({ data }) => only(data).map((record) => record.id));

  return {
    create: (input) => rest.call('POST', path, one, { data: input }),
    get: (id) => rest.call('GET', `${path}/${id}`, one),
    list: (options = {}) =>
      rest.call('GET', path, list, {
        params: defined({
          limit: options.limit,
          filter: options.filter,
          order_by: options.orderBy,
          starting_after: options.startingAfter,
          ending_before: options.endingBefore,
        }),
      }),
    update: (id, input) => rest.call('PATCH', `${path}/${id}`, one, { data: input }),
    // REST deletes for good unless soft_delete=true (its default is false), while the
    // app and GraphQL move records to the trash; this client does what the app does.
    delete: async (id) => {
      await rest.call('DELETE', `${path}/${id}`, ids, { params: { soft_delete: true } });
    },
    restore: (id) => rest.call('PATCH', `${path}/${id}/restore`, one),
    destroy: async (id) => {
      await rest.call('DELETE', `${path}/${id}`, ids, { params: { soft_delete: false } });
    },
    createMany: (inputs) => rest.call('POST', `/rest/batch/${plural}`, several, { data: inputs }),
    updateMany: (filter, input) =>
      rest.call('PATCH', path, several, { data: input, params: { filter } }),
    deleteMany: (filter) =>
      rest.call('DELETE', path, manyIds, { params: { filter, soft_delete: true } }),
    restoreMany: (filter) => rest.call('PATCH', `${path}/restore`, several, { params: { filter } }),
  };
}
