import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { DB_TYPES } from '../types';
import * as api from '../api/client';

export function AddSourceModal({ onClose, onAdded }: {
  onClose: () => void;
  onAdded: () => void;
}) {
  const [form, setForm] = useState({
    name: '',
    type: 'postgresql',
    host: '',
    port: '5432',
    database: '',
    user: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.addDatasource({
        name: form.name,
        type: form.type,
        host: form.type === 'sqlite' ? '' : form.host,
        port: parseInt(form.port) || 0,
        database: form.database,
        user: form.user,
        password: form.password,
        file_path: form.type === 'sqlite' ? form.host : undefined,
      });
      onAdded();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <form
        onSubmit={handleSubmit}
        className="relative bg-zinc-900 border border-zinc-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <Plus size={20} className="text-blue-500" />
            Новое подключение
          </h3>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-white cursor-pointer">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest mb-1 block">Название источника</label>
              <input
                required
                type="text"
                placeholder="e.g. Production DB"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-blue-500 transition-colors"
                value={form.name}
                onChange={e => set('name', e.target.value)}
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest mb-1 block">Тип СУБД</label>
              <select
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 focus:outline-none focus:border-blue-500 transition-colors"
                value={form.type}
                onChange={e => {
                  const t = DB_TYPES.find(t => t.id === e.target.value);
                  set('type', e.target.value);
                  if (t) set('port', String(t.port || ''));
                }}
              >
                {DB_TYPES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>

            {form.type !== 'sqlite' && (
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest mb-1 block">Порт</label>
                <input
                  type="text"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-blue-500 font-mono"
                  value={form.port}
                  onChange={e => set('port', e.target.value)}
                />
              </div>
            )}
          </div>

          {form.type !== 'sqlite' ? (
            <div className="space-y-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest mb-1 block">Хост / IP адрес</label>
                <input
                  required
                  type="text"
                  placeholder="127.0.0.1"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-blue-500 font-mono"
                  value={form.host}
                  onChange={e => set('host', e.target.value)}
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest mb-1 block">База данных</label>
                <input
                  required
                  type="text"
                  placeholder="mydb"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-blue-500 font-mono"
                  value={form.database}
                  onChange={e => set('database', e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest mb-1 block">Логин</label>
                  <input
                    type="text"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-blue-500"
                    value={form.user}
                    onChange={e => set('user', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest mb-1 block">Пароль</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-blue-500"
                    value={form.password}
                    onChange={e => set('password', e.target.value)}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div>
              <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest mb-1 block">Путь к файлу базы данных</label>
              <input
                required
                type="text"
                placeholder="/var/lib/data/db.sqlite"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-blue-500 font-mono text-xs"
                value={form.host}
                onChange={e => set('host', e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="p-6 bg-zinc-950/50 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl font-bold transition-colors cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold shadow-lg shadow-blue-900/20 transition-all disabled:opacity-50 cursor-pointer"
          >
            {loading ? 'Подключение...' : 'Подключить'}
          </button>
        </div>
      </form>
    </div>
  );
}
