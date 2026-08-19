import MessageThread from '../../components/MessageThread';
import NotificationPrefControl from '../../components/NotificationPrefControl';

/**
 * One conversation, not a per-project inbox: the client never has to decide
 * where a question belongs before asking it.
 */
export default function PortalMessagesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Messages</h1>
        <p className="text-sm text-muted-foreground">
          Anything about your projects or invoices — ask here and we will reply by email too.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 text-card-foreground">
        <MessageThread
          endpoint="/api/portal/messages"
          side="client"
          emptyText="No messages yet. Say hello."
        />
      </div>

      <div className="rounded-xl border border-border bg-card p-4 text-card-foreground">
        <h2 className="mb-1 text-base font-semibold">Email me</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          When something happens to your projects or invoices.
        </p>
        <NotificationPrefControl endpoint="/api/portal/notification-pref" />
      </div>
    </div>
  );
}
