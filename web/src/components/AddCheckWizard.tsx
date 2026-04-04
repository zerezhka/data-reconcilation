import { useState, useEffect } from 'react';
import { ArrowRight, ArrowLeft, Zap, Link2, Unlink, Key, Check } from 'lucide-react';
import * as api from '../api/client';
import type { DSInfo, TableInfo, ColumnInfo, CheckMode } from '../types';

type Step = 'sources' | 'fields' | 'review';

interface FieldPair {
  fieldA: string;
  fieldB: string;
}

export function AddCheckWizard({ sources, onAdded, onCancel }: {
  sources: DSInfo[];
  onAdded: () => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<Step>('sources');

  // Step 1: sources & tables
  const [srcA, setSrcA] = useState('');
  const [srcB, setSrcB] = useState('');
  const [tablesA, setTablesA] = useState<TableInfo[]>([]);
  const [tablesB, setTablesB] = useState<TableInfo[]>([]);
  const [tableA, setTableA] = useState('');
  const [tableB, setTableB] = useState('');

  // Step 2: fields & mapping
  const [schemaA, setSchemaA] = useState<ColumnInfo[]>([]);
  const [schemaB, setSchemaB] = useState<ColumnInfo[]>([]);
  const [mappings, setMappings] = useState<FieldPair[]>([]);
  const [keyFields, setKeyFields] = useState<string[]>([]);
  const [pendingA, setPendingA] = useState<string | null>(null);

  // Step 3: review
  const [name, setName] = useState('');
  const [mode, setMode] = useState<CheckMode>('row_level');
  const [tolerance, setTolerance] = useState('0');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Load tables when source changes
  useEffect(() => {
    if (!srcA) { setTablesA([]); return; }
    api.listTables(srcA).then(setTablesA).catch(() => setTablesA([]));
  }, [srcA]);

  useEffect(() => {
    if (!srcB) { setTablesB([]); return; }
    api.listTables(srcB).then(setTablesB).catch(() => setTablesB([]));
  }, [srcB]);

  // Load schema when table changes
  useEffect(() => {
    if (!srcA || !tableA) { setSchemaA([]); return; }
    api.getTableSchema(srcA, tableA).then(setSchemaA).catch(() => setSchemaA([]));
  }, [srcA, tableA]);

  useEffect(() => {
    if (!srcB || !tableB) { setSchemaB([]); return; }
    api.getTableSchema(srcB, tableB).then(setSchemaB).catch(() => setSchemaB([]));
  }, [srcB, tableB]);

  // Auto-generate name
  useEffect(() => {
    if (tableA && tableB) {
      setName(`${tableA} vs ${tableB}`);
    }
  }, [tableA, tableB]);

  const canGoToFields = srcA && srcB && tableA && tableB;

  const handleAutoMap = () => {
    const newMappings: FieldPair[] = [];
    for (const a of schemaA) {
      const match = schemaB.find(b => b.name.toLowerCase() === a.name.toLowerCase());
      if (match) {
        newMappings.push({ fieldA: a.name, fieldB: match.name });
      }
    }
    setMappings(newMappings);
    // auto-set primary keys as key fields
    const pks = schemaA.filter(c => c.primary_key).map(c => c.name);
    if (pks.length > 0) setKeyFields(pks);
  };

  const handleFieldClickA = (fieldName: string) => {
    // If already mapped, remove the mapping
    const existing = mappings.findIndex(m => m.fieldA === fieldName);
    if (existing >= 0) {
      setMappings(prev => prev.filter((_, i) => i !== existing));
      setPendingA(null);
      return;
    }
    setPendingA(fieldName);
  };

  const handleFieldClickB = (fieldName: string) => {
    if (!pendingA) {
      // If clicking B without pending A, remove existing mapping for this B
      setMappings(prev => prev.filter(m => m.fieldB !== fieldName));
      return;
    }
    // Remove any existing mapping for either field
    setMappings(prev => prev.filter(m => m.fieldA !== pendingA && m.fieldB !== fieldName));
    setMappings(prev => [...prev, { fieldA: pendingA, fieldB: fieldName }]);
    setPendingA(null);
  };

  const toggleKeyField = (field: string) => {
    setKeyFields(prev =>
      prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field]
    );
  };

  const getMappedB = (fieldA: string) => mappings.find(m => m.fieldA === fieldA)?.fieldB;
  const getMappedA = (fieldB: string) => mappings.find(m => m.fieldB === fieldB)?.fieldA;
  const isMappedA = (f: string) => mappings.some(m => m.fieldA === f);
  const isMappedB = (f: string) => mappings.some(m => m.fieldB === f);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const fieldMap: Record<string, string> = {};
    mappings.forEach(m => { if (m.fieldA !== m.fieldB) fieldMap[m.fieldA] = m.fieldB; });

    const compareFields = mappings.filter(m => !keyFields.includes(m.fieldA)).map(m => m.fieldA);
    const compareFieldsB = mappings.filter(m => !keyFields.includes(m.fieldA)).map(m => m.fieldB);

    try {
      await api.addCheck({
        id,
        name,
        mode,
        source_a: { datasource: srcA, table: tableA, fields: compareFields },
        source_b: { datasource: srcB, table: tableB, fields: compareFieldsB },
        key_fields: keyFields,
        field_map: fieldMap,
        tolerance: parseFloat(tolerance) || 0,
      });
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl mb-6 overflow-hidden">
      {/* Step indicator */}
      <div className="flex border-b border-zinc-800">
        {(['sources', 'fields', 'review'] as Step[]).map((s, i) => {
          const labels = ['Источники и таблицы', 'Маппинг полей', 'Проверка и запуск'];
          const active = step === s;
          const done = (s === 'sources' && step !== 'sources') || (s === 'fields' && step === 'review');
          return (
            <button
              key={s}
              onClick={() => {
                if (s === 'sources') setStep(s);
                if (s === 'fields' && canGoToFields) setStep(s);
                if (s === 'review' && mappings.length > 0 && keyFields.length > 0) setStep(s);
              }}
              className={`flex-1 py-3 px-4 text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                active ? 'bg-zinc-800 text-white' : done ? 'text-emerald-500' : 'text-zinc-500'
              }`}
            >
              <span className={`w-6 h-6 rounded-full text-xs flex items-center justify-center ${
                active ? 'bg-blue-600 text-white' : done ? 'bg-emerald-500/20 text-emerald-500' : 'bg-zinc-800 text-zinc-500'
              }`}>
                {done ? <Check size={12} /> : i + 1}
              </span>
              {labels[i]}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="m-6 mb-0 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{error}</div>
      )}

      {/* Step 1: Sources & Tables */}
      {step === 'sources' && (
        <div className="p-6">
          <div className="grid grid-cols-2 gap-8">
            <SourceTablePicker
              label="Source A (эталон)"
              sources={sources}
              source={srcA}
              onSourceChange={s => { setSrcA(s); setTableA(''); }}
              tables={tablesA}
              table={tableA}
              onTableChange={setTableA}
            />
            <SourceTablePicker
              label="Source B (проверяемый)"
              sources={sources}
              source={srcB}
              onSourceChange={s => { setSrcB(s); setTableB(''); }}
              tables={tablesB}
              table={tableB}
              onTableChange={setTableB}
            />
          </div>

          <div className="flex justify-between mt-6 pt-6 border-t border-zinc-800">
            <button onClick={onCancel} className="px-4 py-2 text-zinc-400 hover:text-white transition-colors cursor-pointer">Отмена</button>
            <button
              disabled={!canGoToFields}
              onClick={() => setStep('fields')}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            >
              Далее <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Field mapping */}
      {step === 'fields' && (
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-zinc-400">
              Кликните поле слева, затем справа, чтобы связать. Клик на связанное поле — отвязать.
            </p>
            <button
              onClick={handleAutoMap}
              className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
            >
              <Zap size={14} className="text-amber-400" /> Автомаппинг
            </button>
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] gap-0 items-start">
            {/* Column A */}
            <div>
              <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest mb-2 px-1">
                {srcA} / {tableA}
              </div>
              <div className="space-y-1">
                {schemaA.map(col => {
                  const mapped = isMappedA(col.name);
                  const isPending = pendingA === col.name;
                  const isKey = keyFields.includes(col.name);
                  return (
                    <div key={col.name} className="flex items-center gap-1">
                      <button
                        onClick={() => toggleKeyField(col.name)}
                        title={isKey ? 'Убрать из ключа' : 'Сделать ключом'}
                        className={`p-1 rounded transition-colors cursor-pointer ${
                          isKey ? 'text-amber-400' : 'text-zinc-700 hover:text-zinc-400'
                        }`}
                      >
                        <Key size={12} />
                      </button>
                      <button
                        onClick={() => handleFieldClickA(col.name)}
                        className={`flex-1 text-left px-3 py-1.5 rounded-lg text-sm font-mono transition-all cursor-pointer border ${
                          isPending
                            ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                            : mapped
                            ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400'
                            : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-600'
                        }`}
                      >
                        <span>{col.name}</span>
                        <span className="text-zinc-600 text-xs ml-2">{col.type}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Connection lines */}
            <div className="flex flex-col items-center justify-start pt-7 px-3 min-w-[60px]">
              {mappings.map((m, i) => {
                const idxA = schemaA.findIndex(c => c.name === m.fieldA);
                const idxB = schemaB.findIndex(c => c.name === m.fieldB);
                if (idxA < 0 || idxB < 0) return null;
                return (
                  <div
                    key={i}
                    className="text-emerald-500/50"
                    style={{ position: 'absolute' }}
                  >
                    <Link2 size={12} />
                  </div>
                );
              })}
              {mappings.length > 0 && (
                <div className="flex flex-col items-center gap-1 text-emerald-500/60">
                  {mappings.map((_, i) => (
                    <Link2 key={i} size={14} />
                  ))}
                </div>
              )}
              {pendingA && (
                <div className="text-blue-400 mt-2">
                  <ArrowRight size={16} />
                </div>
              )}
            </div>

            {/* Column B */}
            <div>
              <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest mb-2 px-1">
                {srcB} / {tableB}
              </div>
              <div className="space-y-1">
                {schemaB.map(col => {
                  const mapped = isMappedB(col.name);
                  const mappedFrom = getMappedA(col.name);
                  return (
                    <button
                      key={col.name}
                      onClick={() => handleFieldClickB(col.name)}
                      className={`w-full text-left px-3 py-1.5 rounded-lg text-sm font-mono transition-all cursor-pointer border ${
                        pendingA && !mapped
                          ? 'border-blue-500/30 bg-zinc-950 text-zinc-300 hover:border-blue-500 hover:bg-blue-500/5'
                          : mapped
                          ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400'
                          : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-600'
                      }`}
                    >
                      <span>{col.name}</span>
                      <span className="text-zinc-600 text-xs ml-2">{col.type}</span>
                      {mappedFrom && mappedFrom !== col.name && (
                        <span className="text-zinc-600 text-xs ml-2">← {mappedFrom}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Mapping summary */}
          {(mappings.length > 0 || keyFields.length > 0) && (
            <div className="mt-4 p-3 bg-zinc-950 rounded-lg border border-zinc-800 text-xs">
              {keyFields.length > 0 && (
                <div className="flex items-center gap-2 mb-1">
                  <Key size={12} className="text-amber-400" />
                  <span className="text-zinc-400">Ключ:</span>
                  <span className="font-mono text-amber-400">{keyFields.join(', ')}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Link2 size={12} className="text-emerald-500" />
                <span className="text-zinc-400">Связано полей:</span>
                <span className="text-emerald-400">{mappings.length}</span>
                <span className="text-zinc-600">из {Math.max(schemaA.length, schemaB.length)}</span>
              </div>
            </div>
          )}

          <div className="flex justify-between mt-6 pt-6 border-t border-zinc-800">
            <button onClick={() => setStep('sources')} className="flex items-center gap-2 px-4 py-2 text-zinc-400 hover:text-white transition-colors cursor-pointer">
              <ArrowLeft size={16} /> Назад
            </button>
            <button
              disabled={mappings.length === 0 || keyFields.length === 0}
              onClick={() => setStep('review')}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            >
              Далее <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Review */}
      {step === 'review' && (
        <div className="p-6">
          <div className="space-y-4 max-w-lg">
            <div>
              <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest mb-1 block">Название проверки</label>
              <input
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-blue-500"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest mb-1 block">Режим сверки</label>
                <select
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 focus:outline-none focus:border-blue-500"
                  value={mode}
                  onChange={e => setMode(e.target.value as CheckMode)}
                >
                  <option value="row_level">Построчная (Row Level)</option>
                  <option value="aggregate">Агрегаты (SUM)</option>
                  <option value="count">Подсчёт строк (Count)</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest mb-1 block">Допустимое отклонение</label>
                <input
                  type="text"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-blue-500 font-mono"
                  value={tolerance}
                  onChange={e => setTolerance(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4 mt-6">
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
              <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest mb-2">Source A (эталон)</div>
              <p className="font-mono text-sm">{srcA} / <span className="text-blue-400">{tableA}</span></p>
            </div>
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
              <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest mb-2">Source B (проверяемый)</div>
              <p className="font-mono text-sm">{srcB} / <span className="text-blue-400">{tableB}</span></p>
            </div>
          </div>

          <div className="mt-4 bg-zinc-950 border border-zinc-800 rounded-lg p-4">
            <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest mb-2">Маппинг ({mappings.length} полей, ключ: {keyFields.join(', ')})</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm font-mono">
              {mappings.map((m, i) => (
                <div key={i} className="col-span-2 flex items-center gap-2">
                  <span className={keyFields.includes(m.fieldA) ? 'text-amber-400' : 'text-zinc-300'}>{m.fieldA}</span>
                  <ArrowRight size={12} className="text-zinc-600" />
                  <span className={keyFields.includes(m.fieldA) ? 'text-amber-400' : 'text-zinc-300'}>{m.fieldB}</span>
                  {m.fieldA === m.fieldB && <span className="text-zinc-700 text-xs">(same)</span>}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-between mt-6 pt-6 border-t border-zinc-800">
            <button onClick={() => setStep('fields')} className="flex items-center gap-2 px-4 py-2 text-zinc-400 hover:text-white transition-colors cursor-pointer">
              <ArrowLeft size={16} /> Назад
            </button>
            <button
              disabled={submitting || !name}
              onClick={handleSubmit}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-bold transition-all disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'Создание...' : 'Создать проверку'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SourceTablePicker({ label, sources, source, onSourceChange, tables, table, onTableChange }: {
  label: string;
  sources: DSInfo[];
  source: string;
  onSourceChange: (s: string) => void;
  tables: TableInfo[];
  table: string;
  onTableChange: (t: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">{label}</div>
      <div>
        <label className="text-xs text-zinc-400 mb-1 block">Источник</label>
        <select
          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 focus:outline-none focus:border-blue-500"
          value={source}
          onChange={e => onSourceChange(e.target.value)}
        >
          <option value="">Выберите...</option>
          {sources.map(s => (
            <option key={s.name} value={s.name}>{s.name} ({s.type})</option>
          ))}
        </select>
      </div>
      {source && (
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Таблица</label>
          {tables.length > 0 ? (
            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
              {tables.map(t => (
                <button
                  key={t.name}
                  onClick={() => onTableChange(t.name)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm font-mono transition-all cursor-pointer border ${
                    table === t.name
                      ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-600'
                  }`}
                >
                  {t.name}
                  <span className="text-zinc-600 text-xs ml-2">{t.row_count.toLocaleString()} rows</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-zinc-600 text-sm">Загрузка таблиц...</p>
          )}
        </div>
      )}
    </div>
  );
}
