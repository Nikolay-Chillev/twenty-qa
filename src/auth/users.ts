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
