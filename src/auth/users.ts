import path from 'node:path';

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

const authDir = path.join(__dirname, '..', '..', 'playwright', '.auth');

/** Signed-in browser state of a role, saved by the setup project. */
export const storageStateOf = (role: Role): string => path.join(authDir, `${role}.json`);

/** Workspace id and API key, saved by the setup project. */
export const workspaceFile = path.join(authDir, 'workspace.json');
