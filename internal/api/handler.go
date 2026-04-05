package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sync"

	"github.com/go-chi/chi/v5"
	"github.com/sergey/data-reconciler/internal/datasource"
	"github.com/sergey/data-reconciler/internal/models"
	"github.com/sergey/data-reconciler/internal/reconciler"
)

const datasourcesFile = "datasources.json"
const checksFile = "checks.json"
const resultsFile = "last_results.json"

type Handler struct {
	engine    *reconciler.Engine
	checks    []models.CheckConfig // in-memory storage for checks
	dsConfigs []datasource.DSConfig
	mu        sync.Mutex
	// SSE subscribers
	sseClients   map[chan []byte]struct{}
	sseMu        sync.Mutex
}

func NewHandler(engine *reconciler.Engine) *Handler {
	h := &Handler{
		engine:     engine,
		sseClients: make(map[chan []byte]struct{}),
	}
	h.loadDatasources()
	h.loadChecks()
	return h
}

func (h *Handler) loadDatasources() {
	data, err := os.ReadFile(datasourcesFile)
	if err != nil {
		return
	}
	var configs []datasource.DSConfig
	if err := json.Unmarshal(data, &configs); err != nil {
		log.Printf("failed to parse %s: %v", datasourcesFile, err)
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10_000_000_000)
	defer cancel()
	for _, cfg := range configs {
		ds, err := datasource.New(cfg)
		if err != nil {
			log.Printf("skip datasource %s: %v", cfg.Name, err)
			continue
		}
		if err := ds.Connect(ctx); err != nil {
			log.Printf("skip datasource %s: connect failed: %v", cfg.Name, err)
			continue
		}
		h.engine.RegisterSource(cfg.Name, ds)
		h.dsConfigs = append(h.dsConfigs, cfg)
		log.Printf("loaded datasource: %s (%s)", cfg.Name, cfg.Type)
	}
}

func (h *Handler) saveDatasources(configs []datasource.DSConfig) {
	data, err := json.MarshalIndent(configs, "", "  ")
	if err != nil {
		log.Printf("failed to marshal datasources: %v", err)
		return
	}
	if err := os.WriteFile(datasourcesFile, data, 0644); err != nil {
		log.Printf("failed to write %s: %v", datasourcesFile, err)
	}
}

func (h *Handler) loadChecks() {
	data, err := os.ReadFile(checksFile)
	if err != nil {
		return
	}
	if err := json.Unmarshal(data, &h.checks); err != nil {
		log.Printf("failed to parse %s: %v", checksFile, err)
		return
	}
	log.Printf("loaded %d checks from %s", len(h.checks), checksFile)
}

func (h *Handler) saveChecks() {
	data, err := json.MarshalIndent(h.checks, "", "  ")
	if err != nil {
		log.Printf("failed to marshal checks: %v", err)
		return
	}
	if err := os.WriteFile(checksFile, data, 0644); err != nil {
		log.Printf("failed to write %s: %v", checksFile, err)
	}
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
	r.Put("/checks/{id}", h.updateCheck)
	r.Post("/checks/{id}/run", h.runCheck)
	r.Post("/checks/run-all", h.runAllChecks)
	r.Get("/checks/last-results", h.lastResults)
	r.Delete("/checks/{id}", h.removeCheck)

	// SSE events stream
	r.Get("/events", h.sseHandler)

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

	h.mu.Lock()
	// Replace if exists, otherwise append
	found := false
	for i, c := range h.dsConfigs {
		if c.Name == cfg.Name {
			h.dsConfigs[i] = cfg
			found = true
			break
		}
	}
	if !found {
		h.dsConfigs = append(h.dsConfigs, cfg)
	}
	h.saveDatasources(h.dsConfigs)
	h.mu.Unlock()

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

	h.mu.Lock()
	for i, c := range h.dsConfigs {
		if c.Name == name {
			h.dsConfigs = append(h.dsConfigs[:i], h.dsConfigs[i+1:]...)
			break
		}
	}
	h.saveDatasources(h.dsConfigs)
	h.mu.Unlock()

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
	h.mu.Lock()
	h.checks = append(h.checks, check)
	h.saveChecks()
	h.mu.Unlock()
	writeJSON(w, map[string]string{"status": "added", "id": check.ID})
}

func (h *Handler) updateCheck(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var check models.CheckConfig
	if err := json.NewDecoder(r.Body).Decode(&check); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	check.ID = id

	h.mu.Lock()
	found := false
	for i, c := range h.checks {
		if c.ID == id {
			h.checks[i] = check
			found = true
			break
		}
	}
	h.saveChecks()
	h.mu.Unlock()

	if !found {
		writeError(w, http.StatusNotFound, "check not found: "+id)
		return
	}
	writeJSON(w, map[string]string{"status": "updated", "id": id})
}

func (h *Handler) removeCheck(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	h.mu.Lock()
	for i, c := range h.checks {
		if c.ID == id {
			h.checks = append(h.checks[:i], h.checks[i+1:]...)
			h.saveChecks()
			h.mu.Unlock()
			writeJSON(w, map[string]string{"status": "removed"})
			return
		}
	}
	h.mu.Unlock()
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
	h.broadcast(result)
	h.saveResult(result)
	writeJSON(w, result)
}

func (h *Handler) runAllChecks(w http.ResponseWriter, r *http.Request) {
	var results []*models.CheckResult
	for _, check := range h.checks {
		result, err := h.engine.RunCheck(r.Context(), check)
		if err != nil {
			errResult := &models.CheckResult{
				CheckID:   check.ID,
				CheckName: check.Name,
				Status:    models.StatusError,
			}
			results = append(results, errResult)
			h.broadcast(errResult)
			continue
		}
		results = append(results, result)
		h.broadcast(result)
	}
	h.saveAllResults(results)
	writeJSON(w, results)
}

func (h *Handler) lastResults(w http.ResponseWriter, r *http.Request) {
	data, err := os.ReadFile(resultsFile)
	if err != nil {
		writeJSON(w, []interface{}{})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

func (h *Handler) saveResult(result *models.CheckResult) {
	h.mu.Lock()
	defer h.mu.Unlock()

	// Load existing results
	var results []*models.CheckResult
	if data, err := os.ReadFile(resultsFile); err == nil {
		json.Unmarshal(data, &results)
	}

	// Upsert
	found := false
	for i, r := range results {
		if r.CheckID == result.CheckID {
			results[i] = result
			found = true
			break
		}
	}
	if !found {
		results = append(results, result)
	}

	if data, err := json.MarshalIndent(results, "", "  "); err == nil {
		os.WriteFile(resultsFile, data, 0644)
	}
}

func (h *Handler) saveAllResults(results []*models.CheckResult) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if data, err := json.MarshalIndent(results, "", "  "); err == nil {
		os.WriteFile(resultsFile, data, 0644)
	}
}

func (h *Handler) supportedTypes(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, datasource.SupportedTypes())
}

// =============================================
// SSE
// =============================================

func (h *Handler) sseHandler(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	ch := make(chan []byte, 16)
	h.sseMu.Lock()
	h.sseClients[ch] = struct{}{}
	h.sseMu.Unlock()

	defer func() {
		h.sseMu.Lock()
		delete(h.sseClients, ch)
		h.sseMu.Unlock()
		close(ch)
	}()

	// Send initial ping
	fmt.Fprintf(w, "event: ping\ndata: connected\n\n")
	flusher.Flush()

	for {
		select {
		case <-r.Context().Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			fmt.Fprintf(w, "event: check-result\ndata: %s\n\n", msg)
			flusher.Flush()
		}
	}
}

func (h *Handler) broadcast(eventData interface{}) {
	data, err := json.Marshal(eventData)
	if err != nil {
		return
	}
	h.sseMu.Lock()
	defer h.sseMu.Unlock()
	for ch := range h.sseClients {
		select {
		case ch <- data:
		default:
			// drop if client is slow
		}
	}
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
