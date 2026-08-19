import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAdminHeaders } from './AdminLayout';
import MessageThread from '../../components/MessageThread';

/** The staff side of a client's conversation. */
export default function ClientMessagesDialog({ clientId, clientName, open, onOpenChange }: {
  clientId: string; clientName: string; open: boolean; onOpenChange: (v: boolean) => void;
}) {
  const headers = useAdminHeaders();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Messages — {clientName}</DialogTitle>
        </DialogHeader>
        <MessageThread
          endpoint={`/api/projects/clients/${clientId}/messages`}
          side="staff"
          extraHeaders={headers}
          emptyText="Nothing has been said yet."
        />
      </DialogContent>
    </Dialog>
  );
}
