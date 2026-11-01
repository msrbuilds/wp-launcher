import { z } from 'zod';
import * as boardService from '../../services/board.service';
import * as cardActivity from '../../services/cardActivity.service';
import { defineTool, type ToolDef } from '../registry';

const projectId = z.string().min(1).describe('Project id, from crm_projects_list.');
const columnId = z.string().min(1).describe('Column id, from crm_board_get.');
const cardId = z.string().min(1).describe('Card id, from crm_board_get.');

const cardSchema = z.object({
  id: z.string(), columnId: z.string(), title: z.string(), description: z.string().nullable(), position: z.number(),
  dueDate: z.string().nullable(), labels: z.array(z.string()), comments: z.number(), attachments: z.number(), updatedAt: z.string(),
});
const columnSchema = z.object({ id: z.string(), name: z.string(), position: z.number(), clientVisible: z.boolean() });

function parseLabels(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((l): l is string => typeof l === 'string') : [];
  } catch {
    return [];
  }
}

const toColumn = (c: boardService.BoardColumn) => ({ id: c.id, name: c.name, position: c.position, clientVisible: !!c.client_visible });
const toCard = (c: boardService.BoardCard, counts: Record<string, { comments: number; attachments: number }> = {}) => ({
  id: c.id, columnId: c.column_id, title: c.title, description: c.description, position: c.position, dueDate: c.due_date,
  labels: parseLabels(c.labels), comments: counts[c.id]?.comments ?? 0, attachments: counts[c.id]?.attachments ?? 0, updatedAt: c.updated_at,
});

const write = { scope: 'crm:write' as const, feature: 'projects', writeBucket: 'crm' as const };

export const crmBoardGet = defineTool({
  name: 'crm_board_get',
  title: 'Get a project board',
  description: 'Returns a project’s board: columns in order, each with its cards and their comment and attachment counts. Requires crm:read.',
  scope: 'crm:read', feature: 'projects',
  annotations: { readOnlyHint: true, idempotentHint: true },
  input: z.object({ projectId }),
  output: z.object({ columns: z.array(columnSchema.extend({ cards: z.array(cardSchema) })) }),
  handler: ({ projectId: id }, ctx) => {
    const board = boardService.getBoard(id, ctx.userId);
    const counts = cardActivity.countsForProject(id);
    return { columns: board.columns.map((col) => ({ ...toColumn(col), cards: col.cards.map((c) => toCard(c, counts)) })) };
  },
});

export const crmBoardColumnCreate = defineTool({
  name: 'crm_board_column_create',
  title: 'Add a board column',
  description: 'Adds a column to a project board. New columns are hidden from the client until made visible. Requires crm:write.',
  ...write, annotations: {},
  input: z.object({ projectId, name: z.string().min(1).max(100) }),
  output: z.object({ column: columnSchema }),
  handler: ({ projectId: id, name }, ctx) => ({ column: toColumn(boardService.createColumn(id, ctx.userId, { name })) }),
});

export const crmBoardColumnUpdate = defineTool({
  name: 'crm_board_column_update',
  title: 'Update a board column',
  description: 'Renames a column or changes whether the client sees it in their portal. Requires crm:write.',
  ...write, annotations: { idempotentHint: true },
  input: z.object({ columnId, name: z.string().min(1).max(100).optional(), clientVisible: z.boolean().optional().describe('Show this column and its cards to the client.') }),
  output: z.object({ column: columnSchema }),
  handler: ({ columnId: id, name, clientVisible }, ctx) => ({ column: toColumn(boardService.updateColumn(id, ctx.userId, { name, client_visible: clientVisible })) }),
});

export const crmBoardColumnDelete = defineTool({
  name: 'crm_board_column_delete',
  title: 'Delete a board column',
  description: 'Deletes a column and every card in it, with their comments and attachments. Cannot be undone; confirm with the user first. Requires crm:write.',
  ...write, annotations: { destructiveHint: true },
  input: z.object({ columnId }),
  output: z.object({ deleted: z.literal(true) }),
  handler: ({ columnId: id }, ctx) => {
    boardService.deleteColumn(id, ctx.userId);
    return { deleted: true as const };
  },
});

export const crmBoardColumnReorder = defineTool({
  name: 'crm_board_column_reorder',
  title: 'Reorder board columns',
  description: 'Sets the left-to-right order of a board’s columns. Unknown ids are ignored and omitted columns keep their place at the end. Requires crm:write.',
  ...write, annotations: { idempotentHint: true },
  input: z.object({ projectId, columnIds: z.array(z.string()).min(1).max(100) }),
  output: z.object({ reordered: z.literal(true) }),
  handler: ({ projectId: id, columnIds }, ctx) => {
    boardService.reorderColumns(id, ctx.userId, columnIds);
    return { reordered: true as const };
  },
});

const cardFields = {
  title: z.string().min(1).max(200),
  description: z.string().max(10_000).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD.'),
  labels: z.array(z.string().max(40)).max(20).optional(),
};

export const crmBoardCardCreate = defineTool({
  name: 'crm_board_card_create',
  title: 'Add a card',
  description: 'Adds a card to the bottom of a board column. Requires crm:write.',
  ...write, annotations: {},
  input: z.object({ columnId, ...cardFields }),
  output: z.object({ card: cardSchema }),
  handler: ({ columnId: id, dueDate, ...rest }, ctx) => ({ card: toCard(boardService.createCard(id, ctx.userId, { ...rest, due_date: dueDate })) }),
});

export const crmBoardCardUpdate = defineTool({
  name: 'crm_board_card_update',
  title: 'Update a card',
  description: 'Changes the fields you pass on a card. Pass dueDate: null to clear it. Requires crm:write.',
  ...write, annotations: { idempotentHint: true },
  input: z.object({ cardId, title: cardFields.title.optional(), description: cardFields.description, dueDate: cardFields.dueDate.nullable(), labels: cardFields.labels }),
  output: z.object({ card: cardSchema }),
  handler: ({ cardId: id, dueDate, ...rest }, ctx) =>
    ({ card: toCard(boardService.updateCard(id, ctx.userId, { ...rest, ...(dueDate !== undefined ? { due_date: dueDate } : {}) })) }),
});

export const crmBoardCardMove = defineTool({
  name: 'crm_board_card_move',
  title: 'Move a card',
  description: 'Moves a card to a position in a column of the same project (0 is the top). Requires crm:write.',
  ...write, annotations: { idempotentHint: true },
  input: z.object({ cardId, toColumnId: columnId, toIndex: z.number().int().min(0) }),
  output: z.object({ moved: z.literal(true) }),
  handler: ({ cardId: id, toColumnId, toIndex }, ctx) => {
    boardService.moveCard(id, ctx.userId, toColumnId, toIndex);
    return { moved: true as const };
  },
});

export const crmBoardCardDelete = defineTool({
  name: 'crm_board_card_delete',
  title: 'Delete a card',
  description: 'Deletes a card with its comments and attachments. Cannot be undone; confirm with the user first. Requires crm:write.',
  ...write, annotations: { destructiveHint: true },
  input: z.object({ cardId }),
  output: z.object({ deleted: z.literal(true) }),
  handler: ({ cardId: id }, ctx) => {
    boardService.deleteCard(id, ctx.userId);
    return { deleted: true as const };
  },
});

export const crmBoardCommentAdd = defineTool({
  name: 'crm_board_comment_add',
  title: 'Comment on a card',
  description: 'Adds a staff comment to a card. Clients never see card comments. Requires crm:write.',
  ...write, annotations: {},
  input: z.object({ cardId, body: z.string().min(1).max(5000) }),
  output: z.object({ comment: z.object({ id: z.string(), body: z.string(), author: z.string(), createdAt: z.string() }) }),
  handler: ({ cardId: id, body }, ctx) => {
    const c = cardActivity.addCardComment(id, ctx.userId, body);
    return { comment: { id: c.id, body: c.body, author: c.author_label, createdAt: c.created_at } };
  },
});

export const crmBoardTools: ToolDef[] = [
  crmBoardGet, crmBoardColumnCreate, crmBoardColumnUpdate, crmBoardColumnDelete, crmBoardColumnReorder,
  crmBoardCardCreate, crmBoardCardUpdate, crmBoardCardMove, crmBoardCardDelete, crmBoardCommentAdd,
];
