import { randomUUID } from 'node:crypto';

import type { Page } from '@playwright/test';

import type { ViewsApi } from '../../src/api/views';
import type { ObjectRights, RolesApi } from '../../src/auth/roles';
import { opportunityInput } from '../../src/data/factories';
import { type Api, expect, test } from '../../src/fixtures';
import { RecordBoard } from '../../src/ui/record-board';

const ISSUES = 'https://github.com/Nikolay-Chillev/twenty-qa/issues';

/** The columns of the "By Stage" board, one for each stage, left to right. */
const COLUMNS = ['New', 'Screening', 'Meeting', 'Proposal', 'Customer'] as const;

const READ_ONLY: ObjectRights = {
  canReadObjectRecords: true,
  canUpdateObjectRecords: false,
  canSoftDeleteObjectRecords: false,
  canDestroyObjectRecords: false,
};

const euros = (amount: number) => ({ amountMicros: amount * 1_000_000, currencyCode: 'EUR' });

/** A tag in the names of this test's deals, so the board shows only them. */
const newTag = () => `Табло ${randomUUID().slice(0, 8)}`;

/** The id of the opportunities' own board view, "By Stage". */
async function byStage(views: ViewsApi): Promise<string> {
  const view = (await views.list('opportunity')).find((one) => one.name === 'By Stage');
  if (!view) throw new Error('The opportunities have no "By Stage" view');
  return view.id;
}

test.describe('the opportunities board', () => {
  test('shows each deal in the column of its stage, with its name and amount', async ({
    page,
    api,
    views,
  }) => {
    const tag = newTag();
    const [fresh, meeting, customer] = await Promise.all([
      api.opportunities.create(
        opportunityInput({ name: `${tag} нова`, stage: 'NEW', amount: euros(1_000) }),
      ),
      api.opportunities.create(
        opportunityInput({ name: `${tag} среща`, stage: 'MEETING', amount: euros(2_500) }),
      ),
      api.opportunities.create(
        opportunityInput({ name: `${tag} клиент`, stage: 'CUSTOMER', amount: euros(40_000) }),
      ),
    ]);

    const board = await new RecordBoard(page, 'opportunities', COLUMNS).open(
      await byStage(views),
      tag,
    );

    expect([
      await board.columnOf(fresh.id),
      await board.columnOf(meeting.id),
      await board.columnOf(customer.id),
    ]).toEqual(['New', 'Meeting', 'Customer']);
    await expect(board.card(fresh.id)).toContainText(`${tag} нова`);
    await expect(board.card(fresh.id)).toContainText('€1k');
    await expect(board.card(meeting.id)).toContainText('€2.5k');
    await expect(board.card(customer.id)).toContainText('€40k');
  });

  test('a deal dragged to another column moves to that stage, and stays there after a reload', async ({
    page,
    api,
    views,
  }) => {
    const tag = newTag();
    const deal = await api.opportunities.create(
      opportunityInput({ name: `${tag} сделка`, stage: 'SCREENING' }),
    );
    const viewId = await byStage(views);
    const board = await new RecordBoard(page, 'opportunities', COLUMNS).open(viewId, tag);
    await expect(board.handle(deal.id)).toHaveCount(1);

    await board.drag(deal.id, { column: 'Proposal' });

    await expect.poll(async () => (await api.opportunities.get(deal.id)).stage).toBe('PROPOSAL');
    await board.open(viewId, tag);
    expect(await board.columnOf(deal.id)).toBe('Proposal');
  });

  test('a deal dragged within its column keeps its new place', async ({ page, api, views }) => {
    const tag = newTag();
    await api.opportunities.create(opportunityInput({ name: `${tag} първа`, stage: 'MEETING' }));
    await api.opportunities.create(opportunityInput({ name: `${tag} втора`, stage: 'MEETING' }));
    const viewId = await byStage(views);
    const board = await new RecordBoard(page, 'opportunities', COLUMNS).open(viewId, tag);
    // The headers can show before the cards do.
    await expect.poll(() => board.idsIn('Meeting')).toHaveLength(2);
    const [top = '', bottom = ''] = await board.idsIn('Meeting');

    await board.drag(bottom, { before: top });

    await expect.poll(() => board.idsIn('Meeting')).toEqual([bottom, top]);
    await expect
      .poll(async () => {
        const [moved, other] = await Promise.all([
          api.opportunities.get(bottom),
          api.opportunities.get(top),
        ]);
        return moved.position < other.position;
      })
      .toBe(true);
    await board.open(viewId, tag);
    await expect.poll(() => board.idsIn('Meeting')).toEqual([bottom, top]);
  });

  test('a deal added in a column gets the stage of that column', async ({ page, api, views }) => {
    const tag = newTag();
    const board = await new RecordBoard(page, 'opportunities', COLUMNS).open(
      await byStage(views),
      tag,
    );

    const id = await board.add('Proposal', `${tag} нова`);

    await expect
      .poll(async () => {
        const deal = await api.opportunities.get(id);
        return { name: deal.name, stage: deal.stage };
      })
      .toEqual({ name: `${tag} нова`, stage: 'PROPOSAL' });
  });

  test("a column's total adds up its deals, and follows a deal that moves", async ({
    page,
    api,
    views,
  }) => {
    const tag = newTag();
    await api.opportunities.create(
      opportunityInput({ name: `${tag} голяма`, stage: 'PROPOSAL', amount: euros(10_000) }),
    );
    await api.opportunities.create(
      opportunityInput({ name: `${tag} малка`, stage: 'PROPOSAL', amount: euros(2_500) }),
    );
    const moving = await api.opportunities.create(
      opportunityInput({ name: `${tag} нова`, stage: 'NEW', amount: euros(1_000) }),
    );
    const board = await new RecordBoard(page, 'opportunities', COLUMNS).open(
      await byStage(views),
      tag,
    );

    await expect
      .poll(async () => [await board.total('New'), await board.total('Proposal')])
      .toEqual(['1k', '12.5k']);

    await board.drag(moving.id, { column: 'Proposal' });

    await expect
      .poll(async () => [await board.total('New'), await board.total('Proposal')])
      .toEqual(['0', '13.5k']);
  });

  test.describe('a role that may only read deals', () => {
    /** Signs in a member whose role may only read deals, on a board with one deal in New. */
    async function readerBoard({
      api,
      views,
      roles,
      signInWithRole,
    }: {
      api: Api;
      views: ViewsApi;
      roles: RolesApi;
      signInWithRole: (roleId: string) => Promise<Page>;
    }) {
      const role = await roles.create();
      await roles.limitObject(role, 'opportunity', READ_ONLY);
      const tag = newTag();
      const deal = await api.opportunities.create(
        opportunityInput({ name: `${tag} сделка`, stage: 'NEW' }),
      );
      const page = await signInWithRole(role);
      const viewId = await byStage(views);
      const board = await new RecordBoard(page, 'opportunities', COLUMNS).open(viewId, tag);
      return { page, board, deal, reopen: () => board.open(viewId, tag) };
    }

    const refusal = (page: Page) =>
      page.getByRole('status').filter({ hasText: 'User does not have permission.' });

    test('has a move refused, and the deal keeps its stage', async ({
      api,
      views,
      roles,
      signInWithRole,
    }) => {
      const { page, board, deal, reopen } = await readerBoard({
        api,
        views,
        roles,
        signInWithRole,
      });

      await board.drag(deal.id, { column: 'Screening' });

      await expect(refusal(page)).toBeVisible();
      expect((await api.opportunities.get(deal.id)).stage).toBe('NEW');
      await reopen();
      expect(await board.columnOf(deal.id)).toBe('New');
    });

    test.fail(
      'is not offered to move a deal',
      { annotation: { type: 'issue', description: `${ISSUES}/88` } },
      async ({ api, views, roles, signInWithRole }) => {
        const { board, deal } = await readerBoard({ api, views, roles, signInWithRole });

        // As the table offers such a role no editing, and the board's columns no "+ New".
        expect(await board.isDraggable(deal.id)).toBe(false);
      },
    );
  });
});
