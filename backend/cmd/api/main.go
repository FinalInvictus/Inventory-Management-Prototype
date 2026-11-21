// Command api runs the Garment Management prototype backend and (optionally)
// serves the built web app from the same origin.
package main

import (
	"flag"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"garment/backend/internal/api"
	"garment/backend/internal/classification"
	"garment/backend/internal/demo"
)

func main() {
	addr := flag.String("addr", envOr("ADDR", ":8080"), "listen address")
	data := flag.String("data", envOr("DATA_DIR", "data"), "directory for demo state and uploaded images")
	static := flag.String("static", envOr("STATIC_DIR", ""), "directory with built web app (apps/web/dist)")
	flag.Parse()

	if *static == "" {
		for _, c := range []string{"../apps/web/dist", "apps/web/dist", "web"} {
			if _, err := os.Stat(filepath.Join(c, "index.html")); err == nil {
				*static = c
				break
			}
		}
	}
	store, err := demo.Open(*data)
	if err != nil {
		log.Fatalf("open store: %v", err)
	}
	srv := api.New(store, *static)
	log.Printf("Garment prototype API on %s (AI mode: %s, static: %q, data: %q)", *addr, classification.Mode(), *static, *data)
	hs := &http.Server{Addr: *addr, Handler: srv.Handler(), ReadHeaderTimeout: 10 * time.Second}
	log.Fatal(hs.ListenAndServe())
}

func envOr(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}
