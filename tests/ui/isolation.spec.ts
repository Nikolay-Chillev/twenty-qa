import { OTHER_WORKSPACE, USERS } from '../../src/auth/users';
import { companyInput } from '../../src/data/factories';
import { apiFor, expect, test } from '../../src/fixtures';
import { SignInPage } from '../../src/ui/sign-in';

// The session cookie belongs to the workspace's own address, so a browser signed in to
// the suite's workspace is a stranger on another workspace's address.

test("this workspace's session does not open another workspace's records", async ({
  page,
  request,
  otherWorkspace,
}) => {
  const theirs = await apiFor(request, otherWorkspace.apiKey).companies.create(companyInput());

  await new SignInPage(page, `${OTHER_WORKSPACE.url}/object/company/${theirs.id}`).open();

  await expect(page).toHaveURL(`${OTHER_WORKSPACE.url}/welcome`);
  await expect(page.getByText(theirs.name)).toHaveCount(0);
});

test("this workspace's admin cannot sign in at another workspace's address", async ({
  guestPage,
  password,
}) => {
  const signIn = new SignInPage(guestPage, OTHER_WORKSPACE.url);

  await signIn.signIn(USERS.admin.email, password);

  await expect(signIn.notice('User is not a member of the workspace.')).toBeVisible();
  await expect(guestPage).toHaveURL(`${OTHER_WORKSPACE.url}/welcome`);
});
