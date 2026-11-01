import path from 'node:path';

import { config, workspaceUrl } from '../config';

export type Role = 'admin' | 'member';

export interface TestUser {
  role: Role;
  email: string;
  firstName: string;
  lastName: string;
}

/** One user per built-in role. The admin creates and owns the workspace. */
export const USERS: Record<Role, TestUser> = {
  admin: { role: 'admin', email: 'admin@example.com', firstName: 'Мария', lastName: 'Иванова' },
  member: { role: 'member', email: 'member@example.com', firstName: 'Георги', lastName: 'Петров' },
};

export const WORKSPACE_NAME = 'QA Workspace';
export const WORKSPACE_SUBDOMAIN = 'qa';

/** Where the workspace's app lives, e.g. http://qa.localhost:3000; the API answers on any host. */
export const WORKSPACE_URL = workspaceUrl(config.TWENTY_URL, WORKSPACE_SUBDOMAIN);

const authDir = path.join(__dirname, '..', '..', 'playwright', '.auth');

/** Signed-in browser state of a role, saved by the setup project. */
export const storageStateOf = (role: Role): string => path.join(authDir, `${role}.json`);

/** Workspace id and API key, saved by the setup project. */
export const workspaceFile = path.join(authDir, 'workspace.json');

/** A customer's workspace on its own subdomain, with the admin who owns it. */
export interface Tenant {
  name: string;
  subdomain: string;
  /** Where its app lives, e.g. http://qa.localhost:3000 */
  url: string;
  admin: TestUser;
  /** Where the setup project saves its id and API key. */
  file: string;
}

/** The workspace the suite tests. */
export const SUITE_WORKSPACE: Tenant = {
  name: WORKSPACE_NAME,
  subdomain: WORKSPACE_SUBDOMAIN,
  url: WORKSPACE_URL,
  admin: USERS.admin,
  file: workspaceFile,
};

/** Another customer's workspace, which nothing of the suite's workspace may reach. */
export const OTHER_WORKSPACE: Tenant = {
  name: 'Other Workspace',
  subdomain: 'other',
  url: workspaceUrl(config.TWENTY_URL, 'other'),
  admin: {
    role: 'admin',
    email: 'other-admin@example.com',
    firstName: 'Петя',
    lastName: 'Стоянова',
  },
  file: path.join(authDir, 'other-workspace.json'),
};
