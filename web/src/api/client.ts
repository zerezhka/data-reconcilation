import type { DSConfig, DSInfo, TableInfo, ColumnInfo, QuerySpec, QueryResult, CheckConfig, CheckResult } from '../types';

const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Datasources
export const listDatasources = () =>
  request<DSInfo[]>('/datasources');

export const addDatasource = (cfg: DSConfig) =>
  request<{ status: string; name: string }>('/datasources', {
    method: 'POST',
    body: JSON.stringify(cfg),
  });

export const testDatasource = (name: string) =>
  request<{ status: string; error?: string }>(`/datasources/${name}/test`, {
    method: 'POST',
  });

export const removeDatasource = (name: string) =>
  request<{ status: string }>(`/datasources/${name}`, {
    method: 'DELETE',
  });

export const listTables = (name: string) =>
  request<TableInfo[]>(`/datasources/${name}/tables`);

export const getTableSchema = (name: string, table: string) =>
  request<ColumnInfo[]>(`/datasources/${name}/tables/${table}/schema`);

export const queryDatasource = (name: string, q: QuerySpec) =>
  request<QueryResult>(`/datasources/${name}/query`, {
    method: 'POST',
    body: JSON.stringify(q),
  });

// Checks
export const listChecks = () =>
  request<CheckConfig[]>('/checks');

export const addCheck = (check: CheckConfig) =>
  request<{ status: string; id: string }>('/checks', {
    method: 'POST',
    body: JSON.stringify(check),
  });

export const updateCheck = (id: string, check: CheckConfig) =>
  request<{ status: string; id: string }>(`/checks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(check),
  });

export const removeCheck = (id: string) =>
  request<{ status: string }>(`/checks/${id}`, {
    method: 'DELETE',
  });

export const runCheck = (id: string) =>
  request<CheckResult>(`/checks/${id}/run`, {
    method: 'POST',
  });

export const runAllChecks = () =>
  request<CheckResult[]>('/checks/run-all', {
    method: 'POST',
  });

export const lastResults = () =>
  request<CheckResult[]>('/checks/last-results');

export const supportedTypes = () =>
  request<string[]>('/supported-types');
