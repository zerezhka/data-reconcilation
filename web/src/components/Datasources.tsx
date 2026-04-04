import { useState, useEffect, useCallback } from 'react';
import { Database, Plus, Trash2 } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { AddSourceModal } from './AddSourceModal';
import * as api from '../api/client';
import type { DSInfo } from '../types';

export function Datasources() {
  const [sources, setSources] = useState<DSInfo[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api.listDatasources();
      setSources(data ?? []);
    } catch {
      // backend not running yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleTest = async (name: string) => {
    const res = await api.testDatasource(name);
    alert(res.status === 'ok' ? `${name}: OK` : `${name}: ${res.error}`);
  };

  const handleRemove = async (name: string) => {
    if (!confirm(`Удалить "${name}"?`)) return;
    await api.removeDatasource(name);
    load();
  };

  return (
    <div>
      <header className="flex justify-between items-end mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Источники данных</h2>
          <p className="text-zinc-500 mt-1">Управление подключениями к базам данных</p>
        </div>
      </header>

      {loading ? (
        <p className="text-zinc-500">Загрузка...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sources.map(ds => (
            <div key={ds.name} className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl relative group">
              <div className={`absolute top-0 right-0 w-1 h-full rounded-r-xl ${ds.status === 'connected' ? 'bg-emerald-500' : 'bg-red-500'}`} />
              <div className="flex justify-between items-start mb-6">
                <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800 text-blue-500">
                  <Database size={24} />
                </div>
                <StatusBadge status={ds.status === 'connected' ? 'ok' : 'error'} />
              </div>
              <h4 className="text-lg font-bold">{ds.name}</h4>
              <p className="text-zinc-500 text-xs font-mono mb-6">{ds.type}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleTest(ds.name)}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-xs py-2 rounded-md font-bold transition-colors cursor-pointer"
                >
                  Test
                </button>
                <button
                  onClick={() => handleRemove(ds.name)}
                  className="bg-zinc-800 hover:bg-red-900/50 text-xs py-2 px-3 rounded-md font-bold transition-colors cursor-pointer"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}

          <button
            onClick={() => setIsModalOpen(true)}
            className="border-2 border-dashed border-zinc-800 rounded-xl p-8 flex flex-col items-center justify-center text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-all group cursor-pointer"
          >
            <div className="w-12 h-12 rounded-full bg-zinc-900 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <Plus size={24} />
            </div>
            <span className="font-bold">Добавить источник</span>
          </button>
        </div>
      )}

      {isModalOpen && (
        <AddSourceModal onClose={() => setIsModalOpen(false)} onAdded={load} />
      )}
    </div>
  );
}
