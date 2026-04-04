export interface DSConfig {
  name: string;
  type: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl_mode?: string;
  file_path?: string;
}

export interface DSInfo {
  name: string;
  type: string;
  status: string;
}

export interface TableInfo {
  name: string;
  schema?: string;
  row_count: number;
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  primary_key: boolean;
}

export interface QuerySpec {
  table: string;
  fields: string[];
  where?: string;
  order_by?: string[];
  limit?: number;
}

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  total: number;
}

export interface SourceRef {
  datasource: string;
  table: string;
  fields: string[];
  where?: string;
}

export type CheckMode = 'row_level' | 'aggregate' | 'count';
export type CheckStatus = 'ok' | 'warning' | 'error';
export type DiscrepancyType = 'missing' | 'duplicate' | 'mismatch';

export interface CheckConfig {
  id: string;
  name: string;
  source_a: SourceRef;
  source_b: SourceRef;
  field_map: Record<string, string>;
  key_fields: string[];
  mode: CheckMode;
  tolerance: number;
}

export interface ResultSummary {
  source_a_rows: number;
  source_b_rows: number;
  matched_rows: number;
  mismatched_rows: number;
  missing_in_a: number;
  missing_in_b: number;
  duplicates_in_a: number;
  duplicates_in_b: number;
}

export interface Discrepancy {
  type: DiscrepancyType;
  key_values: Record<string, unknown>;
  field?: string;
  value_a?: unknown;
  value_b?: unknown;
  delta?: unknown;
}

export interface CheckResult {
  check_id: string;
  check_name: string;
  status: CheckStatus;
  mode: CheckMode;
  summary: ResultSummary;
  details?: Discrepancy[];
  run_at: string;
  duration: string;
}

export const DB_TYPES = [
  { id: 'postgresql', name: 'PostgreSQL', port: 5432 },
  { id: 'clickhouse', name: 'ClickHouse', port: 9000 },
  { id: 'mysql', name: 'MySQL', port: 3306 },
  { id: 'mssql', name: 'MS SQL Server', port: 1433 },
  { id: 'sqlite', name: 'SQLite', port: 0 },
] as const;
