package datasource

import (
	"context"
	"database/sql"
	"fmt"
	"math/big"
	"strings"
	"time"
)

// =============================================
// GenericSQL — единая реализация для всех SQL-баз
// Разница только в DSN и паре диалектных мелочей
// =============================================

type SQLDialect struct {
	DriverName      string
	BuildDSN        func(cfg DSConfig) string
	QuoteIdent      func(s string) string
	ListTablesSQL   string
	TableSchemaSQL  string // %s = table name
	CountSQL        string // %s = table, %s = where
	PrimaryKeysSQL  string // %s = table name; returns column_name rows
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

	// Fetch primary keys if dialect supports it
	pkSet := make(map[string]bool)
	if g.dialect.PrimaryKeysSQL != "" {
		pkQuery := fmt.Sprintf(g.dialect.PrimaryKeysSQL, table)
		pkRows, err := g.db.QueryContext(ctx, pkQuery)
		if err == nil {
			defer pkRows.Close()
			for pkRows.Next() {
				var colName string
				if pkRows.Scan(&colName) == nil {
					pkSet[colName] = true
				}
			}
		}
	}

	var result []ColumnInfo
	for _, c := range cols {
		nullable, _ := c.Nullable()
		result = append(result, ColumnInfo{
			Name:       c.Name(),
			Type:       c.DatabaseTypeName(),
			Nullable:   nullable,
			PrimaryKey: pkSet[c.Name()],
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

		row := make([]interface{}, len(columns))
		for i, v := range values {
			row[i] = normalizeValue(v)
		}
		result.Rows = append(result.Rows, row)
	}
	result.Total = int64(len(result.Rows))
	return &result, nil
}

// normalizeValue converts driver-specific types to canonical Go types:
//   - integers (any width/sign) → int64
//   - floats → float64
//   - decimals/big types → float64
//   - time → time.Time in UTC
//   - bytes → string
//   - nil stays nil
func normalizeValue(v interface{}) interface{} {
	if v == nil {
		return nil
	}
	switch val := v.(type) {
	// Already canonical
	case int64:
		return val
	case float64:
		return val
	case string:
		return val
	case bool:
		return val
	case time.Time:
		return val.UTC()

	// Integer widths → int64
	case int:
		return int64(val)
	case int8:
		return int64(val)
	case int16:
		return int64(val)
	case int32:
		return int64(val)
	case uint:
		return int64(val)
	case uint8:
		return int64(val)
	case uint16:
		return int64(val)
	case uint32:
		return int64(val)
	case uint64:
		return int64(val)

	// Float widths → float64
	case float32:
		return float64(val)

	// Byte slices → string
	case []byte:
		return string(val)

	// Decimal types (clickhouse, shopspring, etc.)
	case *big.Float:
		f, _ := val.Float64()
		return f
	case *big.Int:
		return val.Int64()
	case *big.Rat:
		f, _ := val.Float64()
		return f

	default:
		// Stringer fallback
		if s, ok := v.(fmt.Stringer); ok {
			return s.String()
		}
		return fmt.Sprintf("%v", v)
	}
}
