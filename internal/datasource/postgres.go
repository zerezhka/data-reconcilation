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
}

func newPostgres(cfg DSConfig) (DataSource, error) {
	if cfg.Port == 0 {
		cfg.Port = 5432
	}
	return NewGenericSQL(cfg, postgresDialect)
}
