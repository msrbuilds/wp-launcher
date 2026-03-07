import { useState, useEffect } from 'react';

interface CountdownTimerProps {
  expiresAt: string;
}

function formatTime(ms: number): string {
  if (ms <= 0) return 'Expired';

  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  const secs = Math.floor((ms % 60000) / 1000);

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${String(mins).padStart(2, '0')}m`);
  parts.push(`${String(secs).padStart(2, '0')}s`);

  return parts.join(' ');
}

export default function CountdownTimer({ expiresAt }: CountdownTimerProps) {
  const neverExpires = new Date(expiresAt).getFullYear() >= 9999;

  const [remaining, setRemaining] = useState(() =>
    new Date(expiresAt).getTime() - Date.now(),
  );

  useEffect(() => {
    if (neverExpires) return;
    const timer = setInterval(() => {
      setRemaining(new Date(expiresAt).getTime() - Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, [expiresAt, neverExpires]);

  if (neverExpires) {
    return <span className="countdown">Never expires</span>;
  }

  const totalMins = remaining / 60000;
  let className = 'countdown';
  if (totalMins <= 5) className += ' danger';
  else if (totalMins <= 30) className += ' warning';

  return <span className={className}>{formatTime(remaining)}</span>;
}
