package datasource

import (
	"context"
	"fmt"
)

// =============================================
// Core interface — все источники реализуют это
// =============================================

type DataSource interface {
	// Тип источника (postgres, clickhouse, mysql, sqlite, mssql)
	Type() string

	// Подключение/отключение
	Connect(ctx context.Context) error
	Close() error
	Ping(ctx context.Context) error

	// Метаданные
	GetTables(ctx context.Context) ([]TableInfo, error)
	GetSchema(ctx context.Context, table string) ([]ColumnInfo, error)

	// Запросы
	Query(ctx context.Context, q QuerySpec) (*QueryResult, error)
	CountRows(ctx context.Context, table string, where string) (int64, error)
	GetAggregates(ctx context.Context, table string, aggs []AggSpec, where string, groupBy []string) (*QueryResult, error)
}

// =============================================
// Модели данных
// =============================================

type DSConfig struct {
	Name     string `json:"name" yaml:"name"`
	Type     string `json:"type" yaml:"type"` // postgres, clickhouse, mysql, sqlite, mssql
	Host     string `json:"host" yaml:"host"`
	Port     int    `json:"port" yaml:"port"`
	Database string `json:"database" yaml:"database"`
	User     string `json:"user" yaml:"user"`
	Password string `json:"password" yaml:"password"`
	SSLMode  string `json:"ssl_mode,omitempty" yaml:"ssl_mode,omitempty"`
	FilePath string `json:"file_path,omitempty" yaml:"file_path,omitempty"` // для sqlite
}

type TableInfo struct {
	Name     string `json:"name"`
	Schema   string `json:"schema,omitempty"`
	RowCount int64  `json:"row_count"`
}

type ColumnInfo struct {
	Name       string `json:"name"`
	Type       string `json:"type"`
	Nullable   bool   `json:"nullable"`
	PrimaryKey bool   `json:"primary_key"`
}

type QuerySpec struct {
	Table   string     `json:"table"`
	Fields  []string   `json:"fields"`
	Where   string     `json:"where,omitempty"`
	OrderBy []string   `json:"order_by,omitempty"`
	Limit   int        `json:"limit,omitempty"`
	Joins   []JoinSpec `json:"joins,omitempty"`
}

type JoinSpec struct {
	Table     string `json:"table"`
	Type      string `json:"type"` // inner, left, right
	OnLeft    string `json:"on_left"`
	OnRight   string `json:"on_right"`
}

type AggSpec struct {
	Function string `json:"function"` // sum, count, avg, min, max
	Field    string `json:"field"`
	Alias    string `json:"alias"`
}

type QueryResult struct {
	Columns []string        `json:"columns"`
	Rows    [][]interface{} `json:"rows"`
	Total   int64           `json:"total"`
}

// =============================================
// Фабрика — создаёт DataSource по конфигу
// =============================================

type Factory func(cfg DSConfig) (DataSource, error)

var registry = map[string]Factory{}

func Register(dsType string, factory Factory) {
	registry[dsType] = factory
}

func New(cfg DSConfig) (DataSource, error) {
	factory, ok := registry[cfg.Type]
	if !ok {
		return nil, fmt.Errorf("unsupported datasource type: %s", cfg.Type)
	}
	return factory(cfg)
}

func SupportedTypes() []string {
	types := make([]string, 0, len(registry))
	for t := range registry {
		types = append(types, t)
	}
	return types
}
