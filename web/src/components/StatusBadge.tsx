import type { CheckStatus } from '../types';

const styles: Record<string, string> = {
  ok: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  warning: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  error: 'bg-red-500/10 text-red-500 border-red-500/20',
  connected: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
};

const labels: Record<string, string> = {
  ok: 'OK',
  warning: 'WARN',
  error: 'ERROR',
  connected: 'ONLINE',
};

export function StatusBadge({ status }: { status: CheckStatus | string }) {
  const key = status.startsWith('error') ? 'error' : status;
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${styles[key] ?? styles.error}`}>
      {labels[key] ?? status.toUpperCase()}
    </span>
  );
}
