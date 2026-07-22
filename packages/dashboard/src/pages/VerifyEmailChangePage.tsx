import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../utils/api';

const WRAP = 'flex min-h-screen items-center justify-center bg-background p-6';
const CARD = 'w-full max-w-sm rounded-xl border border-border bg-card p-6 text-center';

export default function VerifyEmailChangePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    // Guard against React 18 StrictMode double-invoke: the token is single-use.
    if (ran.current) return;
    ran.current = true;

    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      setMessage('No confirmation token provided.');
      return;
    }

    apiFetch('/api/auth/verify-email-change', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error || 'Confirmation failed');
        setMessage(data.email ? `Your email is now ${data.email}.` : 'Your email address has been updated.');
        setStatus('success');
        // If this runs in the same browser as the session, reflect it immediately.
        refreshUser();
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err.message);
      });
  }, []);

  if (status === 'verifying') {
    return (
      <div className={WRAP}>
        <div className={`${CARD} flex items-center justify-center gap-2 text-sm text-muted-foreground`}>
          <Loader2 className="h-4 w-4 animate-spin" /> Confirming your new email…
        </div>
      </div>
    );
  }

  return (
    <div className={WRAP}>
      <div className={CARD}>
        <h3 className={`text-lg font-semibold ${status === 'error' ? 'text-destructive' : 'text-card-foreground'}`}>
          {status === 'error' ? 'Confirmation failed' : 'Email updated'}
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <Button className="mt-4 w-full" onClick={() => navigate('/account')}>
          Go to account
        </Button>
      </div>
    </div>
  );
}
