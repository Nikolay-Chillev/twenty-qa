import type { APIRequestContext, APIResponse } from '@playwright/test';
import { z } from 'zod';

/** Twenty's REST error body, e.g. {"statusCode":404,"error":"NotFoundException","messages":["Record not found"]}. */
export const RestErrorBody = z.object({
  statusCode: z.number(),
  error: z.string(),
  messages: z.array(z.string()),
});
export type RestErrorBody = z.infer<typeof RestErrorBody>;

/** Raised when a REST call that should succeed answers with an error status. */
export class RestError extends Error {
  constructor(
    readonly status: number,
    readonly body: RestErrorBody | string,
  ) {
    super(
      `REST call failed with ${String(status)}: ${typeof body === 'string' ? body : body.messages.join('; ')}`,
    );
    this.name = 'RestError';
  }
}

export type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  data?: unknown;
  params?: Record<string, string | number | boolean>;
}

/** Calls Twenty's REST API (`/rest/...`) with a bearer token, or anonymously without one. */
export class RestClient {
  constructor(
    private readonly request: APIRequestContext,
    private readonly token?: string,
  ) {}

  /** The raw response, for tests that check statuses and error bodies themselves. */
  async send(method: Method, path: string, options: RequestOptions = {}): Promise<APIResponse> {
    return this.request.fetch(path, {
      method,
      headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
      ...(options.data === undefined ? {} : { data: options.data }),
      ...(options.params === undefined ? {} : { params: options.params }),
    });
  }

  /** Fails on an error status and checks the body against `schema`. */
  async call<Body extends z.ZodType>(
    method: Method,
    path: string,
    schema: Body,
    options: RequestOptions = {},
  ): Promise<z.output<Body>> {
    const response = await this.send(method, path, options);
    if (!response.ok()) {
      const text = await response.text();
      const error = RestErrorBody.safeParse(safeJson(text));
      throw new RestError(response.status(), error.success ? error.data : text);
    }
    return schema.parse(await response.json());
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
