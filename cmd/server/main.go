package main

import (
	"embed"
	"flag"
	"fmt"
	"io/fs"
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

//go:embed static
var embeddedStatic embed.FS

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

	// Serve frontend: prefer external web/dist (dev), fallback to embedded
	staticDir := "./web/dist"
	if _, err := os.Stat(staticDir); err == nil {
		fileServer := http.FileServer(http.Dir(staticDir))
		r.Get("/*", spaHandler(staticDir, fileServer))
		log.Println("📁 Serving frontend from ./web/dist")
	} else {
		subFS, err := fs.Sub(embeddedStatic, "static")
		if err != nil {
			log.Fatal(err)
		}
		fileServer := http.FileServer(http.FS(subFS))
		r.Get("/*", spaHandlerFS(subFS, fileServer))
		log.Println("📦 Serving embedded frontend")
	}

	addr := fmt.Sprintf(":%d", *port)
	log.Printf("🚀 Data Reconciler starting on http://localhost%s", addr)
	log.Printf("📊 API available at http://localhost%s/api", addr)

	if err := http.ListenAndServe(addr, r); err != nil {
		log.Fatal(err)
	}
}

// spaHandler serves files from disk with SPA fallback
func spaHandler(dir string, fileServer http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if _, err := os.Stat(dir + r.URL.Path); os.IsNotExist(err) {
			http.ServeFile(w, r, dir+"/index.html")
			return
		}
		fileServer.ServeHTTP(w, r)
	}
}

// spaHandlerFS serves files from embed.FS with SPA fallback
func spaHandlerFS(fsys fs.FS, fileServer http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if path[0] == '/' {
			path = path[1:]
		}
		if _, err := fs.Stat(fsys, path); os.IsNotExist(err) {
			// SPA fallback — serve index.html
			f, err := fsys.Open("index.html")
			if err != nil {
				http.NotFound(w, r)
				return
			}
			defer f.Close()
			stat, _ := f.Stat()
			http.ServeContent(w, r, "index.html", stat.ModTime(), f.(readSeeker))
			return
		}
		fileServer.ServeHTTP(w, r)
	}
}

type readSeeker interface {
	Read(p []byte) (n int, err error)
	Seek(offset int64, whence int) (int64, error)
}
