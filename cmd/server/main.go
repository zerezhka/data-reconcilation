package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/sergey/data-reconciler/internal/api"
	"github.com/sergey/data-reconciler/internal/reconciler"

	// Register all datasource drivers
	_ "github.com/sergey/data-reconciler/internal/datasource"
)

func main() {
	port := flag.Int("port", 8080, "HTTP server port")
	flag.Parse()

	engine := reconciler.New()
	handler := api.NewHandler(engine)

	r := chi.NewRouter()

	// Middleware
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: true,
	}))

	// API routes
	r.Mount("/api", handler.Routes())

	// Serve frontend static files (for production — embed or serve from ./web/dist)
	staticDir := "./web/dist"
	if _, err := os.Stat(staticDir); err == nil {
		fileServer := http.FileServer(http.Dir(staticDir))
		r.Get("/*", func(w http.ResponseWriter, r *http.Request) {
			// SPA fallback — serve index.html for non-file routes
			if _, err := os.Stat(staticDir + r.URL.Path); os.IsNotExist(err) {
				http.ServeFile(w, r, staticDir+"/index.html")
				return
			}
			fileServer.ServeHTTP(w, r)
		})
	}

	addr := fmt.Sprintf(":%d", *port)
	log.Printf("🚀 Data Reconciler starting on http://localhost%s", addr)
	log.Printf("📊 API available at http://localhost%s/api", addr)
	log.Printf("🗄️  Supported datasources: PostgreSQL, ClickHouse, MySQL/MariaDB, SQLite, MSSQL")

	if err := http.ListenAndServe(addr, r); err != nil {
		log.Fatal(err)
	}
}
