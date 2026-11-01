import { z } from 'zod';
import * as projectService from '../../services/project.service';
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

export const crmClientTools: ToolDef[] = [crmClientsList];
