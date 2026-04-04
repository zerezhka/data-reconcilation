package datasource

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

// =============================================
// GenericSQL — единая реализация для всех SQL-баз
// Разница только в DSN и паре диалектных мелочей
// =============================================

type SQLDialect struct {
	DriverName     string
	BuildDSN       func(cfg DSConfig) string
	QuoteIdent     func(s string) string
	ListTablesSQL  string
	TableSchemaSQL string // %s = table name
	CountSQL       string // %s = table, %s = where
}

type GenericSQL struct {
	cfg     DSConfig
	dialect SQLDialect
	db      *sql.DB
}

func NewGenericSQL(cfg DSConfig, dialect SQLDialect) (*GenericSQL, error) {
	return &GenericSQL{cfg: cfg, dialect: dialect}, nil
}

func (g *GenericSQL) Type() string { return g.cfg.Type }

func (g *GenericSQL) Connect(ctx context.Context) error {
	dsn := g.dialect.BuildDSN(g.cfg)
	db, err := sql.Open(g.dialect.DriverName, dsn)
	if err != nil {
		return fmt.Errorf("connect %s: %w", g.cfg.Name, err)
	}
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	g.db = db
	return g.db.PingContext(ctx)
}

func (g *GenericSQL) Close() error {
	if g.db != nil {
		return g.db.Close()
	}
	return nil
}

func (g *GenericSQL) Ping(ctx context.Context) error {
	return g.db.PingContext(ctx)
}

func (g *GenericSQL) GetTables(ctx context.Context) ([]TableInfo, error) {
	rows, err := g.db.QueryContext(ctx, g.dialect.ListTablesSQL)
	if err != nil {
		return nil, fmt.Errorf("list tables: %w", err)
	}
	defer rows.Close()

	var tables []TableInfo
	for rows.Next() {
		var t TableInfo
		if err := rows.Scan(&t.Name); err != nil {
			return nil, err
		}
		// Get row count
		count, _ := g.CountRows(ctx, t.Name, "")
		t.RowCount = count
		tables = append(tables, t)
	}
	return tables, nil
}

func (g *GenericSQL) GetSchema(ctx context.Context, table string) ([]ColumnInfo, error) {
	query := fmt.Sprintf("SELECT * FROM %s LIMIT 0", g.dialect.QuoteIdent(table))
	rows, err := g.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("get schema %s: %w", table, err)
	}
	defer rows.Close()

	cols, err := rows.ColumnTypes()
	if err != nil {
		return nil, err
	}

	var result []ColumnInfo
	for _, c := range cols {
		nullable, _ := c.Nullable()
		result = append(result, ColumnInfo{
			Name:     c.Name(),
			Type:     c.DatabaseTypeName(),
			Nullable: nullable,
		})
	}
	return result, nil
}

func (g *GenericSQL) CountRows(ctx context.Context, table string, where string) (int64, error) {
	query := fmt.Sprintf("SELECT COUNT(*) FROM %s", g.dialect.QuoteIdent(table))
	if where != "" {
		query += " WHERE " + where
	}
	var count int64
	err := g.db.QueryRowContext(ctx, query).Scan(&count)
	return count, err
}

func (g *GenericSQL) Query(ctx context.Context, q QuerySpec) (*QueryResult, error) {
	fields := "*"
	if len(q.Fields) > 0 {
		quoted := make([]string, len(q.Fields))
		for i, f := range q.Fields {
			quoted[i] = g.dialect.QuoteIdent(f)
		}
		fields = strings.Join(quoted, ", ")
	}

	query := fmt.Sprintf("SELECT %s FROM %s", fields, g.dialect.QuoteIdent(q.Table))

	// JOINs
	for _, j := range q.Joins {
		query += fmt.Sprintf(" %s JOIN %s ON %s = %s",
			strings.ToUpper(j.Type),
			g.dialect.QuoteIdent(j.Table),
			j.OnLeft, j.OnRight)
	}

	if q.Where != "" {
		query += " WHERE " + q.Where
	}
	if len(q.OrderBy) > 0 {
		query += " ORDER BY " + strings.Join(q.OrderBy, ", ")
	}
	if q.Limit > 0 {
		query += fmt.Sprintf(" LIMIT %d", q.Limit)
	}

	return g.execQuery(ctx, query)
}

func (g *GenericSQL) GetAggregates(ctx context.Context, table string, aggs []AggSpec, where string, groupBy []string) (*QueryResult, error) {
	fields := make([]string, 0, len(aggs)+len(groupBy))
	for _, gb := range groupBy {
		fields = append(fields, g.dialect.QuoteIdent(gb))
	}
	for _, a := range aggs {
		fields = append(fields, fmt.Sprintf("%s(%s) AS %s",
			strings.ToUpper(a.Function),
			g.dialect.QuoteIdent(a.Field),
			g.dialect.QuoteIdent(a.Alias)))
	}

	query := fmt.Sprintf("SELECT %s FROM %s", strings.Join(fields, ", "), g.dialect.QuoteIdent(table))
	if where != "" {
		query += " WHERE " + where
	}
	if len(groupBy) > 0 {
		quoted := make([]string, len(groupBy))
		for i, gb := range groupBy {
			quoted[i] = g.dialect.QuoteIdent(gb)
		}
		query += " GROUP BY " + strings.Join(quoted, ", ")
	}

	return g.execQuery(ctx, query)
}

func (g *GenericSQL) execQuery(ctx context.Context, query string) (*QueryResult, error) {
	rows, err := g.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("query: %w\nSQL: %s", err, query)
	}
	defer rows.Close()

	columns, err := rows.Columns()
	if err != nil {
		return nil, err
	}

	var result QueryResult
	result.Columns = columns

	for rows.Next() {
		values := make([]interface{}, len(columns))
		ptrs := make([]interface{}, len(columns))
		for i := range values {
			ptrs[i] = &values[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return nil, err
		}

		// Convert byte slices to strings for JSON serialization
		row := make([]interface{}, len(columns))
		for i, v := range values {
			if b, ok := v.([]byte); ok {
				row[i] = string(b)
			} else {
				row[i] = v
			}
		}
		result.Rows = append(result.Rows, row)
	}
	result.Total = int64(len(result.Rows))
	return &result, nil
}
