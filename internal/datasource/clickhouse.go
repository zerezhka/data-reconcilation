package datasource

import (
	"fmt"

	_ "github.com/ClickHouse/clickhouse-go/v2"
)

func init() {
	Register("clickhouse", newClickHouse)
}

var clickhouseDialect = SQLDialect{
	DriverName: "clickhouse",
	BuildDSN: func(cfg DSConfig) string {
		return fmt.Sprintf("clickhouse://%s:%s@%s:%d/%s",
			cfg.User, cfg.Password, cfg.Host, cfg.Port, cfg.Database)
	},
	QuoteIdent: func(s string) string { return "`" + s + "`" },
	ListTablesSQL: `SELECT name FROM system.tables
		WHERE database = currentDatabase() AND engine != 'View' ORDER BY name`,
	PrimaryKeysSQL: `SELECT name FROM system.columns
		WHERE database = currentDatabase() AND table = '%s' AND is_in_primary_key = 1
		ORDER BY position`,
}

func newClickHouse(cfg DSConfig) (DataSource, error) {
	if cfg.Port == 0 {
		cfg.Port = 9000
	}
	return NewGenericSQL(cfg, clickhouseDialect)
}
