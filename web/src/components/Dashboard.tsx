import { useState, useEffect, useCallback } from 'react';
import { Play, RefreshCw, ChevronDown, ChevronUp, Database } from 'lucide-react';
import { useSSE } from '../api/useEvents';
import { CheckResultDetail } from './CheckResultDetail';
import * as api from '../api/client';
import type { CheckResult, DSInfo } from '../types';
import { formatValue, formatDelta } from '../utils/format';

export function Dashboard() {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<CheckResult[]>([]);
  const [sources, setSources] = useState<DSInfo[]>([]);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<CheckResult | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Load last results + datasources on mount
  useEffect(() => {
    Promise.all([
      api.lastResults().catch(() => []),
      api.listDatasources().catch(() => []),
    ]).then(([r, s]) => {
      setResults(r ?? []);
      setSources(s ?? []);
      setLoaded(true);
    });
  }, []);

  // Live updates via SSE
  useSSE(useCallback((_event: string, data: unknown) => {
    const result = data as CheckResult;
    if (result?.check_id) {
      setResults(prev => {
        const idx = prev.findIndex(r => r.check_id === result.check_id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = result;
          return next;
        }
        return [...prev, result];
      });
      setSelected(prev => prev?.check_id === result.check_id ? result : prev);
    }
  }, []));

  const handleRunAll = async () => {
    setIsRunning(true);
    setError('');
    try {
      await api.runAllChecks();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to run checks');
    } finally {
      setIsRunning(false);
    }
  };

  if (selected) {
    return <CheckResultDetail result={selected} onBack={() => setSelected(null)} />;
  }

  const totalA = results.reduce((s, r) => s + (r.summary?.source_a_rows ?? 0), 0);
  const totalB = results.reduce((s, r) => s + (r.summary?.source_b_rows ?? 0), 0);
  const totalMismatches = results.reduce((s, r) => s + (r.summary?.mismatched_rows ?? 0) + (r.summary?.missing_in_a ?? 0) + (r.summary?.missing_in_b ?? 0), 0);
  const totalMatched = results.reduce((s, r) => s + (r.summary?.matched_rows ?? 0), 0);
  const accuracy = totalA > 0 ? ((totalMatched / totalA) * 100).toFixed(2) + '%' : '—';
  const lastRun = results.length > 0 ? results.reduce((latest, r) => {
    if (!r.run_at) return latest;
    return !latest || r.run_at > latest ? r.run_at : latest;
  }, '') : '';

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

      {/* Datasource status */}
      {loaded && sources.length > 0 && (
        <div className="flex items-center gap-4 mb-6">
          {sources.map(s => (
            <div key={s.name} className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2">
              <Database size={14} className="text-zinc-500" />
              <span className="text-sm font-medium">{s.name}</span>
              <span className="text-xs text-zinc-500">{s.type}</span>
              <div className={`w-2 h-2 rounded-full ${s.status === 'connected' ? 'bg-emerald-500' : 'bg-red-500'}`} />
            </div>
          ))}
        </div>
      )}

      <div className="space-y-8">
        {/* Stats cards — show when we have results */}
        {results.length > 0 && (
          <>
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

            {/* Last run timestamp */}
            {lastRun && (
              <p className="text-zinc-600 text-xs">
                Последний запуск: {new Date(lastRun).toLocaleString()}
              </p>
            )}
          </>
        )}

        {/* Results list */}
        {results.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-zinc-800">
              <h3 className="font-bold">Результаты проверок</h3>
            </div>
            <div className="divide-y divide-zinc-800">
              {results.map((r, i) => {
                const issues = (r.summary?.mismatched_rows ?? 0) + (r.summary?.missing_in_a ?? 0) + (r.summary?.missing_in_b ?? 0) + (r.summary?.duplicates_in_a ?? 0) + (r.summary?.duplicates_in_b ?? 0);
                const isExpanded = expanded === r.check_id;
                return (
                  <div key={i}>
                    <div className="p-4 flex items-center justify-between hover:bg-zinc-800/30 transition-colors">
                      <button
                        onClick={() => setSelected(r)}
                        className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer hover:opacity-80 transition-opacity text-left"
                      >
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${r.status === 'ok' ? 'bg-emerald-500' : r.status === 'warning' ? 'bg-amber-500' : 'bg-red-500'}`} />
                        <span className="font-medium truncate">{r.check_name || r.check_id}</span>
                      </button>
                      <div className="flex items-center gap-2 ml-4">
                        {issues > 0 && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 border border-red-500/20">
                            {issues}
                          </span>
                        )}
                        <span className="text-zinc-500 text-sm font-mono">{r.duration}</span>
                        <span className={`text-xs font-bold ${r.status === 'ok' ? 'text-emerald-500' : 'text-red-500'}`}>
                          {r.status.toUpperCase()}
                        </span>
                        <button
                          onClick={() => setExpanded(isExpanded ? null : r.check_id)}
                          className="p-1 hover:bg-zinc-700 rounded transition-colors cursor-pointer"
                        >
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </div>
                    </div>
                    {isExpanded && r.summary && (
                      <div className="px-4 pb-4 border-t border-zinc-800/50">
                        <div className="grid grid-cols-4 gap-4 mt-3 text-sm">
                          <div><span className="text-zinc-500">Строк A:</span> {r.summary.source_a_rows}</div>
                          <div><span className="text-zinc-500">Строк B:</span> {r.summary.source_b_rows}</div>
                          <div><span className="text-zinc-500">Совпало:</span> <span className="text-emerald-500">{r.summary.matched_rows}</span></div>
                          <div><span className="text-zinc-500">Расхождения:</span> <span className="text-red-500">{r.summary.mismatched_rows}</span></div>
                        </div>
                        {r.details && r.details.length > 0 && (
                          <div className="overflow-x-auto mt-3">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-zinc-500 text-xs border-b border-zinc-800">
                                  <th className="text-left py-2 pr-4">Тип</th>
                                  <th className="text-left py-2 pr-4">Ключ</th>
                                  <th className="text-left py-2 pr-4">Поле</th>
                                  <th className="text-left py-2 pr-4">A</th>
                                  <th className="text-left py-2 pr-4">B</th>
                                  <th className="text-left py-2">Delta</th>
                                </tr>
                              </thead>
                              <tbody className="font-mono text-xs">
                                {r.details.slice(0, 20).map((d, j) => (
                                  <tr key={j} className="border-b border-zinc-800/50">
                                    <td className="py-1.5 pr-4">
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                        d.type === 'missing' ? 'bg-amber-500/10 text-amber-500' :
                                        d.type === 'duplicate' ? 'bg-purple-500/10 text-purple-500' :
                                        'bg-red-500/10 text-red-500'
                                      }`}>{d.type}</span>
                                    </td>
                                    <td className="py-1.5 pr-4 text-zinc-400">{JSON.stringify(d.key_values)}</td>
                                    <td className="py-1.5 pr-4">{d.field}</td>
                                    <td className="py-1.5 pr-4">{formatValue(d.value_a)}</td>
                                    <td className="py-1.5 pr-4">{formatValue(d.value_b)}</td>
                                    <td className="py-1.5 text-amber-400">{formatDelta(d.delta)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {r.details.length > 20 && (
                              <button onClick={() => setSelected(r)} className="text-blue-400 text-xs mt-2 hover:underline cursor-pointer">
                                ...ещё {r.details.length - 20} — показать все
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {loaded && results.length === 0 && !error && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center text-zinc-500">
            {sources.length === 0
              ? <p>Подключите источники данных для начала работы</p>
              : <p>Нажмите «Запустить всё» для первой проверки</p>
            }
          </div>
        )}
      </div>
    </div>
  );
}
