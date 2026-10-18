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
  orderBy?: string;
  startingAfter?: string;
}

/** CRUD over one object of the REST API, e.g. `/rest/companies`. */
export interface RecordsApi<Item, Input> {
  create(input: Input): Promise<Item>;
  get(id: string): Promise<Item>;
  list(options?: ListOptions): Promise<Page<Item>>;
  update(id: string, input: Input): Promise<Item>;
  /** Soft delete: the record goes to the trash and can be restored. */
  delete(id: string): Promise<void>;
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

export function recordsApi<Item extends z.ZodType, Input>(
  rest: RestClient,
  plural: string,
  item: Item,
): RecordsApi<z.output<Item>, Input> {
  const path = `/rest/${plural}`;
  const one = z.object({ data: z.record(z.string(), item) }).transform(({ data }) => only(data));
  const many = z
    .object({
      data: z.record(z.string(), z.array(item)),
      totalCount: z.number(),
      pageInfo: PageInfo,
    })
    .transform(({ data, totalCount, pageInfo }) => ({ records: only(data), totalCount, pageInfo }));
  const deleted = z.object({ data: z.record(z.string(), z.object({ id: z.uuid() })) });

  return {
    create: (input) => rest.call('POST', path, one, { data: input }),
    get: (id) => rest.call('GET', `${path}/${id}`, one),
    list: (options = {}) =>
      rest.call('GET', path, many, {
        params: Object.fromEntries(
          Object.entries({
            limit: options.limit,
            filter: options.filter,
            order_by: options.orderBy,
            starting_after: options.startingAfter,
          }).filter((entry): entry is [string, string | number] => entry[1] !== undefined),
        ),
      }),
    update: (id, input) => rest.call('PATCH', `${path}/${id}`, one, { data: input }),
    delete: async (id) => {
      await rest.call('DELETE', `${path}/${id}`, deleted);
    },
  };
}
