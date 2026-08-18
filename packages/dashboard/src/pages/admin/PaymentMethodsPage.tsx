import { useEffect, useState } from 'react';
import { CreditCard, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '../../utils/api';
import { useToast } from '../../components/Toast';

interface PaymentMethod {
  id: string;
  label: string;
  instructions: string;
  active: number;
  sort_order: number;
}

export default function PaymentMethodsPage() {
  const toast = useToast();
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState('');
  const [instructions, setInstructions] = useState('');

  async function load() {
    try {
      const res = await apiFetch('/api/projects/payment-methods');
      if (res.ok) setMethods(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function add() {
    if (!label.trim()) return;
    setSaving(true);
    try {
      const res = await apiFetch('/api/projects/payment-methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, instructions }),
      });
      if (res.ok) {
        setLabel(''); setInstructions('');
        await load();
        toast.success('Payment method added');
      } else {
        toast.error((await res.json().catch(() => ({}))).error || 'Could not add the method');
      }
    } finally {
      setSaving(false);
    }
  }

  async function patch(id: string, data: Partial<Omit<PaymentMethod, 'active'>> & { active?: boolean }) {
    const res = await apiFetch(`/api/projects/payment-methods/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) await load();
    else toast.error((await res.json().catch(() => ({}))).error || 'Could not save');
  }

  async function remove(id: string) {
    if (!confirm('Delete this payment method?')) return;
    const res = await apiFetch(`/api/projects/payment-methods/${id}`, { method: 'DELETE' });
    if (res.ok) { await load(); toast.success('Payment method deleted'); }
    // A method attached to an invoice cannot be deleted; the API explains why,
    // and that message is more useful than a generic failure.
    else toast.error((await res.json().catch(() => ({}))).error || 'Could not delete');
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading payment methods...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
          <CreditCard className="h-6 w-6" /> Payment Methods
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Define how clients can pay you. Choose which of these appear on each invoice when you
          create it — an invoice shows only the methods you attach to it.
        </p>
      </div>

      <Card className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="pm-label">Name</Label>
            <Input id="pm-label" value={label} placeholder="Bank Transfer"
                   onChange={(e) => setLabel(e.target.value)} />
          </div>
          <Button onClick={add} disabled={saving || !label.trim()}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Adding...</> : 'Add method'}
          </Button>
        </div>
        <div className="space-y-1">
          <Label htmlFor="pm-instructions">Instructions</Label>
          <Textarea id="pm-instructions" rows={3} value={instructions}
                    placeholder={'Account name: ...\nIBAN: ...\nReference: your invoice number'}
                    onChange={(e) => setInstructions(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            Shown to the client exactly as written, so format it the way you want it read.
          </p>
        </div>
      </Card>

      {methods.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No payment methods yet. Add one above and it becomes available to attach to invoices.
        </p>
      ) : (
        <div className="space-y-3">
          {methods.map((m) => (
            <Card key={m.id} className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Input className="max-w-xs font-medium" defaultValue={m.label}
                       onBlur={(e) => e.target.value.trim() !== m.label && patch(m.id, { label: e.target.value })} />
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch id={`active-${m.id}`} checked={m.active === 1}
                            onCheckedChange={(checked) => patch(m.id, { active: checked })} />
                    <Label htmlFor={`active-${m.id}`} className="text-sm">Active</Label>
                  </div>
                  <Button variant="destructive" size="xs" onClick={() => remove(m.id)}>
                    <Trash2 className="h-3 w-3" /> Delete
                  </Button>
                </div>
              </div>
              <Textarea rows={3} defaultValue={m.instructions}
                        onBlur={(e) => e.target.value !== m.instructions && patch(m.id, { instructions: e.target.value })} />
              {m.active !== 1 && (
                <p className="text-xs text-muted-foreground">
                  Inactive — hidden when creating new invoices. Invoices already using it are unchanged.
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
