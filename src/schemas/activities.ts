import { z } from 'zod';

import { RecordBase } from './records';

// Contracts for what the team writes down about a record: notes, tasks, the links that
// put them on records ("targets"), and attached files.

/** A note's or task's text: Twenty keeps it as Markdown and as the editor's document. */
const RichText = z.object({
  markdown: z.string().nullable(),
  /** The editor's document as JSON text (TipTap since 2.5x); null until there is text. */
  tiptap: z.string().nullable(),
});

export const Note = RecordBase.extend({
  title: z.string(),
  bodyV2: RichText,
});
export type Note = z.infer<typeof Note>;

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'] as const;

export const Task = RecordBase.extend({
  title: z.string(),
  bodyV2: RichText,
  dueAt: z.iso.datetime().nullable(),
  status: z.enum(TASK_STATUSES).nullable(),
  /** The workspace member the task is for. */
  assigneeId: z.uuid().nullable(),
});
export type Task = z.infer<typeof Task>;

/** The records a note or task is on: one of these is set per target. */
const Targets = {
  targetCompanyId: z.uuid().nullable(),
  targetPersonId: z.uuid().nullable(),
  targetOpportunityId: z.uuid().nullable(),
};

export const NoteTarget = RecordBase.extend({ noteId: z.uuid(), ...Targets });
export type NoteTarget = z.infer<typeof NoteTarget>;

export const TaskTarget = RecordBase.extend({ taskId: z.uuid(), ...Targets });
export type TaskTarget = z.infer<typeof TaskTarget>;

/** A stored file, with a signed link to download it. */
const StoredFile = z.object({
  fileId: z.uuid(),
  label: z.string(),
  extension: z.string(),
  url: z.url(),
});

export const Attachment = RecordBase.extend({
  name: z.string(),
  file: z.array(StoredFile),
  ...Targets,
});
export type Attachment = z.infer<typeof Attachment>;

type TargetInput = Partial<Record<keyof typeof Targets, string>>;

export interface NoteInput {
  title?: string;
  bodyV2?: { markdown: string };
}

export interface TaskInput {
  title?: string;
  bodyV2?: { markdown: string };
  dueAt?: string | null;
  status?: (typeof TASK_STATUSES)[number];
  assigneeId?: string | null;
}

export type NoteTargetInput = { noteId: string } & TargetInput;
export type TaskTargetInput = { taskId: string } & TargetInput;

export type AttachmentInput = {
  name: string;
  file: { fileId: string; label: string }[];
} & TargetInput;
