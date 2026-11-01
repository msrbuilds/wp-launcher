import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { createSiteTestDb } from '../../test-helpers/sites';
import { __setDbForTesting } from '../../utils/db';
import { crmClientTools } from './crm-clients';
import { crmBoardTools } from './crm-board';
import { isEligible } from '../registry';
import type { McpAuthContext } from '../../oauth/token.service';

let db: Database.Database;
const ctx: McpAuthContext = { userId: 'owner', userEmail: 'owner@example.com', userRole: 'owner', grantId: 'g', clientId: 'c', clientName: 'App', scopes: ['crm:read', 'crm:write'] };
const all = () => [...crmClientTools, ...crmBoardTools];
const tool = (name: string) => all().find((t) => t.name === name)!;
const run = (name: string, args: Record<string, unknown>) => Promise.resolve().then(() => tool(name).handler(args as never, ctx));

beforeEach(() => {
  db = createSiteTestDb();
  __setDbForTesting(db);
  db.prepare("INSERT INTO settings (key, value) VALUES ('feature.projects', 'true')").run();
  db.prepare("INSERT INTO clients (id, user_id, name) VALUES ('c1', 'owner', 'Acme'), ('cx', 'alice', 'Theirs')").run();
  db.prepare("INSERT INTO projects (id, user_id, client_id, name, status) VALUES ('p1', 'owner', 'c1', 'Site build', 'active'), ('px', 'alice', 'cx', 'Their project', 'active')").run();
  db.prepare("INSERT INTO board_columns (id, project_id, name, position, client_visible) VALUES ('col1', 'p1', 'To do', 0, 0), ('col2', 'p1', 'Done', 1, 1), ('colx', 'px', 'Theirs', 0, 0)").run();
  db.prepare("INSERT INTO board_cards (id, project_id, column_id, title, position, labels) VALUES ('card1', 'p1', 'col1', 'Header', 0, '[]'), ('cardx', 'px', 'colx', 'Theirs', 0, '[]')").run();
  db.prepare("INSERT INTO sites (id, subdomain, user_id, blueprint_id, expires_at, status) VALUES ('mine', 'mine', 'owner', 'demo', '2099-01-01', 'running'), ('theirs', 'theirs', 'alice', 'demo', '2099-01-01', 'running')").run();
});
afterEach(() => { __setDbForTesting(null); db.close(); });

describe('catalogue', () => {
  it('has every CRM client, project and board tool the spec lists, all gated on projects', () => {
    const names = all().map((t) => t.name).sort();
    expect(names).toEqual([
      'crm_board_card_create', 'crm_board_card_delete', 'crm_board_card_move', 'crm_board_card_update',
      'crm_board_column_create', 'crm_board_column_delete', 'crm_board_column_reorder', 'crm_board_column_update',
      'crm_board_comment_add', 'crm_board_get',
      'crm_clients_create', 'crm_clients_delete', 'crm_clients_get', 'crm_clients_list', 'crm_clients_update',
      'crm_projects_create', 'crm_projects_delete', 'crm_projects_get', 'crm_projects_link_site', 'crm_projects_list', 'crm_projects_unlink_site', 'crm_projects_update',
    ]);
    for (const t of all()) {
      expect(t.feature, t.name).toBe('projects');
      expect(t.scope, t.name).toBe(t.annotations.readOnlyHint ? 'crm:read' : 'crm:write');
      if (t.scope === 'crm:write') expect(t.writeBucket, t.name).toBe('crm');
    }
    for (const n of ['crm_clients_delete', 'crm_projects_delete', 'crm_board_column_delete', 'crm_board_card_delete']) {
      expect(tool(n).annotations.destructiveHint, n).toBe(true);
    }
  });

  it('every tool is ineligible while projects is off', () => {
    db.prepare("UPDATE settings SET value = 'false' WHERE key = 'feature.projects'").run();
    for (const t of all()) expect(isEligible(t, ctx), t.name).toBe(false);
  });
});

describe('ownership', () => {
  it('another user’s client, project or card is not found and nothing changes', async () => {
    await expect(run('crm_clients_get', { clientId: 'cx' })).rejects.toThrow(/Client not found/);
    await expect(run('crm_clients_update', { clientId: 'cx', name: 'Mine now' })).rejects.toThrow(/not found/i);
    await expect(run('crm_projects_get', { projectId: 'px' })).rejects.toThrow(/Project not found/);
    await expect(run('crm_projects_delete', { projectId: 'px' })).rejects.toThrow(/not found/i);
    await expect(run('crm_board_get', { projectId: 'px' })).rejects.toThrow(/not found/i);
    await expect(run('crm_board_card_update', { cardId: 'cardx', title: 'x' })).rejects.toThrow(/not found/i);
    await expect(run('crm_board_comment_add', { cardId: 'cardx', body: 'hi' })).rejects.toThrow(/not found/i);
    expect(db.prepare("SELECT name FROM clients WHERE id = 'cx'").get()).toEqual({ name: 'Theirs' });
    expect(db.prepare("SELECT title FROM board_cards WHERE id = 'cardx'").get()).toEqual({ title: 'Theirs' });
    expect(db.prepare('SELECT COUNT(*) AS n FROM card_comments').get()).toEqual({ n: 0 });
  });

  it('linking someone else’s site is "Site not found"', async () => {
    await expect(run('crm_projects_link_site', { projectId: 'p1', siteId: 'theirs' })).rejects.toThrow(/^Site not found$/);
    expect(db.prepare('SELECT COUNT(*) AS n FROM project_sites').get()).toEqual({ n: 0 });
  });

  it('a card cannot move into another project’s column', async () => {
    await expect(run('crm_board_card_move', { cardId: 'card1', toColumnId: 'colx', toIndex: 0 })).rejects.toThrow();
    expect(db.prepare("SELECT column_id FROM board_cards WHERE id = 'card1'").get()).toEqual({ column_id: 'col1' });
  });
});

describe('happy paths', () => {
  it('creates a client and a project, links a site and reads the board', async () => {
    const { client } = await run('crm_clients_create', { name: 'Globex', email: 'ops@globex.test' }) as { client: { id: string } };
    const { project } = await run('crm_projects_create', { name: 'Launch', clientId: client.id }) as { project: { id: string } };
    await run('crm_projects_link_site', { projectId: project.id, siteId: 'mine' });
    const got = await run('crm_projects_get', { projectId: project.id }) as { project: { sites: { id: string }[] } };
    expect(got.project.sites.map((s) => s.id)).toEqual(['mine']);
    const board = await run('crm_board_get', { projectId: 'p1' }) as { columns: { id: string; cards: { id: string; labels: string[] }[] }[] };
    expect(board.columns.map((c) => c.id)).toEqual(['col1', 'col2']);
    expect(board.columns[0].cards[0]).toMatchObject({ id: 'card1', labels: [] });
  });

  it('moves a card and adds a comment', async () => {
    await run('crm_board_card_move', { cardId: 'card1', toColumnId: 'col2', toIndex: 0 });
    expect(db.prepare("SELECT column_id FROM board_cards WHERE id = 'card1'").get()).toEqual({ column_id: 'col2' });
    const { comment } = await run('crm_board_comment_add', { cardId: 'card1', body: 'Shipped' }) as { comment: { body: string } };
    expect(comment.body).toBe('Shipped');
  });
});
