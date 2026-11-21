import type { APIRequestContext, APIResponse } from '@playwright/test';
import { z } from 'zod';

import { graphql } from './graphql';
import { fieldId, objectMetadata } from './metadata';

// Uploading a file to Twenty, as the app does for an attachment: the server hands out an
// upload address for a declared name and size, the file is PUT there, and completing the
// upload gives the file a signed address to download it from.

const UploadTarget = z.object({
  fileId: z.uuid(),
  uploadUrl: z.url(),
  contentType: z.string(),
});
export type UploadTarget = z.infer<typeof UploadTarget>;

const StoredFile = z.object({ id: z.uuid(), path: z.string(), size: z.number(), url: z.url() });
export type StoredFile = z.infer<typeof StoredFile>;

/** Files of the attachments' file field, uploaded with a user's access token. */
export class FilesApi {
  private fieldId?: string;

  constructor(
    private readonly request: APIRequestContext,
    private readonly token: string,
  ) {}

  /** Asks for an upload address for a file of this name and declared size in bytes. */
  async start(name: string, size: number): Promise<UploadTarget> {
    const { createFileUpload } = await graphql(this.request, '/metadata', {
      query: `mutation($name: String!, $size: Float!, $field: String) {
        createFileUpload(
          filename: $name
          size: $size
          fileFolder: FilesField
          fieldMetadataId: $field
        ) { fileId uploadUrl contentType }
      }`,
      variables: { name, size, field: await this.attachmentFileField() },
      token: this.token,
      data: z.object({ createFileUpload: UploadTarget }),
    });
    return createFileUpload;
  }

  /** Sends the file's bytes to its upload address. */
  put(target: UploadTarget, content: Buffer): Promise<APIResponse> {
    return this.request.put(target.uploadUrl, {
      headers: { 'Content-Type': target.contentType },
      data: content,
    });
  }

  /** Finishes an upload; the file then has a signed address to download it from. */
  async complete(fileId: string): Promise<StoredFile> {
    const { completeFileUpload } = await graphql(this.request, '/metadata', {
      query: `mutation($fileId: String!) {
        completeFileUpload(fileId: $fileId) { id path size url }
      }`,
      variables: { fileId },
      token: this.token,
      data: z.object({ completeFileUpload: StoredFile }),
    });
    return completeFileUpload;
  }

  /** Uploads a file in one go. */
  async upload(name: string, content: Buffer): Promise<StoredFile> {
    const target = await this.start(name, content.length);
    const sent = await this.put(target, content);
    if (!sent.ok()) throw new Error(`Upload of ${name} answered ${String(sent.status())}`);
    return this.complete(target.fileId);
  }

  private async attachmentFileField(): Promise<string> {
    this.fieldId ??= fieldId(await objectMetadata(this.request, this.token, 'attachment'), 'file');
    return this.fieldId;
  }
}
