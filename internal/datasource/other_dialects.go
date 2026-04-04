package datasource

import (
	"fmt"

	_ "github.com/go-sql-driver/mysql"
	_ "github.com/mattn/go-sqlite3"
	_ "github.com/microsoft/go-mssqldb"
)

func init() {
	Register("mysql", newMySQL)
	Register("mariadb", newMySQL)
	Register("sqlite", newSQLite)
	Register("mssql", newMSSQL)
}

// =============================================
// MySQL / MariaDB
// =============================================

var mysqlDialect = SQLDialect{
	DriverName: "mysql",
	BuildDSN: func(cfg DSConfig) string {
		return fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?parseTime=true",
			cfg.User, cfg.Password, cfg.Host, cfg.Port, cfg.Database)
	},
	QuoteIdent: func(s string) string { return "`" + s + "`" },
	ListTablesSQL: `SELECT table_name FROM information_schema.tables 
		WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name`,
}

func newMySQL(cfg DSConfig) (DataSource, error) {
	if cfg.Port == 0 {
		cfg.Port = 3306
	}
	return NewGenericSQL(cfg, mysqlDialect)
}

// =============================================
// SQLite
// =============================================

var sqliteDialect = SQLDialect{
	DriverName: "sqlite3",
	BuildDSN: func(cfg DSConfig) string {
		return cfg.FilePath
	},
	QuoteIdent: func(s string) string { return `"` + s + `"` },
	ListTablesSQL: `SELECT name FROM sqlite_master 
		WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
}

func newSQLite(cfg DSConfig) (DataSource, error) {
	return NewGenericSQL(cfg, sqliteDialect)
}

// =============================================
// Microsoft SQL Server
// =============================================

var mssqlDialect = SQLDialect{
	DriverName: "sqlserver",
	BuildDSN: func(cfg DSConfig) string {
		return fmt.Sprintf("sqlserver://%s:%s@%s:%d?database=%s",
			cfg.User, cfg.Password, cfg.Host, cfg.Port, cfg.Database)
	},
	QuoteIdent: func(s string) string { return "[" + s + "]" },
	ListTablesSQL: `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
		WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`,
}

func newMSSQL(cfg DSConfig) (DataSource, error) {
	if cfg.Port == 0 {
		cfg.Port = 1433
	}
	return NewGenericSQL(cfg, mssqlDialect)
}
