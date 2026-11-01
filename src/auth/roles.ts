import { randomUUID } from 'node:crypto';

import type { APIRequestContext } from '@playwright/test';
import { z } from 'zod';

import { graphql } from '../api/graphql';
import { fieldId, objectMetadata } from '../api/metadata';

// Roles, their permissions and API keys through the /metadata API, as the roles settings
// make them. It takes an admin's access token: an API key may not create API keys.

/** What a role may do with the records of every object; an object's permissions override it. */
export interface RoleRights {
  canReadAllObjectRecords?: boolean;
  canUpdateAllObjectRecords?: boolean;
  canSoftDeleteAllObjectRecords?: boolean;
  canDestroyAllObjectRecords?: boolean;
  /** Tools include the Views permission, which lets a role change the workspace's views. */
  canAccessAllTools?: boolean;
}

/** What a role may do with the records of one object; unset rights are left as they are. */
export interface ObjectRights {
  canReadObjectRecords?: boolean;
  canUpdateObjectRecords?: boolean;
  canSoftDeleteObjectRecords?: boolean;
  canDestroyObjectRecords?: boolean;
}

/** What a role may do with one field of an object's records. */
export interface FieldRights {
  canReadFieldValue?: boolean;
  canUpdateFieldValue?: boolean;
}

export interface ApiKey {
  id: string;
  /** The bearer token for REST and GraphQL calls. */
  token: string;
}

const FAR_FUTURE = '2099-12-31T00:00:00.000Z';

/** Roles and API keys made for a test; the `roles` fixture removes them when it ends. */
export class RolesApi {
  private readonly roles: string[] = [];
  private readonly keys: string[] = [];

  constructor(
    private readonly request: APIRequestContext,
    private readonly token: string,
  ) {}

  /** The id of a built-in role, e.g. `Member`. */
  async idOf(label: string): Promise<string> {
    const { getRoles } = await this.call(
      '{ getRoles { id label } }',
      {},
      z.object({ getRoles: z.array(z.object({ id: z.uuid(), label: z.string() })) }),
    );
    const role = getRoles.find((one) => one.label === label);
    if (!role) throw new Error(`The workspace has no role ${label}`);
    return role.id;
  }

  /**
   * A role for users and API keys that may do everything with every object's records,
   * except what `rights` turns off, and has no settings permissions. Returns its id.
   */
  async create(rights: RoleRights = {}): Promise<string> {
    const { createOneRole } = await this.call(
      'mutation($input: CreateRoleInput!) { createOneRole(createRoleInput: $input) { id } }',
      {
        input: {
          label: `QA role ${randomUUID()}`,
          canReadAllObjectRecords: true,
          canUpdateAllObjectRecords: true,
          canSoftDeleteAllObjectRecords: true,
          canDestroyAllObjectRecords: true,
          canBeAssignedToUsers: true,
          canBeAssignedToApiKeys: true,
          ...rights,
        },
      },
      z.object({ createOneRole: z.object({ id: z.uuid() }) }),
    );
    this.roles.push(createOneRole.id);
    return createOneRole.id;
  }

  /** Sets what the role may do with an object's records, e.g. `company`. */
  async limitObject(roleId: string, object: string, rights: ObjectRights): Promise<void> {
    const { id } = await objectMetadata(this.request, this.token, object);
    await this.call(
      `mutation($input: UpsertObjectPermissionsInput!) {
        upsertObjectPermissions(upsertObjectPermissionsInput: $input) { objectMetadataId }
      }`,
      { input: { roleId, objectPermissions: [{ objectMetadataId: id, ...rights }] } },
      z.object({ upsertObjectPermissions: z.array(z.object({ objectMetadataId: z.uuid() })) }),
    );
  }

  /** Sets what the role may do with one field, e.g. `annualRevenue` of `company`. */
  async limitField(
    roleId: string,
    object: string,
    field: string,
    rights: FieldRights,
  ): Promise<void> {
    const metadata = await objectMetadata(this.request, this.token, object);
    await this.call(
      `mutation($input: UpsertFieldPermissionsInput!) {
        upsertFieldPermissions(upsertFieldPermissionsInput: $input) { fieldMetadataId }
      }`,
      {
        input: {
          roleId,
          fieldPermissions: [
            { objectMetadataId: metadata.id, fieldMetadataId: fieldId(metadata, field), ...rights },
          ],
        },
      },
      z.object({ upsertFieldPermissions: z.array(z.object({ fieldMetadataId: z.uuid() })) }),
    );
  }

  /** Gives the role permissions by their keys, e.g. `VIEWS`. */
  async grant(roleId: string, permissions: string[]): Promise<void> {
    await this.call(
      `mutation($input: UpsertPermissionFlagsInput!) {
        upsertPermissionFlags(upsertPermissionFlagsInput: $input) { flag }
      }`,
      { input: { roleId, permissionFlagKeys: permissions } },
      z.object({ upsertPermissionFlags: z.array(z.object({ flag: z.string() })) }),
    );
  }

  /** A new API key with the role, as "Create API key" in the settings makes one. */
  async apiKey(roleId: string): Promise<ApiKey> {
    const { createApiKey } = await this.call(
      'mutation($input: CreateApiKeyInput!) { createApiKey(input: $input) { id } }',
      { input: { name: 'twenty-qa role test', expiresAt: FAR_FUTURE, roleId } },
      z.object({ createApiKey: z.object({ id: z.uuid() }) }),
    );
    this.keys.push(createApiKey.id);
    const { generateApiKeyToken } = await this.call(
      `mutation($apiKeyId: UUID!, $expiresAt: String!) {
        generateApiKeyToken(apiKeyId: $apiKeyId, expiresAt: $expiresAt) { token }
      }`,
      { apiKeyId: createApiKey.id, expiresAt: FAR_FUTURE },
      z.object({ generateApiKeyToken: z.object({ token: z.string() }) }),
    );
    return { id: createApiKey.id, token: generateApiKeyToken.token };
  }

  async revoke(keyId: string): Promise<void> {
    await this.call(
      'mutation($input: RevokeApiKeyInput!) { revokeApiKey(input: $input) { id } }',
      { input: { id: keyId } },
      z.object({ revokeApiKey: z.object({ id: z.uuid() }).nullable() }),
    );
  }

  /** Revokes the keys and deletes the roles this test made; the fixture calls it at the end. */
  async removeAll(): Promise<void> {
    for (const id of this.keys) await this.revoke(id);
    for (const roleId of this.roles) {
      await this.call(
        'mutation($roleId: UUID!) { deleteOneRole(roleId: $roleId) }',
        { roleId },
        z.object({ deleteOneRole: z.string() }),
      );
    }
    this.keys.length = 0;
    this.roles.length = 0;
  }

  private async call<Data extends z.ZodType>(
    query: string,
    variables: Record<string, unknown>,
    data: Data,
  ): Promise<z.output<Data>> {
    return graphql(this.request, '/metadata', { query, variables, token: this.token, data });
  }
}
