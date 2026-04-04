package api

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/sergey/data-reconciler/internal/datasource"
	"github.com/sergey/data-reconciler/internal/models"
	"github.com/sergey/data-reconciler/internal/reconciler"
)

type Handler struct {
	engine *reconciler.Engine
	checks []models.CheckConfig // in-memory storage for checks
}

func NewHandler(engine *reconciler.Engine) *Handler {
	return &Handler{engine: engine}
}

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()

	// Datasources
	r.Get("/datasources", h.listDatasources)
	r.Post("/datasources", h.addDatasource)
	r.Post("/datasources/{name}/test", h.testDatasource)
	r.Delete("/datasources/{name}", h.removeDatasource)
	r.Get("/datasources/{name}/tables", h.listTables)
	r.Get("/datasources/{name}/tables/{table}/schema", h.getTableSchema)
	r.Post("/datasources/{name}/query", h.queryDatasource)

	// Checks
	r.Get("/checks", h.listChecks)
	r.Post("/checks", h.addCheck)
	r.Post("/checks/{id}/run", h.runCheck)
	r.Post("/checks/run-all", h.runAllChecks)
	r.Delete("/checks/{id}", h.removeCheck)

	// Supported types
	r.Get("/supported-types", h.supportedTypes)

	return r
}

// =============================================
// Datasource endpoints
// =============================================

func (h *Handler) listDatasources(w http.ResponseWriter, r *http.Request) {
	type dsInfo struct {
		Name   string `json:"name"`
		Type   string `json:"type"`
		Status string `json:"status"`
	}

	var list []dsInfo
	for name, ds := range h.engine.Sources() {
		status := "connected"
		if err := ds.Ping(r.Context()); err != nil {
			status = "error: " + err.Error()
		}
		list = append(list, dsInfo{Name: name, Type: ds.Type(), Status: status})
	}
	writeJSON(w, list)
}

func (h *Handler) addDatasource(w http.ResponseWriter, r *http.Request) {
	var cfg datasource.DSConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	ds, err := datasource.New(cfg)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10_000_000_000) // 10s
	defer cancel()

	if err := ds.Connect(ctx); err != nil {
		writeError(w, http.StatusBadGateway, "connection failed: "+err.Error())
		return
	}

	h.engine.RegisterSource(cfg.Name, ds)
	writeJSON(w, map[string]string{"status": "connected", "name": cfg.Name})
}

func (h *Handler) testDatasource(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	ds, ok := h.engine.GetSource(name)
	if !ok {
		writeError(w, http.StatusNotFound, "datasource not found: "+name)
		return
	}

	if err := ds.Ping(r.Context()); err != nil {
		writeJSON(w, map[string]string{"status": "error", "error": err.Error()})
		return
	}
	writeJSON(w, map[string]string{"status": "ok"})
}

func (h *Handler) removeDatasource(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	h.engine.RemoveSource(name)
	writeJSON(w, map[string]string{"status": "removed"})
}

func (h *Handler) listTables(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	ds, ok := h.engine.GetSource(name)
	if !ok {
		writeError(w, http.StatusNotFound, "datasource not found")
		return
	}

	tables, err := ds.GetTables(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, tables)
}

func (h *Handler) getTableSchema(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	table := chi.URLParam(r, "table")
	ds, ok := h.engine.GetSource(name)
	if !ok {
		writeError(w, http.StatusNotFound, "datasource not found")
		return
	}

	schema, err := ds.GetSchema(r.Context(), table)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, schema)
}

func (h *Handler) queryDatasource(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	ds, ok := h.engine.GetSource(name)
	if !ok {
		writeError(w, http.StatusNotFound, "datasource not found")
		return
	}

	var q datasource.QuerySpec
	if err := json.NewDecoder(r.Body).Decode(&q); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if q.Limit == 0 {
		q.Limit = 100
	}

	result, err := ds.Query(r.Context(), q)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, result)
}

// =============================================
// Check endpoints
// =============================================

func (h *Handler) listChecks(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.checks)
}

func (h *Handler) addCheck(w http.ResponseWriter, r *http.Request) {
	var check models.CheckConfig
	if err := json.NewDecoder(r.Body).Decode(&check); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.checks = append(h.checks, check)
	writeJSON(w, map[string]string{"status": "added", "id": check.ID})
}

func (h *Handler) removeCheck(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	for i, c := range h.checks {
		if c.ID == id {
			h.checks = append(h.checks[:i], h.checks[i+1:]...)
			writeJSON(w, map[string]string{"status": "removed"})
			return
		}
	}
	writeError(w, http.StatusNotFound, "check not found")
}

func (h *Handler) runCheck(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var check *models.CheckConfig
	for _, c := range h.checks {
		if c.ID == id {
			check = &c
			break
		}
	}
	if check == nil {
		writeError(w, http.StatusNotFound, "check not found: "+id)
		return
	}

	result, err := h.engine.RunCheck(r.Context(), *check)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, result)
}

func (h *Handler) runAllChecks(w http.ResponseWriter, r *http.Request) {
	var results []*models.CheckResult
	for _, check := range h.checks {
		result, err := h.engine.RunCheck(r.Context(), check)
		if err != nil {
			results = append(results, &models.CheckResult{
				CheckID:   check.ID,
				CheckName: check.Name,
				Status:    models.StatusError,
			})
			continue
		}
		results = append(results, result)
	}
	writeJSON(w, results)
}

func (h *Handler) supportedTypes(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, datasource.SupportedTypes())
}

// =============================================
// Helpers
// =============================================

func writeJSON(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
