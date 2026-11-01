import { z } from 'zod';
import * as projectService from '../../services/project.service';
import { siteForUserOrFail } from '../../services/siteAccess';
import { NotFoundError } from '../../utils/errors';
import { defineTool, type ToolDef } from '../registry';

export const clientSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  company: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export function toClientView(c: projectService.ClientRecord) {
  return { id: c.id, name: c.name, email: c.email, phone: c.phone, company: c.company, notes: c.notes, createdAt: c.created_at, updatedAt: c.updated_at };
}

export const crmClientsList = defineTool({
  name: 'crm_clients_list',
  title: 'List clients',
  description: 'Lists your Mini CRM clients, newest first, with how many projects each has. Requires crm:read.',
  scope: 'crm:read',
  feature: 'projects',
  annotations: { readOnlyHint: true, idempotentHint: true },
  input: z.object({
    search: z.string().optional().describe('Match against client name, email or company.'),
    limit: z.number().int().min(1).max(100).optional().describe('Page size, 1–100 (default 50).'),
    offset: z.number().int().min(0).optional().describe('Rows to skip for paging.'),
  }),
  output: z.object({ clients: z.array(clientSchema.extend({ projectCount: z.number() })), total: z.number() }),
  handler: ({ search, limit, offset }, ctx) => ({
    clients: projectService.listClients(ctx.userId, { search, limit: limit ?? 50, offset }).map((c) => ({ ...toClientView(c), projectCount: c.projectCount })),
    total: projectService.getClientsCount(ctx.userId, search),
  }),
});

const clientId = z.string().min(1).describe('Client id, from crm_clients_list.');
const projectId = z.string().min(1).describe('Project id, from crm_projects_list.');
const clientFields = {
  name: z.string().min(1).max(200),
  email: z.string().max(200).optional(),
  phone: z.string().max(50).optional(),
  company: z.string().max(200).optional(),
  notes: z.string().max(5000).optional(),
};

function clientOrFail(id: string, userId: string) {
  const client = projectService.getClient(id, userId);
  if (!client) throw new NotFoundError('Client not found');
  return client;
}

export const crmClientsGet = defineTool({
  name: 'crm_clients_get',
  title: 'Get a client',
  description: 'Returns one of your clients. Requires crm:read.',
  scope: 'crm:read', feature: 'projects',
  annotations: { readOnlyHint: true, idempotentHint: true },
  input: z.object({ clientId }),
  output: z.object({ client: clientSchema }),
  handler: ({ clientId: id }, ctx) => ({ client: toClientView(clientOrFail(id, ctx.userId)) }),
});

export const crmClientsCreate = defineTool({
  name: 'crm_clients_create',
  title: 'Create a client',
  description: 'Adds a client to your Mini CRM. Requires crm:write.',
  scope: 'crm:write', feature: 'projects', writeBucket: 'crm',
  annotations: {},
  input: z.object(clientFields),
  output: z.object({ client: clientSchema }),
  handler: (args, ctx) => ({ client: toClientView(projectService.createClient(ctx.userId, args)) }),
});

export const crmClientsUpdate = defineTool({
  name: 'crm_clients_update',
  title: 'Update a client',
  description: 'Changes the fields you pass on one of your clients. Requires crm:write.',
  scope: 'crm:write', feature: 'projects', writeBucket: 'crm',
  annotations: { idempotentHint: true },
  input: z.object({ clientId, ...clientFields, name: clientFields.name.optional() }),
  output: z.object({ client: clientSchema }),
  handler: ({ clientId: id, ...data }, ctx) => ({ client: toClientView(projectService.updateClient(id, ctx.userId, data)) }),
});

export const crmClientsDelete = defineTool({
  name: 'crm_clients_delete',
  title: 'Delete a client',
  description: 'Deletes one of your clients, with their portal logins and message thread. Refused while the client still has projects or invoices. Cannot be undone; confirm with the user first. Requires crm:write.',
  scope: 'crm:write', feature: 'projects', writeBucket: 'crm',
  annotations: { destructiveHint: true },
  input: z.object({ clientId }),
  output: z.object({ deleted: z.literal(true) }),
  handler: ({ clientId: id }, ctx) => {
    projectService.deleteClient(id, ctx.userId);
    return { deleted: true as const };
  },
});

const projectSchema = z.object({
  id: z.string(), name: z.string(), description: z.string().nullable(), status: z.string(),
  clientId: z.string().nullable(), clientName: z.string().nullable(), siteCount: z.number(), createdAt: z.string(), updatedAt: z.string(),
});
const projectSiteSchema = z.object({ id: z.string(), subdomain: z.string(), status: z.string(), url: z.string().nullable(), expiresAt: z.string().nullable() });
const projectStatus = z.enum(['active', 'completed', 'on-hold', 'archived']);

function toProjectView(p: Record<string, any>) {
  return {
    id: p.id, name: p.name, description: p.description ?? null, status: p.status, clientId: p.client_id ?? null,
    clientName: p.clientName ?? null, siteCount: p.siteCount ?? 0, createdAt: p.created_at, updatedAt: p.updated_at,
  };
}

function projectOrFail(id: string, userId: string) {
  const project = projectService.getProject(id, userId);
  if (!project) throw new NotFoundError('Project not found');
  return project;
}

export const crmProjectsList = defineTool({
  name: 'crm_projects_list',
  title: 'List projects',
  description: 'Lists your Mini CRM projects. Requires crm:read.',
  scope: 'crm:read', feature: 'projects',
  annotations: { readOnlyHint: true, idempotentHint: true },
  input: z.object({
    status: projectStatus.optional(), clientId: z.string().optional().describe('Only this client’s projects.'),
    search: z.string().optional(), limit: z.number().int().min(1).max(100).optional(), offset: z.number().int().min(0).optional(),
  }),
  output: z.object({ projects: z.array(projectSchema), total: z.number() }),
  handler: ({ limit, ...filters }, ctx) => ({
    projects: projectService.listProjects(ctx.userId, { ...filters, limit: limit ?? 50 }).map(toProjectView),
    total: projectService.getProjectsCount(ctx.userId, filters),
  }),
});

export const crmProjectsGet = defineTool({
  name: 'crm_projects_get',
  title: 'Get a project',
  description: 'Returns one of your projects with its linked sites. Requires crm:read.',
  scope: 'crm:read', feature: 'projects',
  annotations: { readOnlyHint: true, idempotentHint: true },
  input: z.object({ projectId }),
  output: z.object({ project: projectSchema.extend({ sites: z.array(projectSiteSchema) }) }),
  handler: ({ projectId: id }, ctx) => {
    const project = projectOrFail(id, ctx.userId);
    const sites = projectService.getProjectSites(id, ctx.userId).map((s) => ({ id: s.id, subdomain: s.subdomain, status: s.status, url: s.site_url ?? null, expiresAt: s.expires_at ?? null }));
    return { project: { ...toProjectView(project), sites } };
  },
});

export const crmProjectsCreate = defineTool({
  name: 'crm_projects_create',
  title: 'Create a project',
  description: 'Creates a project, optionally for one of your clients. Requires crm:write.',
  scope: 'crm:write', feature: 'projects', writeBucket: 'crm',
  annotations: {},
  input: z.object({ name: z.string().min(1).max(200), clientId: z.string().optional(), description: z.string().max(5000).optional(), status: projectStatus.optional() }),
  output: z.object({ project: projectSchema }),
  handler: ({ clientId: cid, ...rest }, ctx) => {
    const created = projectService.createProject(ctx.userId, { ...rest, client_id: cid });
    return { project: toProjectView(projectOrFail(created.id, ctx.userId)) };
  },
});

export const crmProjectsUpdate = defineTool({
  name: 'crm_projects_update',
  title: 'Update a project',
  description: 'Changes the fields you pass on one of your projects. Pass clientId: null to detach the client. Requires crm:write.',
  scope: 'crm:write', feature: 'projects', writeBucket: 'crm',
  annotations: { idempotentHint: true },
  input: z.object({ projectId, name: z.string().min(1).max(200).optional(), clientId: z.string().nullable().optional(), description: z.string().max(5000).optional(), status: projectStatus.optional() }),
  output: z.object({ project: projectSchema }),
  handler: ({ projectId: id, clientId: cid, ...rest }, ctx) => {
    projectService.updateProject(id, ctx.userId, { ...rest, ...(cid !== undefined ? { client_id: cid } : {}) });
    return { project: toProjectView(projectOrFail(id, ctx.userId)) };
  },
});

export const crmProjectsDelete = defineTool({
  name: 'crm_projects_delete',
  title: 'Delete a project',
  description: 'Deletes one of your projects with its board. Linked sites are kept. Cannot be undone; confirm with the user first. Requires crm:write.',
  scope: 'crm:write', feature: 'projects', writeBucket: 'crm',
  annotations: { destructiveHint: true },
  input: z.object({ projectId }),
  output: z.object({ deleted: z.literal(true) }),
  handler: ({ projectId: id }, ctx) => {
    projectService.deleteProject(id, ctx.userId);
    return { deleted: true as const };
  },
});

export const crmProjectsLinkSite = defineTool({
  name: 'crm_projects_link_site',
  title: 'Link a site to a project',
  description: 'Attaches one of your sites to one of your projects. Requires crm:write.',
  scope: 'crm:write', feature: 'projects', writeBucket: 'crm',
  annotations: { idempotentHint: true },
  input: z.object({ projectId, siteId: z.string().min(1) }),
  output: z.object({ linked: z.literal(true) }),
  handler: ({ projectId: id, siteId }, ctx) => {
    siteForUserOrFail(siteId, ctx.userId);
    projectService.linkSiteToProject(id, siteId, ctx.userId);
    return { linked: true as const };
  },
});

export const crmProjectsUnlinkSite = defineTool({
  name: 'crm_projects_unlink_site',
  title: 'Unlink a site from a project',
  description: 'Detaches a site from one of your projects. The site itself is not touched. Requires crm:write.',
  scope: 'crm:write', feature: 'projects', writeBucket: 'crm',
  annotations: { idempotentHint: true },
  input: z.object({ projectId, siteId: z.string().min(1) }),
  output: z.object({ unlinked: z.literal(true) }),
  handler: ({ projectId: id, siteId }, ctx) => {
    projectService.unlinkSiteFromProject(id, siteId, ctx.userId);
    return { unlinked: true as const };
  },
});

export const crmClientTools: ToolDef[] = [
  crmClientsList, crmClientsGet, crmClientsCreate, crmClientsUpdate, crmClientsDelete,
  crmProjectsList, crmProjectsGet, crmProjectsCreate, crmProjectsUpdate, crmProjectsDelete, crmProjectsLinkSite, crmProjectsUnlinkSite,
];
