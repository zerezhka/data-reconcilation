package reconciler

import (
	"context"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/sergey/data-reconciler/internal/datasource"
	"github.com/sergey/data-reconciler/internal/models"
)

type Engine struct {
	sources map[string]datasource.DataSource
}

func New() *Engine {
	return &Engine{sources: make(map[string]datasource.DataSource)}
}

func (e *Engine) RegisterSource(name string, ds datasource.DataSource) {
	e.sources[name] = ds
}

func (e *Engine) GetSource(name string) (datasource.DataSource, bool) {
	ds, ok := e.sources[name]
	return ds, ok
}

func (e *Engine) Sources() map[string]datasource.DataSource {
	return e.sources
}

func (e *Engine) RemoveSource(name string) {
	if ds, ok := e.sources[name]; ok {
		ds.Close()
		delete(e.sources, name)
	}
}

// =============================================
// RunCheck — запуск одной проверки
// =============================================

func (e *Engine) RunCheck(ctx context.Context, check models.CheckConfig) (*models.CheckResult, error) {
	start := time.Now()

	srcA, ok := e.sources[check.SourceA.Datasource]
	if !ok {
		return nil, fmt.Errorf("datasource not found: %s", check.SourceA.Datasource)
	}
	srcB, ok := e.sources[check.SourceB.Datasource]
	if !ok {
		return nil, fmt.Errorf("datasource not found: %s", check.SourceB.Datasource)
	}

	var result *models.CheckResult
	var err error

	switch check.Mode {
	case models.ModeCount:
		result, err = e.runCountCheck(ctx, srcA, srcB, check)
	case models.ModeAggregate:
		result, err = e.runAggregateCheck(ctx, srcA, srcB, check)
	case models.ModeRowLevel:
		result, err = e.runRowLevelCheck(ctx, srcA, srcB, check)
	default:
		return nil, fmt.Errorf("unknown check mode: %s", check.Mode)
	}

	if err != nil {
		return nil, err
	}

	result.CheckID = check.ID
	result.CheckName = check.Name
	result.Mode = check.Mode
	result.RunAt = start
	result.Duration = time.Since(start).String()

	return result, nil
}

// =============================================
// Count check — простое сравнение количества строк
// =============================================

func (e *Engine) runCountCheck(ctx context.Context, srcA, srcB datasource.DataSource, check models.CheckConfig) (*models.CheckResult, error) {
	countA, err := srcA.CountRows(ctx, check.SourceA.Table, check.SourceA.Where)
	if err != nil {
		return nil, fmt.Errorf("count source_a: %w", err)
	}
	countB, err := srcB.CountRows(ctx, check.SourceB.Table, check.SourceB.Where)
	if err != nil {
		return nil, fmt.Errorf("count source_b: %w", err)
	}

	status := models.StatusOK
	if countA != countB {
		status = models.StatusError
	}

	return &models.CheckResult{
		Status: status,
		Summary: models.ResultSummary{
			SourceARows: countA,
			SourceBRows: countB,
		},
	}, nil
}

// =============================================
// Aggregate check — сравнение SUM/COUNT по таблице
// =============================================

func (e *Engine) runAggregateCheck(ctx context.Context, srcA, srcB datasource.DataSource, check models.CheckConfig) (*models.CheckResult, error) {
	aggsA := buildAggs(check.SourceA.Fields)
	aggsB := buildAggs(check.SourceB.Fields)

	resA, err := srcA.GetAggregates(ctx, check.SourceA.Table, aggsA, check.SourceA.Where, nil)
	if err != nil {
		return nil, fmt.Errorf("aggregate source_a: %w", err)
	}
	resB, err := srcB.GetAggregates(ctx, check.SourceB.Table, aggsB, check.SourceB.Where, nil)
	if err != nil {
		return nil, fmt.Errorf("aggregate source_b: %w", err)
	}

	var details []models.Discrepancy
	status := models.StatusOK

	if len(resA.Rows) > 0 && len(resB.Rows) > 0 {
		for i, fieldA := range check.SourceA.Fields {
			fieldB := check.SourceB.Fields[i]
			valA, _ := asFloat64(resA.Rows[0][i])
			valB, _ := asFloat64(resB.Rows[0][i])
			delta := valA - valB

			if math.Abs(delta) > check.Tolerance {
				status = models.StatusError
				details = append(details, models.Discrepancy{
					Type:   models.DiscrepancyMismatch,
					Field:  fieldA + " / " + fieldB,
					ValueA: valA,
					ValueB: valB,
					Delta:  delta,
				})
			}
		}
	}

	return &models.CheckResult{
		Status:  status,
		Details: details,
	}, nil
}

// =============================================
// Row-level check — построчное сравнение по ключу
// =============================================

func (e *Engine) runRowLevelCheck(ctx context.Context, srcA, srcB datasource.DataSource, check models.CheckConfig) (*models.CheckResult, error) {
	// Fetch all rows from both sources
	allFieldsA := append(check.KeyFields, check.SourceA.Fields...)
	allFieldsB := make([]string, 0, len(check.KeyFields)+len(check.SourceB.Fields))
	for _, k := range check.KeyFields {
		if mapped, ok := check.FieldMap[k]; ok {
			allFieldsB = append(allFieldsB, mapped)
		} else {
			allFieldsB = append(allFieldsB, k)
		}
	}
	allFieldsB = append(allFieldsB, check.SourceB.Fields...)

	resA, err := srcA.Query(ctx, datasource.QuerySpec{
		Table:  check.SourceA.Table,
		Fields: allFieldsA,
		Where:  check.SourceA.Where,
	})
	if err != nil {
		return nil, fmt.Errorf("query source_a: %w", err)
	}

	resB, err := srcB.Query(ctx, datasource.QuerySpec{
		Table:  check.SourceB.Table,
		Fields: allFieldsB,
		Where:  check.SourceB.Where,
	})
	if err != nil {
		return nil, fmt.Errorf("query source_b: %w", err)
	}

	// Index rows by composite key
	keyLen := len(check.KeyFields)
	indexA := indexRows(resA.Rows, keyLen)
	indexB := indexRows(resB.Rows, keyLen)

	var details []models.Discrepancy
	var matched, mismatched, missingInB, missingInA, dupsA, dupsB int64

	// Check A → B
	for key, rowsA := range indexA {
		if len(rowsA) > 1 {
			dupsA += int64(len(rowsA) - 1)
		}

		rowsInB, exists := indexB[key]
		if !exists {
			missingInB++
			details = append(details, models.Discrepancy{
				Type:      models.DiscrepancyMissing,
				KeyValues: parseKey(key, check.KeyFields),
				Field:     "entire row",
				ValueA:    "exists",
				ValueB:    "MISSING",
			})
			continue
		}

		// Compare value fields
		rowA := rowsA[0]
		rowB := rowsInB[0]
		rowMatch := true

		for i, fieldA := range check.SourceA.Fields {
			valA := rowA[keyLen+i]
			valB := rowB[keyLen+i]

			if !valuesEqual(valA, valB, check.Tolerance) {
				rowMatch = false
				details = append(details, models.Discrepancy{
					Type:      models.DiscrepancyMismatch,
					KeyValues: parseKey(key, check.KeyFields),
					Field:     fieldA,
					ValueA:    valA,
					ValueB:    valB,
					Delta:     computeDelta(valA, valB),
				})
			}
		}

		if rowMatch {
			matched++
		} else {
			mismatched++
		}
	}

	// Check B → A for missing in A
	for key, rowsB := range indexB {
		if len(rowsB) > 1 {
			dupsB += int64(len(rowsB) - 1)
		}
		if _, exists := indexA[key]; !exists {
			missingInA++
			details = append(details, models.Discrepancy{
				Type:      models.DiscrepancyMissing,
				KeyValues: parseKey(key, check.KeyFields),
				Field:     "entire row",
				ValueA:    "MISSING",
				ValueB:    "exists",
			})
		}
	}

	// Add duplicate details
	for key, rows := range indexA {
		if len(rows) > 1 {
			details = append(details, models.Discrepancy{
				Type:      models.DiscrepancyDuplicate,
				KeyValues: parseKey(key, check.KeyFields),
				Field:     fmt.Sprintf("source_a: %d copies", len(rows)),
			})
		}
	}
	for key, rows := range indexB {
		if len(rows) > 1 {
			details = append(details, models.Discrepancy{
				Type:      models.DiscrepancyDuplicate,
				KeyValues: parseKey(key, check.KeyFields),
				Field:     fmt.Sprintf("source_b: %d copies", len(rows)),
			})
		}
	}

	status := models.StatusOK
	if missingInA > 0 || missingInB > 0 || mismatched > 0 || dupsA > 0 || dupsB > 0 {
		status = models.StatusError
	}

	return &models.CheckResult{
		Status: status,
		Summary: models.ResultSummary{
			SourceARows:   int64(len(resA.Rows)),
			SourceBRows:   int64(len(resB.Rows)),
			MatchedRows:   matched,
			MismatchedRows: mismatched,
			MissingInA:    missingInA,
			MissingInB:    missingInB,
			DuplicatesInA: dupsA,
			DuplicatesInB: dupsB,
		},
		Details: details,
	}, nil
}

// =============================================
// Helpers
// =============================================

func buildAggs(fields []string) []datasource.AggSpec {
	aggs := make([]datasource.AggSpec, len(fields))
	for i, f := range fields {
		aggs[i] = datasource.AggSpec{Function: "sum", Field: f, Alias: f}
	}
	return aggs
}

func indexRows(rows [][]interface{}, keyLen int) map[string][][]interface{} {
	index := make(map[string][][]interface{})
	for _, row := range rows {
		key := makeKey(row[:keyLen])
		index[key] = append(index[key], row)
	}
	return index
}

func makeKey(vals []interface{}) string {
	parts := make([]string, len(vals))
	for i, v := range vals {
		parts[i] = fmt.Sprintf("%v", v)
	}
	return strings.Join(parts, "|")
}

func parseKey(key string, fields []string) map[string]interface{} {
	parts := strings.Split(key, "|")
	result := make(map[string]interface{})
	for i, f := range fields {
		if i < len(parts) {
			result[f] = parts[i]
		}
	}
	return result
}

// asFloat64 converts normalized values (int64, float64, string) to float64.
// Values are already normalized by the datasource layer.
func asFloat64(v interface{}) (float64, bool) {
	switch val := v.(type) {
	case float64:
		return val, true
	case int64:
		return float64(val), true
	case string:
		var f float64
		if _, err := fmt.Sscanf(val, "%f", &f); err == nil {
			return f, true
		}
		return 0, false
	default:
		return 0, false
	}
}

func valuesEqual(a, b interface{}, tolerance float64) bool {
	fa, aOk := asFloat64(a)
	fb, bOk := asFloat64(b)
	if aOk && bOk {
		return math.Abs(fa-fb) <= tolerance
	}
	return fmt.Sprintf("%v", a) == fmt.Sprintf("%v", b)
}

func computeDelta(a, b interface{}) interface{} {
	fa, aOk := asFloat64(a)
	fb, bOk := asFloat64(b)
	if aOk && bOk {
		return fa - fb
	}
	return nil
}
