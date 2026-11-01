import { z } from 'zod';
import * as clientMessages from '../../services/clientMessage.service';
import * as notifications from '../../services/notification.service';
import { sendStaffMessage } from '../../services/staffMessaging';
import { defineTool, type ToolDef } from '../registry';

const clientId = z.string().min(1).describe('Client id, from crm_clients_list.');

const messageSchema = z.object({
  id: z.string(), authorType: z.string(), author: z.string(), body: z.string(),
  projectId: z.string().nullable(), projectName: z.string().nullable(), invoiceId: z.string().nullable(), invoiceNumber: z.string().nullable(), createdAt: z.string(),
});
const toMessage = (m: clientMessages.ClientMessageView) => ({
  id: m.id, authorType: m.author_type, author: m.author_label, body: m.body, projectId: m.project_id, projectName: m.project_name,
  invoiceId: m.invoice_id, invoiceNumber: m.invoice_number, createdAt: m.created_at,
});

export const crmMessagesList = defineTool({
  name: 'crm_messages_list',
  title: 'Read a client conversation',
  description: 'Returns the whole message thread with one of your clients, oldest first. Requires crm:read.',
  scope: 'crm:read', feature: 'projects',
  annotations: { readOnlyHint: true, idempotentHint: true },
  input: z.object({ clientId }),
  output: z.object({ messages: z.array(messageSchema) }),
  handler: ({ clientId: id }, ctx) => ({ messages: clientMessages.listStaffClientMessages(ctx.userId, id).map(toMessage) }),
});

export const crmMessagesSend = defineTool({
  name: 'crm_messages_send',
  title: 'Message a client',
  description: 'Posts a message to one of your clients. They are notified by email. It is sent as you, so confirm the wording with the user first. Optionally reference one of that client’s projects or invoices. Requires crm:write.',
  scope: 'crm:write', feature: 'projects', writeBucket: 'crm',
  annotations: { destructiveHint: true },
  input: z.object({
    clientId,
    body: z.string().min(1).max(5000),
    projectId: z.string().optional().describe('A project of this client to reference.'),
    invoiceId: z.string().optional().describe('An invoice of this client to reference.'),
  }),
  output: z.object({ message: messageSchema }),
  handler: ({ clientId: id, ...input }, ctx) => ({ message: toMessage(sendStaffMessage(ctx.userId, id, input)) }),
});

export const notificationsList = defineTool({
  name: 'notifications_list',
  title: 'Read my notifications',
  description: 'Returns your Mini CRM notifications (newest 50) and how many are unread in total. Requires crm:read.',
  scope: 'crm:read', feature: 'projects',
  annotations: { readOnlyHint: true, idempotentHint: true },
  input: z.object({ unreadOnly: z.boolean().optional() }),
  output: z.object({
    items: z.array(z.object({ id: z.string(), kind: z.string(), subject: z.string(), body: z.string(), link: z.string().nullable(), createdAt: z.string(), readAt: z.string().nullable() })),
    unread: z.number(),
  }),
  handler: ({ unreadOnly }, ctx) => {
    const inbox = notifications.getInbox('staff', ctx.userId, { unreadOnly });
    return {
      items: inbox.items.map((i) => ({ id: i.id, kind: i.kind, subject: i.subject, body: i.body, link: i.link, createdAt: i.created_at, readAt: i.read_at })),
      unread: inbox.unread,
    };
  },
});

export const notificationsMarkRead = defineTool({
  name: 'notifications_mark_read',
  title: 'Mark notifications read',
  description: 'Marks the given notifications read, or all of yours when no ids are passed. Requires crm:write.',
  scope: 'crm:write', feature: 'projects', writeBucket: 'crm',
  annotations: { idempotentHint: true },
  input: z.object({ ids: z.array(z.string()).max(200).optional() }),
  output: z.object({ marked: z.number() }),
  handler: ({ ids }, ctx) => ({ marked: notifications.markRead('staff', ctx.userId, ids) }),
});

export const crmMessageTools: ToolDef[] = [crmMessagesList, crmMessagesSend, notificationsList, notificationsMarkRead];
