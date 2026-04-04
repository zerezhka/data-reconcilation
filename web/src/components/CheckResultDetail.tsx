import { ArrowLeft } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import type { CheckResult } from '../types';

export function CheckResultDetail({ result, onBack }: { result: CheckResult; onBack: () => void }) {
  const s = result.summary;
  const details = result.details ?? [];

  const stats = [
    { label: 'Строк A', value: s.source_a_rows },
    { label: 'Строк B', value: s.source_b_rows },
    { label: 'Совпало', value: s.matched_rows, color: 'text-emerald-500' },
    { label: 'Расхождения', value: s.mismatched_rows, color: s.mismatched_rows > 0 ? 'text-red-500' : '' },
    { label: 'Нет в A', value: s.missing_in_a, color: s.missing_in_a > 0 ? 'text-amber-500' : '' },
    { label: 'Нет в B', value: s.missing_in_b, color: s.missing_in_b > 0 ? 'text-amber-500' : '' },
    { label: 'Дубли в A', value: s.duplicates_in_a, color: s.duplicates_in_a > 0 ? 'text-purple-500' : '' },
    { label: 'Дубли в B', value: s.duplicates_in_b, color: s.duplicates_in_b > 0 ? 'text-purple-500' : '' },
  ];

  const mismatches = details.filter(d => d.type === 'mismatch');
  const missing = details.filter(d => d.type === 'missing');
  const duplicates = details.filter(d => d.type === 'duplicate');

  return (
    <div>
      <header className="mb-8">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors cursor-pointer mb-4"
        >
          <ArrowLeft size={16} /> Назад к обзору
        </button>
        <div className="flex items-center gap-4">
          <StatusBadge status={result.status} />
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{result.check_name || result.check_id}</h2>
            <p className="text-zinc-500 text-sm font-mono mt-1">
              {result.mode} &middot; {result.duration}
            </p>
          </div>
        </div>
      </header>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {stats.map((st, i) => (
          <div key={i} className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl">
            <p className="text-zinc-500 text-[10px] uppercase font-black tracking-widest mb-1">{st.label}</p>
            <p className={`text-xl font-mono font-bold ${st.color || ''}`}>
              {(st.value ?? 0).toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      {/* Mismatches */}
      {mismatches.length > 0 && (
        <Section title="Расхождения значений" count={mismatches.length} color="red">
          <DiscrepancyTable rows={mismatches} />
        </Section>
      )}

      {/* Missing rows */}
      {missing.length > 0 && (
        <Section title="Отсутствующие строки" count={missing.length} color="amber">
          <DiscrepancyTable rows={missing} />
        </Section>
      )}

      {/* Duplicates */}
      {duplicates.length > 0 && (
        <Section title="Дубликаты" count={duplicates.length} color="purple">
          <DiscrepancyTable rows={duplicates} />
        </Section>
      )}

      {details.length === 0 && result.status === 'ok' && (
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-8 text-center text-emerald-500">
          Все данные совпадают
        </div>
      )}
    </div>
  );
}

function Section({ title, count, color, children }: {
  title: string; count: number; color: string; children: React.ReactNode;
}) {
  const colorMap: Record<string, string> = {
    red: 'text-red-500 bg-red-500/10 border-red-500/20',
    amber: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    purple: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
  };
  const cls = colorMap[color] || '';

  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-3">
        <h3 className="font-bold text-lg">{title}</h3>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${cls}`}>{count}</span>
      </div>
      {children}
    </div>
  );
}

function DiscrepancyTable({ rows }: { rows: CheckResult['details'] }) {
  if (!rows || rows.length === 0) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-zinc-500 text-xs border-b border-zinc-800 bg-zinc-950/50">
              <th className="text-left py-3 px-4">Тип</th>
              <th className="text-left py-3 px-4">Ключ</th>
              <th className="text-left py-3 px-4">Поле</th>
              <th className="text-left py-3 px-4">Значение A</th>
              <th className="text-left py-3 px-4">Значение B</th>
              <th className="text-left py-3 px-4">Delta</th>
            </tr>
          </thead>
          <tbody className="font-mono text-xs">
            {rows.map((d, i) => (
              <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                <td className="py-2.5 px-4">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    d.type === 'missing' ? 'bg-amber-500/10 text-amber-500' :
                    d.type === 'duplicate' ? 'bg-purple-500/10 text-purple-500' :
                    'bg-red-500/10 text-red-500'
                  }`}>{d.type}</span>
                </td>
                <td className="py-2.5 px-4 text-zinc-400">
                  {d.key_values && Object.entries(d.key_values).map(([k, v]) => (
                    <span key={k} className="mr-2">
                      <span className="text-zinc-600">{k}=</span>{String(v)}
                    </span>
                  ))}
                </td>
                <td className="py-2.5 px-4 text-zinc-200">{d.field}</td>
                <td className="py-2.5 px-4">{formatValue(d.value_a)}</td>
                <td className="py-2.5 px-4">{formatValue(d.value_b)}</td>
                <td className="py-2.5 px-4 text-amber-400">{d.delta != null ? String(d.delta) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (v === '') return '(empty)';
  return String(v);
}
