import * as clientMessages from './clientMessage.service';
import * as notifications from './notification.service';

/**
 * Posts a staff message into a client's thread and tells the client, exactly
 * as the panel does. Shared by the REST route and the `crm_messages_send` tool
 * so an agent's message is never the one that silently fails to notify.
 */
export function sendStaffMessage(
  userId: string, clientId: string,
  input: { body: unknown; projectId?: unknown; invoiceId?: unknown },
): clientMessages.ClientMessageView {
  const message = clientMessages.postStaffMessage(userId, clientId, input);
  void notifications.notifyClient(clientId, {
    kind: 'message.fromStaff',
    subject: 'You have a new message',
    heading: `${message.author_label} wrote to you`,
    lines: [message.body],
    link: '/portal/messages',
  });
  return message;
}
