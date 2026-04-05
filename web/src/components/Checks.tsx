import { useState, useEffect, useCallback } from 'react';
import { Plus, Play, Trash2, ChevronDown, ChevronUp, PlayCircle, Pencil } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { AddCheckWizard } from './AddCheckWizard';
import * as api from '../api/client';
import { useSSE } from '../api/useEvents';
import type { CheckConfig, CheckResult, DSInfo } from '../types';
import { formatValue, formatDelta } from '../utils/format';

export function Checks() {
  const [checks, setChecks] = useState<CheckConfig[]>([]);
  const [sources, setSources] = useState<DSInfo[]>([]);
  const [results, setResults] = useState<Record<string, CheckResult>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [editingCheck, setEditingCheck] = useState<CheckConfig | undefined>(undefined);
  const [expandedResult, setExpandedResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [c, s] = await Promise.all([api.listChecks(), api.listDatasources()]);
      setChecks(c ?? []);
      setSources(s ?? []);
    } catch {
      // backend offline
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Live updates via SSE
  useSSE(useCallback((_event: string, data: unknown) => {
    const result = data as CheckResult;
    if (result?.check_id) {
      setResults(prev => ({ ...prev, [result.check_id]: result }));
    }
  }, []));

  const handleRun = async (id: string) => {
    try {
      const res = await api.runCheck(id);
      setResults(prev => ({ ...prev, [id]: res }));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Run failed');
    }
  };

  const handleRemove = async (id: string) => {
    if (!confirm('Удалить проверку?')) return;
    await api.removeCheck(id);
    load();
  };

  return (
    <div>
      <header className="flex justify-between items-end mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Все проверки</h2>
          <p className="text-zinc-500 mt-1">Настройка и запуск сверок между источниками</p>
        </div>
        {!showAdd && (
          <div className="flex items-center gap-2">
            {checks.length > 0 && (
              <button
                onClick={async () => { api.runAllChecks(); }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-bold bg-emerald-600 hover:bg-emerald-500 transition-all cursor-pointer"
              >
                <PlayCircle size={18} /> Запустить все
              </button>
            )}
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-bold bg-blue-600 hover:bg-blue-500 transition-all cursor-pointer"
            >
              <Plus size={18} /> Добавить проверку
            </button>
          </div>
        )}
      </header>

      {showAdd && (
        <AddCheckWizard
          sources={sources}
          editCheck={editingCheck}
          onAdded={() => { setShowAdd(false); setEditingCheck(undefined); load(); }}
          onCancel={() => { setShowAdd(false); setEditingCheck(undefined); }}
        />
      )}

      {loading ? (
        <p className="text-zinc-500">Загрузка...</p>
      ) : checks.length === 0 && !showAdd ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center text-zinc-500">
          <p>Нет проверок. Добавьте первую.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {checks.map(check => {
            const result = results[check.id];
            const expanded = expandedResult === check.id;
            return (
              <div key={check.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="p-5 flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    {result && <StatusBadge status={result.status} />}
                    <div className="min-w-0">
                      <h4 className="font-bold truncate">{check.name}</h4>
                      <p className="text-zinc-500 text-xs font-mono">
                        {check.source_a.datasource}:{check.source_a.table} vs {check.source_b.datasource}:{check.source_b.table} ({check.mode})
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {result && (
                      <button
                        onClick={() => setExpandedResult(expanded ? null : check.id)}
                        className="bg-zinc-800 hover:bg-zinc-700 text-xs py-2 px-3 rounded-md font-bold transition-colors cursor-pointer"
                      >
                        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    )}
                    <button
                      onClick={() => { setEditingCheck(check); setShowAdd(true); }}
                      className="bg-zinc-800 hover:bg-zinc-700 text-xs py-2 px-3 rounded-md transition-colors cursor-pointer"
                      title="Редактировать"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleRun(check.id)}
                      className="flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 text-xs py-2 px-3 rounded-md font-bold transition-colors cursor-pointer"
                    >
                      <Play size={14} /> Run
                    </button>
                    <button
                      onClick={() => handleRemove(check.id)}
                      className="bg-zinc-800 hover:bg-red-900/50 text-xs py-2 px-3 rounded-md transition-colors cursor-pointer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {expanded && result && (
                  <div className="border-t border-zinc-800 p-5">
                    <div className="grid grid-cols-4 gap-4 mb-4 text-sm">
                      <div><span className="text-zinc-500">Строк A:</span> {result.summary.source_a_rows}</div>
                      <div><span className="text-zinc-500">Строк B:</span> {result.summary.source_b_rows}</div>
                      <div><span className="text-zinc-500">Совпало:</span> <span className="text-emerald-500">{result.summary.matched_rows}</span></div>
                      <div><span className="text-zinc-500">Расхождения:</span> <span className="text-red-500">{result.summary.mismatched_rows}</span></div>
                    </div>
                    {result.details && result.details.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-zinc-500 text-xs border-b border-zinc-800">
                              <th className="text-left py-2 pr-4">Тип</th>
                              <th className="text-left py-2 pr-4">Ключ</th>
                              <th className="text-left py-2 pr-4">Поле</th>
                              <th className="text-left py-2 pr-4">Значение A</th>
                              <th className="text-left py-2 pr-4">Значение B</th>
                              <th className="text-left py-2">Delta</th>
                            </tr>
                          </thead>
                          <tbody className="font-mono text-xs">
                            {result.details.slice(0, 50).map((d, i) => (
                              <tr key={i} className="border-b border-zinc-800/50">
                                <td className="py-2 pr-4">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    d.type === 'missing' ? 'bg-amber-500/10 text-amber-500' :
                                    d.type === 'duplicate' ? 'bg-purple-500/10 text-purple-500' :
                                    'bg-red-500/10 text-red-500'
                                  }`}>{d.type}</span>
                                </td>
                                <td className="py-2 pr-4 text-zinc-400">{JSON.stringify(d.key_values)}</td>
                                <td className="py-2 pr-4">{d.field}</td>
                                <td className="py-2 pr-4">{formatValue(d.value_a)}</td>
                                <td className="py-2 pr-4">{formatValue(d.value_b)}</td>
                                <td className="py-2 text-amber-400">{formatDelta(d.delta)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {result.details.length > 50 && (
                          <p className="text-zinc-500 text-xs mt-2 p-2">...и ещё {result.details.length - 50} расхождений</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
