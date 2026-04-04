package models

import "time"

// =============================================
// Конфигурация сверки
// =============================================

type CheckConfig struct {
	ID        string            `json:"id" yaml:"id"`
	Name      string            `json:"name" yaml:"name"`
	SourceA   SourceRef         `json:"source_a" yaml:"source_a"`
	SourceB   SourceRef         `json:"source_b" yaml:"source_b"`
	FieldMap  map[string]string `json:"field_map" yaml:"field_map"`   // sourceA field → sourceB field
	KeyFields []string          `json:"key_fields" yaml:"key_fields"` // поля для JOIN (в терминах sourceA)
	Mode      CheckMode         `json:"mode" yaml:"mode"`
	Tolerance float64           `json:"tolerance" yaml:"tolerance"` // 0 для финансов
}

type SourceRef struct {
	Datasource string   `json:"datasource" yaml:"datasource"` // имя датасорса
	Table      string   `json:"table" yaml:"table"`
	Fields     []string `json:"fields" yaml:"fields"`
	Where      string   `json:"where,omitempty" yaml:"where,omitempty"`
}

type CheckMode string

const (
	ModeRowLevel  CheckMode = "row_level"  // построчное сравнение по ключу
	ModeAggregate CheckMode = "aggregate"  // сумма/количество на уровне таблицы
	ModeCount     CheckMode = "count"      // просто количество строк
)

// =============================================
// Результаты сверки
// =============================================

type CheckResult struct {
	CheckID   string        `json:"check_id"`
	CheckName string        `json:"check_name"`
	Status    CheckStatus   `json:"status"` // ok, warning, error
	Mode      CheckMode     `json:"mode"`
	Summary   ResultSummary `json:"summary"`
	Details   []Discrepancy `json:"details,omitempty"`
	RunAt     time.Time     `json:"run_at"`
	Duration  string        `json:"duration"`
}

type CheckStatus string

const (
	StatusOK      CheckStatus = "ok"
	StatusWarning CheckStatus = "warning"
	StatusError   CheckStatus = "error"
)

type ResultSummary struct {
	SourceARows     int64 `json:"source_a_rows"`
	SourceBRows     int64 `json:"source_b_rows"`
	MatchedRows     int64 `json:"matched_rows"`
	MismatchedRows  int64 `json:"mismatched_rows"`
	MissingInA      int64 `json:"missing_in_a"`       // есть в B, нет в A
	MissingInB      int64 `json:"missing_in_b"`       // есть в A, нет в B
	DuplicatesInA   int64 `json:"duplicates_in_a"`
	DuplicatesInB   int64 `json:"duplicates_in_b"`
}

type Discrepancy struct {
	Type      DiscrepancyType        `json:"type"`
	KeyValues map[string]interface{} `json:"key_values"`          // значения ключевых полей
	Field     string                 `json:"field,omitempty"`     // поле с расхождением
	ValueA    interface{}            `json:"value_a,omitempty"`
	ValueB    interface{}            `json:"value_b,omitempty"`
	Delta     interface{}            `json:"delta,omitempty"`
}

type DiscrepancyType string

const (
	DiscrepancyMissing   DiscrepancyType = "missing"   // строка отсутствует
	DiscrepancyDuplicate DiscrepancyType = "duplicate"  // дубликат
	DiscrepancyMismatch  DiscrepancyType = "mismatch"   // значения не совпадают
)
