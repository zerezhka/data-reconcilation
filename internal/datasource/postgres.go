package datasource

import (
	"fmt"

	_ "github.com/lib/pq"
)

func init() {
	Register("postgresql", newPostgres)
	Register("postgres", newPostgres) // alias
}

var postgresDialect = SQLDialect{
	DriverName: "postgres",
	BuildDSN: func(cfg DSConfig) string {
		sslMode := cfg.SSLMode
		if sslMode == "" {
			sslMode = "disable"
		}
		return fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
			cfg.Host, cfg.Port, cfg.User, cfg.Password, cfg.Database, sslMode)
	},
	QuoteIdent: func(s string) string { return `"` + s + `"` },
	ListTablesSQL: `SELECT table_name FROM information_schema.tables
		WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
	PrimaryKeysSQL: `SELECT kcu.column_name FROM information_schema.table_constraints tc
		JOIN information_schema.key_column_usage kcu
			ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
		WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_name = '%s'
		ORDER BY kcu.ordinal_position`,
}

func newPostgres(cfg DSConfig) (DataSource, error) {
	if cfg.Port == 0 {
		cfg.Port = 5432
	}
	return NewGenericSQL(cfg, postgresDialect)
}
