// Package api exposes the prototype REST API (SRS §12) over net/http.
package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"garment/backend/internal/barcodes"
	"garment/backend/internal/classification"
	"garment/backend/internal/demo"
	"garment/backend/internal/pricing"
)

type Server struct {
	Store     *demo.Store
	StaticDir string
	MockDelay time.Duration // simulated processing time for demo predictions

	mu       sync.Mutex
	sessions map[string]string // token -> user id
	pending  map[string]string // presigned image id -> extension
}

func New(store *demo.Store, staticDir string) *Server {
	return &Server{Store: store, StaticDir: staticDir, MockDelay: 180 * time.Millisecond,
		sessions: map[string]string{}, pending: map[string]string{}}
}

// ---------- helpers ----------

type apiError struct {
	status int
	code   string
	msg    string
}

func (e *apiError) Error() string { return e.msg }

func errf(status int, code, format string, a ...any) error {
	return &apiError{status, code, fmt.Sprintf(format, a...)}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, err error) {
	var ae *apiError
	if errors.As(err, &ae) {
		writeJSON(w, ae.status, map[string]any{"error": map[string]string{"code": ae.code, "message": ae.msg}})
		return
	}
	writeJSON(w, 500, map[string]any{"error": map[string]string{"code": "internal", "message": err.Error()}})
}

func decode(r *http.Request, v any) error {
	dec := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	if err := dec.Decode(v); err != nil && err != io.EOF {
		return errf(400, "bad_request", "invalid JSON body: %v", err)
	}
	return nil
}

func token() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

type handler func(w http.ResponseWriter, r *http.Request, u demo.User) error

func extractBearerToken(hdr string) string {
	const prefix = "bearer "
	if len(hdr) > len(prefix) && strings.EqualFold(hdr[:len(prefix)], prefix) {
		return strings.TrimSpace(hdr[len(prefix):])
	}
	return ""
}

func (s *Server) auth(roles []string, h handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tok := extractBearerToken(r.Header.Get("Authorization"))
		s.mu.Lock()
		uid, ok := s.sessions[tok]
		s.mu.Unlock()
		if !ok || tok == "" {
			writeErr(w, errf(401, "unauthorized", "Demo session missing or expired. Please sign in again."))
			return
		}
		var user *demo.User
		s.Store.Read(func(st *demo.State) {
			if u := st.User(uid); u != nil {
				c := *u
				user = &c
			}
		})
		if user == nil {
			writeErr(w, errf(401, "unauthorized", "Unknown demo user"))
			return
		}
		if len(roles) > 0 {
			allowed := false
			for _, rl := range roles {
				allowed = allowed || rl == user.Role
			}
			if !allowed {
				writeErr(w, errf(403, "forbidden", "This action requires the %s role", strings.Join(roles, "/")))
				return
			}
		}
		if err := h(w, r, *user); err != nil {
			writeErr(w, err)
		}
	}
}

var any_ = []string(nil)
var adminOnly = []string{"admin"}

// ---------- routing ----------

func (s *Server) Handler() http.Handler {
	m := http.NewServeMux()
	m.HandleFunc("GET /api/v1/health", s.health)
	m.HandleFunc("POST /api/v1/demo/login", s.login)
	m.HandleFunc("GET /api/v1/demo/me", s.auth(any_, s.me))
	m.HandleFunc("GET /api/v1/demo/bootstrap", s.auth(any_, s.bootstrap))
	m.HandleFunc("POST /api/v1/demo/logout", s.auth(any_, s.logout))
	m.HandleFunc("POST /api/v1/demo/reset", s.auth(any_, s.reset))
	m.HandleFunc("GET /api/v1/demo/samples", s.samples)
	m.HandleFunc("GET /api/v1/demo/samples/{id}/image", s.sampleImage)

	m.HandleFunc("GET /api/v1/categories", s.auth(any_, s.listCategories))
	m.HandleFunc("POST /api/v1/categories", s.auth(adminOnly, s.createCategory))
	m.HandleFunc("PUT /api/v1/categories/{id}", s.auth(adminOnly, s.updateCategory))
	m.HandleFunc("GET /api/v1/branches", s.auth(any_, s.listBranches))
	m.HandleFunc("GET /api/v1/customers", s.auth(any_, s.listCustomers))

	m.HandleFunc("GET /api/v1/batches", s.auth(any_, s.listBatches))
	m.HandleFunc("POST /api/v1/batches", s.auth(any_, s.createBatch))
	m.HandleFunc("PATCH /api/v1/batches/{id}", s.auth(any_, s.updateBatch))

	m.HandleFunc("POST /api/v1/images/presign", s.auth(any_, s.presign))
	m.HandleFunc("PUT /api/v1/images/{id}", s.auth(any_, s.uploadImage))
	m.HandleFunc("GET /api/v1/images/{id}", s.getImage)

	m.HandleFunc("POST /api/v1/pricing/preview", s.auth(any_, s.pricePreview))
	m.HandleFunc("POST /api/v1/garments/classify", s.auth(any_, s.classify))
	m.HandleFunc("POST /api/v1/garments", s.auth(any_, s.createGarment))
	m.HandleFunc("GET /api/v1/garments", s.auth(any_, s.listGarments))
	m.HandleFunc("GET /api/v1/garments/{id}", s.auth(any_, s.getGarment))
	m.HandleFunc("GET /api/v1/barcodes/{code}", s.auth(any_, s.resolveBarcode))
	m.HandleFunc("GET /api/v1/barcodes/{code}/svg", s.barcodeSVG)

	m.HandleFunc("POST /api/v1/sales", s.auth(any_, s.createSale))
	m.HandleFunc("POST /api/v1/sales/{id}/checkout", s.auth(any_, s.checkout))
	m.HandleFunc("GET /api/v1/sales", s.auth(any_, s.listSales))
	m.HandleFunc("GET /api/v1/sales/{id}", s.auth(any_, s.getSale))

	m.HandleFunc("GET /api/v1/dashboard/summary", s.auth(any_, s.dashboard))
	m.HandleFunc("GET /api/v1/settings", s.auth(any_, s.getSettings))
	m.HandleFunc("PUT /api/v1/settings", s.auth(adminOnly, s.updateSettings))
	m.HandleFunc("GET /api/v1/events", s.auth(any_, s.listEvents))

	m.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		writeErr(w, errf(404, "not_found", "No API route for %s %s", r.Method, r.URL.Path))
	})
	m.HandleFunc("/", s.static)
	return logRequests(m)
}

func logRequests(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if os.Getenv("API_LOG") == "1" && strings.HasPrefix(r.URL.Path, "/api/") {
			fmt.Printf("%s %s %s\n", time.Now().Format("15:04:05"), r.Method, r.URL.Path)
		}
		h.ServeHTTP(w, r)
	})
}

func (s *Server) static(w http.ResponseWriter, r *http.Request) {
	if s.StaticDir == "" {
		http.Error(w, "Web app not built. Run the frontend build or use the Vite dev server.", 404)
		return
	}
	p := filepath.Join(s.StaticDir, filepath.FromSlash(filepath.Clean("/"+r.URL.Path)))
	if fi, err := os.Stat(p); err == nil && !fi.IsDir() {
		if strings.Contains(r.URL.Path, "/assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		}
		http.ServeFile(w, r, p)
		return
	}
	if strings.HasPrefix(r.URL.Path, "/assets/") {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Cache-Control", "no-cache")
	http.ServeFile(w, r, filepath.Join(s.StaticDir, "index.html")) // SPA fallback
}

// ---------- demo / auth ----------

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"status": "ok", "environment": "demo", "ai_mode": classification.Mode(),
		"printer": "simulated (preview/print dialog only)", "payments": "simulated (no gateway)"})
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Username string `json:"username"`
		Password string `json:"password"`
		Role     string `json:"role"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	var user *demo.User
	s.Store.Read(func(st *demo.State) {
		for _, u := range st.Users {
			match := false
			if in.Role != "" && in.Username == "" {
				match = u.Role == in.Role // demo role switcher
			} else {
				match = strings.EqualFold(u.Username, strings.TrimSpace(in.Username)) && demo.DemoCredentials[u.Username] == in.Password
			}
			if match {
				c := u
				user = &c
				return
			}
		}
	})
	if user == nil {
		writeErr(w, errf(401, "invalid_credentials", "Incorrect demo username or password"))
		return
	}
	tok := token()
	s.mu.Lock()
	s.sessions[tok] = user.ID
	s.mu.Unlock()
	writeJSON(w, 200, map[string]any{"token": tok, "user": user})
}

func (s *Server) me(w http.ResponseWriter, r *http.Request, u demo.User) error {
	writeJSON(w, 200, map[string]any{"user": u})
	return nil
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request, u demo.User) error {
	tok := extractBearerToken(r.Header.Get("Authorization"))
	s.mu.Lock()
	delete(s.sessions, tok)
	s.mu.Unlock()
	writeJSON(w, 200, map[string]any{"ok": true})
	return nil
}

func (s *Server) reset(w http.ResponseWriter, r *http.Request, u demo.User) error {
	if err := s.Store.Reset(); err != nil {
		return err
	}
	s.mu.Lock()
	s.pending = map[string]string{}
	s.mu.Unlock()
	writeJSON(w, 200, map[string]any{"ok": true, "message": "Demo data restored to the seeded state"})
	return nil
}

type sampleView struct {
	demo.Sample
	ImageURL string `json:"image_url"`
}

func (s *Server) samples(w http.ResponseWriter, r *http.Request) {
	var out []sampleView
	for _, sm := range demo.Samples {
		out = append(out, sampleView{sm, "/api/v1/demo/samples/" + sm.ID + "/image"})
	}
	writeJSON(w, 200, map[string]any{"samples": out})
}

func (s *Server) sampleImage(w http.ResponseWriter, r *http.Request) {
	sm, ok := demo.SampleByID(r.PathValue("id"))
	if !ok {
		writeErr(w, errf(404, "not_found", "Unknown sample"))
		return
	}
	w.Header().Set("Content-Type", "image/svg+xml")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	io.WriteString(w, demo.SampleSVG(sm))
}

// ---------- categories / branches ----------

func (s *Server) listCategories(w http.ResponseWriter, r *http.Request, u demo.User) error {
	var out []map[string]any
	s.Store.Read(func(st *demo.State) {
		for _, c := range st.Categories {
			count := 0
			for _, g := range st.Garments {
				if g.CategoryID == c.ID && g.Status == "available" {
					count++
				}
			}
			out = append(out, map[string]any{"id": c.ID, "name": c.Name, "parent_id": c.ParentID, "default_price": c.DefaultPrice,
				"active": c.Active, "subcategories": c.Subcategories, "is_leaf": st.IsLeaf(c.ID), "available_count": count})
		}
	})
	writeJSON(w, 200, map[string]any{"categories": out})
	return nil
}

type categoryInput struct {
	ID            string   `json:"id"`
	Name          *string  `json:"name"`
	ParentID      *string  `json:"parent_id"`
	DefaultPrice  *float64 `json:"default_price"`
	Active        *bool    `json:"active"`
	Subcategories []string `json:"subcategories"`
}

func slug(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	var b strings.Builder
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == ' ' || r == '-' || r == '_':
			b.WriteRune('_')
		}
	}
	return strings.Trim(b.String(), "_")
}

func (s *Server) createCategory(w http.ResponseWriter, r *http.Request, u demo.User) error {
	var in categoryInput
	if err := decode(r, &in); err != nil {
		return err
	}
	if in.Name == nil || strings.TrimSpace(*in.Name) == "" {
		return errf(400, "validation", "Category name is required")
	}
	var created demo.Category
	err := s.Store.Write(func(st *demo.State) error {
		id := slug(*in.Name)
		if id == "" || st.Category(id) != nil {
			return errf(409, "conflict", "A category with this name already exists")
		}
		c := demo.Category{ID: id, Name: strings.TrimSpace(*in.Name), Active: true, Subcategories: in.Subcategories}
		if in.ParentID != nil && *in.ParentID != "" {
			p := st.Category(*in.ParentID)
			if p == nil || p.ParentID != "" {
				return errf(400, "validation", "Parent must be an existing top-level group")
			}
			for _, g := range st.Garments {
				if g.CategoryID == p.ID {
					return errf(400, "validation", "Parent cannot be a leaf category that already holds garments")
				}
			}
			c.ParentID = p.ID
		}
		if in.DefaultPrice != nil {
			if err := pricing.Validate(*in.DefaultPrice); err != nil {
				return errf(400, "validation", "%v", err)
			}
			c.DefaultPrice = pricing.Round2(*in.DefaultPrice)
		}
		st.Categories = append(st.Categories, c)
		st.AddEvent(s.Store.Now(), c.ID, "category", "created", "Category "+c.Name+" created", u.ID)
		created = c
		return nil
	})
	if err != nil {
		return err
	}
	writeJSON(w, 201, created)
	return nil
}

func (s *Server) updateCategory(w http.ResponseWriter, r *http.Request, u demo.User) error {
	var in categoryInput
	if err := decode(r, &in); err != nil {
		return err
	}
	var updated demo.Category
	err := s.Store.Write(func(st *demo.State) error {
		c := st.Category(r.PathValue("id"))
		if c == nil {
			return errf(404, "not_found", "Category not found")
		}
		var changes []string
		if in.Name != nil {
			if strings.TrimSpace(*in.Name) == "" {
				return errf(400, "validation", "Category name cannot be empty")
			}
			c.Name = strings.TrimSpace(*in.Name)
			changes = append(changes, "name")
		}
		if in.DefaultPrice != nil {
			if err := pricing.Validate(*in.DefaultPrice); err != nil {
				return errf(400, "validation", "%v", err)
			}
			sym := st.Settings.CurrencySymbol
			if sym == "" {
				sym = "₹"
			}
			changes = append(changes, fmt.Sprintf("default price %s%.2f → %s%.2f", sym, c.DefaultPrice, sym, *in.DefaultPrice))
			c.DefaultPrice = pricing.Round2(*in.DefaultPrice)
		}
		if in.Active != nil {
			c.Active = *in.Active
			changes = append(changes, fmt.Sprintf("active=%v", *in.Active))
		}
		if in.Subcategories != nil {
			c.Subcategories = in.Subcategories
			changes = append(changes, "subcategories")
		}
		if len(changes) > 0 {
			st.AddEvent(s.Store.Now(), c.ID, "category", "updated", c.Name+": "+strings.Join(changes, ", ")+" (existing garments keep their saved price)", u.ID)
		}
		updated = *c
		return nil
	})
	if err != nil {
		return err
	}
	writeJSON(w, 200, updated)
	return nil
}

func (s *Server) listBranches(w http.ResponseWriter, r *http.Request, u demo.User) error {
	var out []demo.Branch
	s.Store.Read(func(st *demo.State) { out = append(out, st.Branches...) })
	writeJSON(w, 200, map[string]any{"branches": out})
	return nil
}

func (s *Server) listCustomers(w http.ResponseWriter, r *http.Request, u demo.User) error {
	var out []demo.Customer
	s.Store.Read(func(st *demo.State) { out = append(out, st.Customers...) })
	writeJSON(w, 200, map[string]any{"customers": out})
	return nil
}

// ---------- batches ----------

type batchView struct {
	demo.Batch
	BranchName    string `json:"branch_name"`
	CreatedByName string `json:"created_by_name"`
	GarmentCount  int    `json:"garment_count"`
}

func batchViewOf(st *demo.State, b demo.Batch) batchView {
	v := batchView{Batch: b}
	for _, br := range st.Branches {
		if br.ID == b.BranchID {
			v.BranchName = br.Name
		}
	}
	if u := st.User(b.CreatedBy); u != nil {
		v.CreatedByName = u.Name
	}
	for _, g := range st.Garments {
		if g.BatchID == b.ID {
			v.GarmentCount++
		}
	}
	return v
}

func (s *Server) listBatches(w http.ResponseWriter, r *http.Request, u demo.User) error {
	var out []batchView
	s.Store.Read(func(st *demo.State) {
		for _, b := range st.Batches {
			out = append(out, batchViewOf(st, b))
		}
	})
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	writeJSON(w, 200, map[string]any{"batches": out})
	return nil
}

func (s *Server) createBatch(w http.ResponseWriter, r *http.Request, u demo.User) error {
	var in struct {
		Name         string   `json:"name"`
		Reference    string   `json:"reference"`
		BranchID     string   `json:"branch_id"`
		DefaultPrice *float64 `json:"default_price"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		return errf(400, "validation", "Batch name is required")
	}
	if in.DefaultPrice != nil {
		if err := pricing.Validate(*in.DefaultPrice); err != nil {
			return errf(400, "validation", "%v", err)
		}
		p := pricing.Round2(*in.DefaultPrice)
		in.DefaultPrice = &p
	}
	var out batchView
	err := s.Store.Write(func(st *demo.State) error {
		br := in.BranchID
		if br == "" {
			br = st.Settings.BranchID
		}
		found := false
		for _, b := range st.Branches {
			found = found || b.ID == br
		}
		if !found {
			return errf(400, "validation", "Unknown branch")
		}
		b := demo.Batch{ID: st.NextID("batch", "bat"), Name: in.Name, Reference: strings.TrimSpace(in.Reference), BranchID: br,
			DefaultPrice: in.DefaultPrice, CreatedBy: u.ID, CreatedAt: s.Store.Now()}
		st.Batches = append(st.Batches, b)
		desc := "Batch " + b.Name + " created"
		if b.DefaultPrice != nil {
			sym := st.Settings.CurrencySymbol
			if sym == "" {
				sym = "₹"
			}
			desc += fmt.Sprintf(" with default price %s%.2f", sym, *b.DefaultPrice)
		}
		st.AddEvent(b.CreatedAt, b.ID, "batch", "created", desc, u.ID)
		out = batchViewOf(st, b)
		return nil
	})
	if err != nil {
		return err
	}
	writeJSON(w, 201, out)
	return nil
}

func (s *Server) updateBatch(w http.ResponseWriter, r *http.Request, u demo.User) error {
	var raw map[string]json.RawMessage
	if err := decode(r, &raw); err != nil {
		return err
	}
	var out batchView
	err := s.Store.Write(func(st *demo.State) error {
		b := st.Batch(r.PathValue("id"))
		if b == nil {
			return errf(404, "not_found", "Batch not found")
		}
		if v, ok := raw["name"]; ok {
			var n string
			if json.Unmarshal(v, &n) != nil || strings.TrimSpace(n) == "" {
				return errf(400, "validation", "Batch name cannot be empty")
			}
			b.Name = strings.TrimSpace(n)
		}
		if v, ok := raw["reference"]; ok {
			var ref string
			if json.Unmarshal(v, &ref) != nil {
				return errf(400, "validation", "Batch reference must be a string")
			}
			b.Reference = strings.TrimSpace(ref)
		}
		if v, ok := raw["default_price"]; ok {
			if string(v) == "null" {
				b.DefaultPrice = nil
				st.AddEvent(s.Store.Now(), b.ID, "batch", "updated", "Batch default price cleared", u.ID)
			} else {
				var p float64
				if json.Unmarshal(v, &p) != nil {
					return errf(400, "validation", "default_price must be a number or null")
				}
				if err := pricing.Validate(p); err != nil {
					return errf(400, "validation", "%v", err)
				}
				p = pricing.Round2(p)
				b.DefaultPrice = &p
				sym := st.Settings.CurrencySymbol
				if sym == "" {
					sym = "₹"
				}
				st.AddEvent(s.Store.Now(), b.ID, "batch", "updated", fmt.Sprintf("Batch default price set to %s%.2f", sym, p), u.ID)
			}
		}
		out = batchViewOf(st, *b)
		return nil
	})
	if err != nil {
		return err
	}
	writeJSON(w, 200, out)
	return nil
}

// ---------- images ----------

var allowedImageTypes = map[string]string{"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}

func (s *Server) presign(w http.ResponseWriter, r *http.Request, u demo.User) error {
	var in struct {
		ContentType string `json:"content_type"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	ext, ok := allowedImageTypes[in.ContentType]
	if !ok {
		return errf(400, "validation", "Unsupported image type %q (use JPEG, PNG or WebP)", in.ContentType)
	}
	id := "img_" + token()[:12]
	s.mu.Lock()
	s.pending[id] = ext
	s.mu.Unlock()
	writeJSON(w, 200, map[string]any{"image_id": id, "image_ref": "upload:" + id, "upload_url": "/api/v1/images/" + id, "method": "PUT",
		"headers": map[string]string{"Content-Type": in.ContentType}, "expires_in": 600, "image_url": "/api/v1/images/" + id})
	return nil
}

func (s *Server) uploadImage(w http.ResponseWriter, r *http.Request, u demo.User) error {
	id := r.PathValue("id")
	s.mu.Lock()
	ext, ok := s.pending[id]
	s.mu.Unlock()
	if !ok {
		return errf(404, "not_found", "Upload URL is invalid or expired")
	}
	data, err := io.ReadAll(io.LimitReader(r.Body, 8<<20+1))
	if err != nil {
		return errf(400, "bad_request", "Could not read upload")
	}
	if len(data) > 8<<20 {
		return errf(413, "too_large", "Image larger than 8 MB")
	}
	if len(data) < 100 {
		return errf(400, "validation", "Image is empty")
	}
	if err := os.WriteFile(filepath.Join(s.Store.ImageDir(), id+ext), data, 0o644); err != nil {
		return err
	}
	s.mu.Lock()
	delete(s.pending, id)
	s.mu.Unlock()
	writeJSON(w, 200, map[string]any{"image_ref": "upload:" + id, "image_url": "/api/v1/images/" + id, "bytes": len(data)})
	return nil
}

func (s *Server) findUpload(id string) (string, string) {
	if strings.ContainsAny(id, `/\.`) {
		return "", ""
	}
	for mime, ext := range allowedImageTypes {
		p := filepath.Join(s.Store.ImageDir(), id+ext)
		if _, err := os.Stat(p); err == nil {
			return p, mime
		}
	}
	return "", ""
}

func (s *Server) getImage(w http.ResponseWriter, r *http.Request) {
	p, mime := s.findUpload(r.PathValue("id"))
	if p == "" {
		writeErr(w, errf(404, "not_found", "Image not found"))
		return
	}
	w.Header().Set("Content-Type", mime)
	http.ServeFile(w, r, p)
}

func imageURL(ref string) string {
	switch {
	case strings.HasPrefix(ref, "sample:"):
		return "/api/v1/demo/samples/" + strings.TrimPrefix(ref, "sample:") + "/image"
	case strings.HasPrefix(ref, "upload:"):
		return "/api/v1/images/" + strings.TrimPrefix(ref, "upload:")
	}
	return ""
}

func (s *Server) validImageRef(ref string) bool {
	if strings.HasPrefix(ref, "sample:") {
		_, ok := demo.SampleByID(strings.TrimPrefix(ref, "sample:"))
		return ok
	}
	if strings.HasPrefix(ref, "upload:") {
		p, _ := s.findUpload(strings.TrimPrefix(ref, "upload:"))
		return p != ""
	}
	return false
}

// ---------- classification ----------

func (s *Server) classify(w http.ResponseWriter, r *http.Request, u demo.User) error {
	var in struct {
		ImageRef string `json:"image_ref"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	if !s.validImageRef(in.ImageRef) {
		return errf(400, "validation", "Unknown image_ref; capture or choose an image first")
	}
	var allowed []classification.AllowedCategory
	s.Store.Read(func(st *demo.State) {
		for _, c := range st.ActiveLeafCategories() {
			allowed = append(allowed, classification.AllowedCategory{ID: c.ID, Name: c.Name})
		}
	})
	if len(allowed) == 0 {
		return errf(409, "no_categories", "No active categories configured")
	}
	start := time.Now()
	var res classification.Result
	if strings.HasPrefix(in.ImageRef, "sample:") {
		sm, _ := demo.SampleByID(strings.TrimPrefix(in.ImageRef, "sample:"))
		select {
		case <-time.After(s.MockDelay):
		case <-r.Context().Done():
			return r.Context().Err()
		}
		res = classification.Result{Category: sm.Category, Confidence: sm.Confidence, Attributes: map[string]string{}, Source: "demo_mock",
			Notice: "Demo data: deterministic mocked prediction for a prepared sample image."}
		for _, a := range sm.Alternatives {
			res.Alternatives = append(res.Alternatives, classification.Alternative{Category: a.Category, Score: a.Score})
		}
		for k, v := range sm.Attributes {
			res.Attributes[k] = v
		}
		var err error
		if res, err = classification.Normalize(res, allowed); err != nil {
			// sample's category was deactivated by admin: fall back transparently
			res = classification.Heuristic([]byte(in.ImageRef), allowed)
		}
	} else {
		p, mime := s.findUpload(strings.TrimPrefix(in.ImageRef, "upload:"))
		data, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		if classification.Live() {
			ctx, cancel := context.WithTimeout(r.Context(), classification.Timeout)
			res, err = classification.Vision(ctx, data, mime, allowed)
			cancel()
			if err != nil {
				res = classification.Heuristic(data, allowed)
				res.Notice = "Vision API unavailable (" + err.Error() + "). Showing a demo fallback — please confirm the category."
			}
		} else {
			select {
			case <-time.After(s.MockDelay):
			case <-r.Context().Done():
				return r.Context().Err()
			}
			res = classification.Heuristic(data, allowed)
		}
	}
	res.LatencyMS = time.Since(start).Milliseconds()
	writeJSON(w, 200, res)
	return nil
}

// ---------- pricing ----------

type priceRequest struct {
	CategoryID    string   `json:"category_id"`
	BatchID       string   `json:"batch_id"`
	OverridePrice *float64 `json:"override_price"`
	PriceMode     string   `json:"price_mode"` // optional: category | batch | individual
}

func resolvePrice(st *demo.State, in priceRequest) (pricing.Result, map[string]any, error) {
	c := st.Category(in.CategoryID)
	if c == nil || !st.IsLeaf(c.ID) {
		return pricing.Result{}, nil, errf(400, "validation", "Choose a valid garment category")
	}
	if !c.Active {
		return pricing.Result{}, nil, errf(400, "validation", "Category %s is inactive", c.Name)
	}
	var batchDefault *float64
	if in.BatchID != "" {
		b := st.Batch(in.BatchID)
		if b == nil {
			return pricing.Result{}, nil, errf(400, "validation", "Batch not found")
		}
		batchDefault = b.DefaultPrice
	}
	pin := pricing.Input{CategoryDefault: c.DefaultPrice, BatchDefault: batchDefault, Override: in.OverridePrice}
	// An explicit mode lets the employee pick a rule deliberately; without it, precedence applies.
	switch in.PriceMode {
	case "":
	case pricing.SourceCategory:
		pin.BatchDefault, pin.Override = nil, nil
	case pricing.SourceBatch:
		if batchDefault == nil {
			return pricing.Result{}, nil, errf(400, "validation", "This batch has no default price; set one or choose another pricing mode")
		}
		pin.Override = nil
	case pricing.SourceIndividual:
		if in.OverridePrice == nil {
			return pricing.Result{}, nil, errf(400, "validation", "Enter the individual price")
		}
	default:
		return pricing.Result{}, nil, errf(400, "validation", "Unknown price_mode %q", in.PriceMode)
	}
	res, err := pricing.Resolve(pin)
	if err != nil {
		return res, nil, errf(400, "validation", "%v", err)
	}
	return res, map[string]any{"category_default": c.DefaultPrice, "batch_default": batchDefault, "override_price": in.OverridePrice}, nil
}

func (s *Server) pricePreview(w http.ResponseWriter, r *http.Request, u demo.User) error {
	var in priceRequest
	if err := decode(r, &in); err != nil {
		return err
	}
	var (
		res pricing.Result
		bd  map[string]any
		err error
	)
	s.Store.Read(func(st *demo.State) { res, bd, err = resolvePrice(st, in) })
	if err != nil {
		return err
	}
	writeJSON(w, 200, map[string]any{"price": res.Price, "price_source": res.Source, "breakdown": bd})
	return nil
}

// ---------- garments ----------

type garmentView struct {
	demo.Garment
	CategoryName  string       `json:"category_name"`
	ParentName    string       `json:"parent_name,omitempty"`
	BatchName     string       `json:"batch_name"`
	ImageURL      string       `json:"image_url"`
	BarcodeURL    string       `json:"barcode_url"`
	Description   string       `json:"description"`
	CreatedByName string       `json:"created_by_name"`
	SaleNumber    string       `json:"sale_number,omitempty"`
	Events        []demo.Event `json:"events,omitempty"`
}

func viewOf(st *demo.State, g demo.Garment, withEvents bool) garmentView {
	if g.AI != nil && g.AI.SuggestedName == "" {
		cp := *g.AI
		if c := st.Category(cp.Suggested); c != nil {
			cp.SuggestedName = c.Name
		} else {
			cp.SuggestedName = cp.Suggested
		}
		g.AI = &cp
	}
	v := garmentView{Garment: g, ImageURL: imageURL(g.ImageRef), BarcodeURL: "/api/v1/barcodes/" + g.Barcode + "/svg", Description: st.Describe(&g)}
	if c := st.Category(g.CategoryID); c != nil {
		v.CategoryName = c.Name
		if p := st.Category(c.ParentID); p != nil {
			v.ParentName = p.Name
		}
	}
	if b := st.Batch(g.BatchID); b != nil {
		v.BatchName = b.Name
	}
	if u := st.User(g.CreatedBy); u != nil {
		v.CreatedByName = u.Name
	}
	if sl := st.Sale(g.SaleID); sl != nil {
		v.SaleNumber = sl.Number
	}
	if withEvents {
		v.Events = st.EventsFor(g.ID)
	}
	return v
}

func (s *Server) createGarment(w http.ResponseWriter, r *http.Request, u demo.User) error {
	var in struct {
		priceRequest
		ImageRef   string            `json:"image_ref"`
		Attributes map[string]string `json:"attributes"`
		AI         *demo.AISnapshot  `json:"ai"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	if in.BatchID == "" {
		return errf(400, "validation", "Select or create a registration batch first")
	}
	if !s.validImageRef(in.ImageRef) {
		return errf(400, "validation", "A garment photo is required")
	}
	attrs := map[string]string{}
	for k, v := range in.Attributes {
		k, v = strings.TrimSpace(strings.ToLower(k)), strings.TrimSpace(v)
		if k != "" && v != "" {
			if len(v) > 200 {
				v = v[:200]
			}
			attrs[k] = v
		}
	}
	var out garmentView
	err := s.Store.Write(func(st *demo.State) error {
		res, _, err := resolvePrice(st, in.priceRequest)
		if err != nil {
			return err
		}
		now := s.Store.Now()
		g := demo.Garment{ID: st.NextID("garment", "gar"), CategoryID: in.CategoryID, BatchID: in.BatchID, Barcode: st.NextBarcode(now),
			ImageRef: in.ImageRef, Attributes: attrs, Price: res.Price, PriceSource: res.Source, Status: "available", CreatedBy: u.ID, CreatedAt: now}
		if in.AI != nil && in.AI.Suggested != "" {
			snap := *in.AI
			snap.Accepted = snap.Suggested == in.CategoryID
			if c := st.Category(snap.Suggested); c != nil {
				snap.SuggestedName = c.Name
			} else {
				snap.SuggestedName = snap.Suggested
			}
			g.AI = &snap
		}
		st.Garments = append(st.Garments, g)
		cat := st.Category(g.CategoryID).Name
		if g.AI != nil {
			if g.AI.Accepted {
				st.AddEvent(now, g.ID, "garment", "ai_accepted", fmt.Sprintf("AI suggestion %s accepted (%s, est. %.0f%%)", cat, g.AI.Source, g.AI.Confidence*100), u.ID)
			} else {
				sug := g.AI.SuggestedName
				st.AddEvent(now, g.ID, "garment", "ai_corrected", fmt.Sprintf("Employee changed AI suggestion %s → %s", sug, cat), u.ID)
			}
		}
		sym := st.Settings.CurrencySymbol
		if sym == "" {
			sym = "₹"
		}
		st.AddEvent(now, g.ID, "garment", "created", fmt.Sprintf("Registered as %s, code %s, price %s%.2f [%s price]", cat, g.Barcode, sym, g.Price, g.PriceSource), u.ID)
		out = viewOf(st, g, true)
		return nil
	})
	if err != nil {
		return err
	}
	writeJSON(w, 201, out)
	return nil
}

func (s *Server) listGarments(w http.ResponseWriter, r *http.Request, u demo.User) error {
	q := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))
	status := r.URL.Query().Get("status")
	cat := r.URL.Query().Get("category_id")
	batch := r.URL.Query().Get("batch_id")
	out := []garmentView{}
	s.Store.Read(func(st *demo.State) {
		for _, g := range st.Garments {
			if status != "" && status != "all" && g.Status != status {
				continue
			}
			if cat != "" && g.CategoryID != cat {
				if c := st.Category(g.CategoryID); c == nil || c.ParentID != cat {
					continue
				}
			}
			if batch != "" && g.BatchID != batch {
				continue
			}
			v := viewOf(st, g, false)
			if q != "" {
				hay := strings.ToLower(strings.Join([]string{v.Barcode, v.Description, v.CategoryName, v.ParentName, v.BatchName, g.Attributes["notes"], g.Attributes["subcategory"]}, " "))
				if !strings.Contains(hay, q) {
					continue
				}
			}
			out = append(out, v)
		}
	})
	sort.SliceStable(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	writeJSON(w, 200, map[string]any{"items": out, "total": len(out)})
	return nil
}

func (s *Server) getGarment(w http.ResponseWriter, r *http.Request, u demo.User) error {
	var out *garmentView
	s.Store.Read(func(st *demo.State) {
		if g := st.Garment(r.PathValue("id")); g != nil {
			v := viewOf(st, *g, true)
			out = &v
		}
	})
	if out == nil {
		return errf(404, "not_found", "Garment not found")
	}
	writeJSON(w, 200, out)
	return nil
}

func (s *Server) resolveBarcode(w http.ResponseWriter, r *http.Request, u demo.User) error {
	code := r.PathValue("code")
	var out *garmentView
	s.Store.Read(func(st *demo.State) {
		if g := st.GarmentByBarcode(code); g != nil {
			v := viewOf(st, *g, false)
			out = &v
		}
	})
	if out == nil {
		return errf(404, "not_found", "No garment found for code %s", strings.ToUpper(strings.TrimSpace(code)))
	}
	writeJSON(w, 200, out)
	return nil
}

func (s *Server) barcodeSVG(w http.ResponseWriter, r *http.Request) {
	text := r.URL.Query().Get("text") != "0"
	svg, err := barcodes.SVG(r.PathValue("code"), 2, 70, text)
	if err != nil {
		writeErr(w, errf(400, "validation", "%v", err))
		return
	}
	w.Header().Set("Content-Type", "image/svg+xml")
	w.Header().Set("Cache-Control", "public, max-age=86400")
	io.WriteString(w, svg)
}

// ---------- sales ----------

type saleView struct {
	demo.Sale
	CustomerName  string `json:"customer_name,omitempty"`
	CreatedByName string `json:"created_by_name"`
	StoreName     string `json:"store_name"`
	BranchName    string `json:"branch_name"`
	TaxLabel      string `json:"tax_label"`
}

func saleViewOf(st *demo.State, sl demo.Sale) saleView {
	v := saleView{Sale: sl, StoreName: st.Settings.StoreName, TaxLabel: st.Settings.TaxLabel}
	for _, c := range st.Customers {
		if c.ID == sl.CustomerID {
			v.CustomerName = c.Name
		}
	}
	if u := st.User(sl.CreatedBy); u != nil {
		v.CreatedByName = u.Name
	}
	for _, b := range st.Branches {
		if b.ID == st.Settings.BranchID {
			v.BranchName = b.Name
		}
	}
	return v
}

func (s *Server) createSale(w http.ResponseWriter, r *http.Request, u demo.User) error {
	var in struct {
		Items      []string `json:"items"` // garment ids or barcodes
		Discount   float64  `json:"discount"`
		CustomerID string   `json:"customer_id"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	if len(in.Items) == 0 {
		return errf(400, "validation", "Cart is empty")
	}
	if in.Discount < 0 {
		return errf(400, "validation", "Discount cannot be negative")
	}
	var out saleView
	err := s.Store.Write(func(st *demo.State) error {
		sale := demo.Sale{ID: st.NextID("sale", "sal"), Status: "draft", CreatedBy: u.ID, CreatedAt: s.Store.Now()}
		sale.Number = fmt.Sprintf("S-%04d", st.Seq["sale"])
		if in.CustomerID != "" {
			ok := false
			for _, c := range st.Customers {
				ok = ok || c.ID == in.CustomerID
			}
			if !ok {
				return errf(400, "validation", "Unknown customer")
			}
			sale.CustomerID = in.CustomerID
		}
		seen := map[string]bool{}
		for _, ref := range in.Items {
			g := st.Garment(ref)
			if g == nil {
				g = st.GarmentByBarcode(ref)
			}
			if g == nil {
				return errf(404, "not_found", "Item %s not found", ref)
			}
			if seen[g.ID] {
				return errf(409, "duplicate", "%s is already in the cart", g.Barcode)
			}
			seen[g.ID] = true
			if g.Status != "available" {
				return errf(409, "unavailable", "%s is already sold", g.Barcode)
			}
			sale.Items = append(sale.Items, demo.SaleItem{GarmentID: g.ID, Barcode: g.Barcode, CategoryID: g.CategoryID, Description: st.Describe(g), Price: g.Price})
		}
		sub := 0.0
		for _, it := range sale.Items {
			sub += it.Price
		}
		if in.Discount > sub+0.001 {
			return errf(400, "validation", "Discount cannot exceed the subtotal")
		}
		demo.Totals(&sale, st.Settings, in.Discount)
		st.Sales = append(st.Sales, sale)
		st.AddEvent(sale.CreatedAt, sale.ID, "sale", "created", fmt.Sprintf("%s drafted with %d item(s)", sale.Number, len(sale.Items)), u.ID)
		out = saleViewOf(st, sale)
		return nil
	})
	if err != nil {
		return err
	}
	writeJSON(w, 201, out)
	return nil
}

func (s *Server) checkout(w http.ResponseWriter, r *http.Request, u demo.User) error {
	var in struct {
		PaymentMethod  string  `json:"payment_method"`
		AmountTendered float64 `json:"amount_tendered"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	var out saleView
	err := s.Store.Write(func(st *demo.State) error {
		sale := st.Sale(r.PathValue("id"))
		if sale == nil {
			return errf(404, "not_found", "Sale not found")
		}
		if sale.Status == "completed" {
			return errf(409, "already_completed", "%s is already completed", sale.Number)
		}
		ok := false
		for _, m := range st.Settings.PaymentMethods {
			ok = ok || m == in.PaymentMethod
		}
		if !ok {
			return errf(400, "validation", "Choose a payment method (%s)", strings.Join(st.Settings.PaymentMethods, ", "))
		}
		for _, it := range sale.Items {
			g := st.Garment(it.GarmentID)
			if g == nil || g.Status != "available" {
				return errf(409, "unavailable", "%s is no longer available", it.Barcode)
			}
		}
		if in.PaymentMethod == "cash" {
			if in.AmountTendered == 0 {
				in.AmountTendered = sale.Total
			}
			if in.AmountTendered+0.001 < sale.Total {
				return errf(400, "validation", "Cash tendered is less than the total")
			}
			sale.AmountTendered = pricing.Round2(in.AmountTendered)
			sale.ChangeDue = pricing.Round2(in.AmountTendered - sale.Total)
		}
		now := s.Store.Now()
		sale.PaymentMethod, sale.Status, sale.CompletedAt = in.PaymentMethod, "completed", &now
		for _, it := range sale.Items {
			g := st.Garment(it.GarmentID)
			g.Status, g.SaleID = "sold", sale.ID
			st.AddEvent(now, g.ID, "garment", "sold", "Sold in "+sale.Number, u.ID)
		}
		sym := st.Settings.CurrencySymbol
		if sym == "" {
			sym = "₹"
		}
		st.AddEvent(now, sale.ID, "sale", "completed", fmt.Sprintf("%s completed via %s, total %s%.2f (demo payment)", sale.Number, sale.PaymentMethod, sym, sale.Total), u.ID)
		out = saleViewOf(st, *sale)
		return nil
	})
	if err != nil {
		return err
	}
	writeJSON(w, 200, out)
	return nil
}

func (s *Server) listSales(w http.ResponseWriter, r *http.Request, u demo.User) error {
	status := r.URL.Query().Get("status")
	if status == "" {
		status = "completed"
	}
	out := []saleView{}
	s.Store.Read(func(st *demo.State) {
		for _, sl := range st.Sales {
			if status == "all" || sl.Status == status {
				out = append(out, saleViewOf(st, sl))
			}
		}
	})
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	writeJSON(w, 200, map[string]any{"sales": out, "total": len(out)})
	return nil
}

func (s *Server) getSale(w http.ResponseWriter, r *http.Request, u demo.User) error {
	var out *saleView
	s.Store.Read(func(st *demo.State) {
		if sl := st.Sale(r.PathValue("id")); sl != nil {
			v := saleViewOf(st, *sl)
			out = &v
		}
	})
	if out == nil {
		return errf(404, "not_found", "Sale not found")
	}
	writeJSON(w, 200, out)
	return nil
}

// ---------- dashboard / settings / events ----------

func sameDay(a, b time.Time) bool {
	ay, am, ad := a.Local().Date()
	by, bm, bd := b.Local().Date()
	return ay == by && am == bm && ad == bd
}

func (s *Server) dashboard(w http.ResponseWriter, r *http.Request, u demo.User) error {
	now := s.Store.Now()
	resp := map[string]any{}
	s.Store.Read(func(st *demo.State) {
		var salesToday, itemsToday int
		var revenueToday, revenueAll, stockValue float64
		var available, sold int
		payments := map[string]float64{}
		for _, sl := range st.Sales {
			if sl.Status != "completed" || sl.CompletedAt == nil {
				continue
			}
			revenueAll += sl.Total
			if sameDay(*sl.CompletedAt, now) {
				salesToday++
				itemsToday += len(sl.Items)
				revenueToday += sl.Total
				payments[sl.PaymentMethod] += sl.Total
			}
		}
		type catRow struct {
			CategoryID string  `json:"category_id"`
			Name       string  `json:"name"`
			Parent     string  `json:"parent"`
			Available  int     `json:"available"`
			Sold       int     `json:"sold"`
			StockValue float64 `json:"stock_value"`
		}
		rows := map[string]*catRow{}
		var order []string
		for _, c := range st.Categories {
			if st.IsLeaf(c.ID) {
				p := ""
				if pc := st.Category(c.ParentID); pc != nil {
					p = pc.Name
				}
				rows[c.ID] = &catRow{CategoryID: c.ID, Name: c.Name, Parent: p}
				order = append(order, c.ID)
			}
		}
		for _, g := range st.Garments {
			row := rows[g.CategoryID]
			if g.Status == "available" {
				available++
				stockValue += g.Price
				if row != nil {
					row.Available++
					row.StockValue += g.Price
				}
			} else {
				sold++
				if row != nil {
					row.Sold++
				}
			}
		}
		var dist []catRow
		for _, id := range order {
			rows[id].StockValue = pricing.Round2(rows[id].StockValue)
			dist = append(dist, *rows[id])
		}
		var recent []saleView
		var completed []demo.Sale
		for _, sl := range st.Sales {
			if sl.Status == "completed" {
				completed = append(completed, sl)
			}
		}
		sort.Slice(completed, func(i, j int) bool { return completed[i].CreatedAt.After(completed[j].CreatedAt) })
		for i, sl := range completed {
			if i >= 6 {
				break
			}
			recent = append(recent, saleViewOf(st, sl))
		}
		evs := append([]demo.Event(nil), st.Events...)
		sort.SliceStable(evs, func(i, j int) bool { return evs[i].Timestamp.After(evs[j].Timestamp) })
		if len(evs) > 10 {
			evs = evs[:10]
		}
		// last 7 days revenue table
		type day struct {
			Date    string  `json:"date"`
			Sales   int     `json:"sales"`
			Revenue float64 `json:"revenue"`
		}
		var days []day
		for i := 6; i >= 0; i-- {
			d := now.AddDate(0, 0, -i)
			row := day{Date: d.Format("2006-01-02")}
			for _, sl := range completed {
				if sl.CompletedAt != nil && sameDay(*sl.CompletedAt, d) {
					row.Sales++
					row.Revenue += sl.Total
				}
			}
			row.Revenue = pricing.Round2(row.Revenue)
			days = append(days, row)
		}
		resp = map[string]any{
			"generated_at":          now,
			"sales_today":           map[string]any{"count": salesToday, "revenue": pricing.Round2(revenueToday)},
			"items_sold_today":      itemsToday,
			"available_stock":       map[string]any{"count": available, "value": pricing.Round2(stockValue)},
			"sold_total":            sold,
			"total_garments":        len(st.Garments),
			"revenue_all_time":      pricing.Round2(revenueAll),
			"category_distribution": dist,
			"recent_sales":          recent,
			"recent_activity":       evs,
			"payments_today":        payments,
			"last_7_days":           days,
			"currency_symbol":       st.Settings.CurrencySymbol,
		}
	})
	writeJSON(w, 200, resp)
	return nil
}

func (s *Server) getSettings(w http.ResponseWriter, r *http.Request, u demo.User) error {
	var out demo.Settings
	var branch string
	s.Store.Read(func(st *demo.State) {
		out = st.Settings
		for _, b := range st.Branches {
			if b.ID == out.BranchID {
				branch = b.Name
			}
		}
	})
	writeJSON(w, 200, map[string]any{"settings": out, "branch_name": branch, "ai_mode": classification.Mode()})
	return nil
}

func (s *Server) bootstrap(w http.ResponseWriter, r *http.Request, u demo.User) error {
	var settings demo.Settings
	var branch string
	var cats []map[string]any
	s.Store.Read(func(st *demo.State) {
		settings = st.Settings
		for _, b := range st.Branches {
			if b.ID == settings.BranchID {
				branch = b.Name
			}
		}
		for _, c := range st.Categories {
			count := 0
			for _, g := range st.Garments {
				if g.CategoryID == c.ID && g.Status == "available" {
					count++
				}
			}
			cats = append(cats, map[string]any{"id": c.ID, "name": c.Name, "parent_id": c.ParentID, "default_price": c.DefaultPrice,
				"active": c.Active, "subcategories": c.Subcategories, "is_leaf": st.IsLeaf(c.ID), "available_count": count})
		}
	})
	writeJSON(w, 200, map[string]any{
		"user":        u,
		"settings":    settings,
		"branch_name": branch,
		"ai_mode":     classification.Mode(),
		"categories":  cats,
	})
	return nil
}

func (s *Server) updateSettings(w http.ResponseWriter, r *http.Request, u demo.User) error {
	var in struct {
		StoreName        *string  `json:"store_name"`
		BranchName       *string  `json:"branch_name"`
		Currency         *string  `json:"currency"`
		CurrencySymbol   *string  `json:"currency_symbol"`
		TaxEnabled       *bool    `json:"tax_enabled"`
		TaxRate          *float64 `json:"tax_rate"`
		TaxLabel         *string  `json:"tax_label"`
		ShowPriceOnLabel *bool    `json:"show_price_on_label"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	var out demo.Settings
	err := s.Store.Write(func(st *demo.State) error {
		set := &st.Settings
		if in.StoreName != nil {
			if strings.TrimSpace(*in.StoreName) == "" {
				return errf(400, "validation", "Store name cannot be empty")
			}
			set.StoreName = strings.TrimSpace(*in.StoreName)
		}
		if in.BranchName != nil && strings.TrimSpace(*in.BranchName) != "" {
			for i := range st.Branches {
				if st.Branches[i].ID == set.BranchID {
					st.Branches[i].Name = strings.TrimSpace(*in.BranchName)
				}
			}
		}
		if in.Currency != nil && *in.Currency != "" {
			set.Currency = strings.ToUpper(strings.TrimSpace(*in.Currency))
		}
		if in.CurrencySymbol != nil && *in.CurrencySymbol != "" {
			set.CurrencySymbol = strings.TrimSpace(*in.CurrencySymbol)
		}
		if in.TaxEnabled != nil {
			set.TaxEnabled = *in.TaxEnabled
		}
		if in.TaxRate != nil {
			if *in.TaxRate < 0 || *in.TaxRate > 50 {
				return errf(400, "validation", "Tax rate must be between 0 and 50%%")
			}
			set.TaxRate = *in.TaxRate
		}
		if in.TaxLabel != nil && *in.TaxLabel != "" {
			set.TaxLabel = strings.TrimSpace(*in.TaxLabel)
		}
		if in.ShowPriceOnLabel != nil {
			set.ShowPriceOnLabel = *in.ShowPriceOnLabel
		}
		st.AddEvent(s.Store.Now(), "settings", "settings", "updated", "Demo settings updated", u.ID)
		out = *set
		return nil
	})
	if err != nil {
		return err
	}
	writeJSON(w, 200, map[string]any{"settings": out})
	return nil
}

func (s *Server) listEvents(w http.ResponseWriter, r *http.Request, u demo.User) error {
	limit := 50
	fmt.Sscanf(r.URL.Query().Get("limit"), "%d", &limit)
	var evs []demo.Event
	s.Store.Read(func(st *demo.State) { evs = append(evs, st.Events...) })
	sort.SliceStable(evs, func(i, j int) bool { return evs[i].Timestamp.After(evs[j].Timestamp) })
	if limit > 0 && len(evs) > limit {
		evs = evs[:limit]
	}
	writeJSON(w, 200, map[string]any{"events": evs})
	return nil
}
