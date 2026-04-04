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

var version = "dev"

func main() {
	port := flag.Int("port", 8080, "HTTP server port")
	staticDir := flag.String("static", "", "Path to frontend static files (optional)")
	showVersion := flag.Bool("version", false, "Print version and exit")
	flag.Parse()

	if *showVersion {
		fmt.Println(version)
		os.Exit(0)
	}

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

	// Version endpoint
	r.Get("/api/version", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"version":"%s"}`, version)
	})

	// Optionally serve frontend static files
	dir := *staticDir
	if dir == "" {
		// Auto-detect common paths
		for _, candidate := range []string{"./web/dist", "./frontend", "./static"} {
			if _, err := os.Stat(candidate); err == nil {
				dir = candidate
				break
			}
		}
	}

	if dir != "" {
		fileServer := http.FileServer(http.Dir(dir))
		r.Get("/*", func(w http.ResponseWriter, r *http.Request) {
			if _, err := os.Stat(dir + r.URL.Path); os.IsNotExist(err) {
				http.ServeFile(w, r, dir+"/index.html")
				return
			}
			fileServer.ServeHTTP(w, r)
		})
		log.Printf("📁 Serving frontend from %s", dir)
	}

	addr := fmt.Sprintf(":%d", *port)
	log.Printf("🚀 Data Reconciler %s starting on http://localhost%s", version, addr)
	log.Printf("📊 API available at http://localhost%s/api", addr)

	if err := http.ListenAndServe(addr, r); err != nil {
		log.Fatal(err)
	}
}
