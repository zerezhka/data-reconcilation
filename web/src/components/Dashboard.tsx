import { useState } from 'react';
import { Play, RefreshCw } from 'lucide-react';
import * as api from '../api/client';
import type { CheckResult } from '../types';

export function Dashboard() {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<CheckResult[]>([]);
  const [error, setError] = useState('');

  const handleRunAll = async () => {
    setIsRunning(true);
    setError('');
    try {
      const res = await api.runAllChecks();
      setResults(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to run checks');
    } finally {
      setIsRunning(false);
    }
  };

  const totalA = results.reduce((s, r) => s + (r.summary?.source_a_rows ?? 0), 0);
  const totalB = results.reduce((s, r) => s + (r.summary?.source_b_rows ?? 0), 0);
  const totalMismatches = results.reduce((s, r) => s + (r.summary?.mismatched_rows ?? 0) + (r.summary?.missing_in_a ?? 0) + (r.summary?.missing_in_b ?? 0), 0);
  const totalMatched = results.reduce((s, r) => s + (r.summary?.matched_rows ?? 0), 0);
  const accuracy = totalA > 0 ? ((totalMatched / totalA) * 100).toFixed(2) + '%' : '—';

  return (
    <div>
      <header className="flex justify-between items-end mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Обзор системы</h2>
          <p className="text-zinc-500 mt-1">Мониторинг расхождений данных в реальном времени</p>
        </div>
        <button
          onClick={handleRunAll}
          disabled={isRunning}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold bg-white text-black hover:bg-zinc-200 transition-all disabled:opacity-50 cursor-pointer"
        >
          {isRunning ? <RefreshCw size={18} className="animate-spin" /> : <Play size={18} fill="currentColor" />}
          {isRunning ? 'Запуск...' : 'Запустить всё'}
        </button>
      </header>

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">{error}</div>
      )}

      <div className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: 'Всего строк (A)', val: totalA.toLocaleString() || '—' },
            { label: 'Всего строк (B)', val: totalB.toLocaleString() || '—' },
            { label: 'Расхождения', val: totalMismatches.toLocaleString(), color: totalMismatches > 0 ? 'red' : undefined },
            { label: 'Точность', val: accuracy, color: 'emerald' },
          ].map((s, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 p-5 rounded-xl">
              <p className="text-zinc-500 text-[10px] uppercase font-black tracking-widest mb-1">{s.label}</p>
              <p className={`text-2xl font-mono font-bold ${s.color === 'red' ? 'text-red-500' : s.color === 'emerald' ? 'text-emerald-500' : ''}`}>
                {s.val}
              </p>
            </div>
          ))}
        </div>

        {results.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-zinc-800">
              <h3 className="font-bold">Результаты проверок</h3>
            </div>
            <div className="divide-y divide-zinc-800">
              {results.map((r, i) => (
                <div key={i} className="p-4 flex items-center justify-between hover:bg-zinc-800/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${r.status === 'ok' ? 'bg-emerald-500' : r.status === 'warning' ? 'bg-amber-500' : 'bg-red-500'}`} />
                    <span className="font-medium">{r.check_name || r.check_id}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-zinc-500 text-sm font-mono">{r.duration}</span>
                    <span className={`text-xs font-bold ${r.status === 'ok' ? 'text-emerald-500' : 'text-red-500'}`}>
                      {r.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {results.length === 0 && !error && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center text-zinc-500">
            <p>Добавьте проверки и нажмите «Запустить всё»</p>
          </div>
        )}
      </div>
    </div>
  );
}
