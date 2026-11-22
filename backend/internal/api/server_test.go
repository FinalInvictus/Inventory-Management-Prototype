package api

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

type client struct {
	t   *testing.T
	url string
	tok string
}

func (c *client) do(method, path string, body any, want int) map[string]any {
	c.t.Helper()
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, c.url+path, rd)
	req.Header.Set("Content-Type", "application/json")
	if c.tok != "" {
		req.Header.Set("Authorization", "Bearer "+c.tok)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != want {
		c.t.Fatalf("%s %s: status %d want %d: %s", method, path, resp.StatusCode, want, raw)
	}
	out := map[string]any{}
	json.Unmarshal(raw, &out)
	return out
}

func newTestServer(t *testing.T) (*client, func()) {
	store, err := openTemp(t)
	if err != nil {
		t.Fatal(err)
	}
	s := New(store, "")
	s.MockDelay = 0
	ts := httptest.NewServer(s.Handler())
	return &client{t: t, url: ts.URL}, ts.Close
}

func num(v any) float64 { f, _ := v.(float64); return f }

func TestPrototypeAcceptanceFlow(t *testing.T) {
	c, done := newTestServer(t)
	defer done()

	// Auth required
	c.do("GET", "/api/v1/categories", nil, 401)
	c.do("POST", "/api/v1/demo/login", map[string]string{"username": "employee", "password": "wrong"}, 401)

	// PT-001 login as employee
	lr := c.do("POST", "/api/v1/demo/login", map[string]string{"username": "employee", "password": "demo123"}, 200)
	c.tok = lr["token"].(string)
	if lr["user"].(map[string]any)["role"] != "employee" {
		t.Fatal("expected employee role")
	}
	// employees cannot change admin settings
	c.do("PUT", "/api/v1/settings", map[string]any{"tax_rate": 1}, 403)

	base := c.do("GET", "/api/v1/dashboard/summary", nil, 200)
	baseStock := num(base["available_stock"].(map[string]any)["count"])
	baseSalesToday := num(base["sales_today"].(map[string]any)["count"])
	if base["total_garments"].(float64) < 10 {
		t.Fatal("seed should have at least 10 garments")
	}

	// Batch with default price
	b := c.do("POST", "/api/v1/batches", map[string]any{"name": "Test batch", "default_price": 350}, 201)
	batchID := b["id"].(string)

	// PT-002/003 select sample, classify
	cl := c.do("POST", "/api/v1/garments/classify", map[string]string{"image_ref": "sample:s01"}, 200)
	if cl["category"] != "formal_shirt" || cl["source"] != "demo_mock" {
		t.Fatalf("unexpected classification %v", cl)
	}
	if alts := cl["alternatives"].([]any); len(alts) > 2 {
		t.Fatal("max two alternatives")
	}

	// PT-005 pricing modes
	pp := c.do("POST", "/api/v1/pricing/preview", map[string]any{"category_id": "casual_shirt"}, 200)
	if num(pp["price"]) != 449 || pp["price_source"] != "category" {
		t.Fatalf("category price %v", pp)
	}
	pp = c.do("POST", "/api/v1/pricing/preview", map[string]any{"category_id": "casual_shirt", "batch_id": batchID}, 200)
	if num(pp["price"]) != 350 || pp["price_source"] != "batch" {
		t.Fatalf("batch price %v", pp)
	}

	pp = c.do("POST", "/api/v1/pricing/preview", map[string]any{"category_id": "casual_shirt", "batch_id": batchID, "price_mode": "category"}, 200)
	if num(pp["price"]) != 449 || pp["price_source"] != "category" {
		t.Fatalf("explicit category mode %v", pp)
	}
	c.do("POST", "/api/v1/pricing/preview", map[string]any{"category_id": "casual_shirt", "batch_id": "bat_2", "price_mode": "batch"}, 400)

	// PT-004 + PT-006: change category (casual instead of formal), save -> unique barcode
	g := c.do("POST", "/api/v1/garments", map[string]any{"category_id": "casual_shirt", "batch_id": batchID, "image_ref": "sample:s01",
		"attributes": map[string]string{"size": "M", "brand": "TestBrand"}, "ai": map[string]any{"suggested": "formal_shirt", "confidence": 0.82, "source": "demo_mock"}}, 201)
	code := g["barcode"].(string)
	if num(g["price"]) != 350 || g["price_source"] != "batch" || g["category_id"] != "casual_shirt" {
		t.Fatalf("garment %v", g)
	}
	if g["ai"].(map[string]any)["accepted"] != false {
		t.Fatal("AI correction should be recorded")
	}
	g2 := c.do("POST", "/api/v1/garments", map[string]any{"category_id": "jeans", "batch_id": batchID, "image_ref": "sample:s04", "override_price": 999}, 201)
	if g2["barcode"] == code || num(g2["price"]) != 999 || g2["price_source"] != "individual" {
		t.Fatalf("second garment %v", g2)
	}

	// Saved snapshot: change batch default, garment keeps price
	c.do("PATCH", "/api/v1/batches/"+batchID, map[string]any{"default_price": 100}, 200)

	// PT-007 barcode svg for stored code
	resp, _ := http.Get(c.url + "/api/v1/barcodes/" + code + "/svg")
	if resp.StatusCode != 200 || resp.Header.Get("Content-Type") != "image/svg+xml" {
		t.Fatal("barcode svg failed")
	}

	// PT-008 inventory search
	list := c.do("GET", "/api/v1/garments?q=testbrand", nil, 200)
	if num(list["total"]) != 1 {
		t.Fatalf("search expected 1, got %v", list["total"])
	}
	// PT-009 resolve barcode (case-insensitive)
	r := c.do("GET", "/api/v1/barcodes/"+code, nil, 200)
	if r["id"] != g["id"] || num(r["price"]) != 350 {
		t.Fatal("barcode resolved wrong item or snapshot price changed")
	}
	c.do("GET", "/api/v1/barcodes/NOPE-1", nil, 404)

	// PT-010 checkout
	c.do("POST", "/api/v1/sales", map[string]any{"items": []string{code, code}}, 409)
	sale := c.do("POST", "/api/v1/sales", map[string]any{"items": []string{code, g2["id"].(string)}, "discount": 49}, 201)
	// subtotal 1349, discount 49 -> 1300, tax 5% -> 65, total 1365
	if num(sale["subtotal"]) != 1349 || num(sale["tax"]) != 65 || num(sale["total"]) != 1365 {
		t.Fatalf("totals %v", sale)
	}
	sid := sale["id"].(string)
	c.do("POST", "/api/v1/sales/"+sid+"/checkout", map[string]any{"payment_method": "bitcoin"}, 400)
	c.do("POST", "/api/v1/sales/"+sid+"/checkout", map[string]any{"payment_method": "cash", "amount_tendered": 100}, 400)
	done2 := c.do("POST", "/api/v1/sales/"+sid+"/checkout", map[string]any{"payment_method": "cash", "amount_tendered": 1400}, 200)
	if done2["status"] != "completed" || num(done2["change_due"]) != 35 {
		t.Fatalf("checkout %v", done2)
	}
	c.do("POST", "/api/v1/sales/"+sid+"/checkout", map[string]any{"payment_method": "cash"}, 409)
	if st := c.do("GET", "/api/v1/garments/"+g["id"].(string), nil, 200); st["status"] != "sold" {
		t.Fatal("garment should be sold")
	}
	c.do("POST", "/api/v1/sales", map[string]any{"items": []string{code}}, 409)

	// PT-011 admin dashboard reflects
	al := c.do("POST", "/api/v1/demo/login", map[string]string{"role": "admin"}, 200)
	c.tok = al["token"].(string)
	d := c.do("GET", "/api/v1/dashboard/summary", nil, 200)
	if num(d["sales_today"].(map[string]any)["count"]) != baseSalesToday+1 {
		t.Fatal("sales today not incremented")
	}
	if num(d["available_stock"].(map[string]any)["count"]) != baseStock {
		t.Fatalf("stock should be back to base (2 added, 2 sold)")
	}
	// admin edits category price; old garments keep price
	c.do("PUT", "/api/v1/categories/jeans", map[string]any{"default_price": 850}, 200)

	// PT-012 reset
	c.do("POST", "/api/v1/demo/reset", nil, 200)
	after := c.do("GET", "/api/v1/dashboard/summary", nil, 200)
	if num(after["total_garments"]) != num(base["total_garments"]) {
		t.Fatal("reset did not restore garments")
	}
	c.do("GET", "/api/v1/barcodes/"+code, nil, 404)
	cats := c.do("GET", "/api/v1/categories", nil, 200)
	for _, x := range cats["categories"].([]any) {
		m := x.(map[string]any)
		if m["id"] == "jeans" && num(m["default_price"]) != 799 {
			t.Fatal("reset did not restore category price")
		}
	}
}

func TestUploadAndFallbackClassification(t *testing.T) {
	c, done := newTestServer(t)
	defer done()
	c.tok = c.do("POST", "/api/v1/demo/login", map[string]string{"role": "employee"}, 200)["token"].(string)
	c.do("POST", "/api/v1/images/presign", map[string]string{"content_type": "text/plain"}, 400)
	p := c.do("POST", "/api/v1/images/presign", map[string]string{"content_type": "image/png"}, 200)
	img := bytes.Repeat([]byte{1, 2, 3}, 100)
	req, _ := http.NewRequest("PUT", c.url+p["upload_url"].(string), bytes.NewReader(img))
	req.Header.Set("Authorization", "Bearer "+c.tok)
	resp, err := http.DefaultClient.Do(req)
	if err != nil || resp.StatusCode != 200 {
		t.Fatalf("upload failed %v %v", err, resp.StatusCode)
	}
	t.Setenv("GEMINI_API_KEY", "")
	cl := c.do("POST", "/api/v1/garments/classify", map[string]string{"image_ref": p["image_ref"].(string)}, 200)
	if cl["is_fallback"] != true || cl["source"] != "demo_fallback" {
		t.Fatalf("expected labelled fallback: %v", cl)
	}
	c.do("POST", "/api/v1/garments/classify", map[string]string{"image_ref": "upload:missing"}, 400)
}

func TestBackendBugFixesAndEdgeCases(t *testing.T) {
	store, err := openTemp(t)
	if err != nil {
		t.Fatal(err)
	}
	staticDir := t.TempDir()
	s := New(store, staticDir)
	s.MockDelay = 0
	ts := httptest.NewServer(s.Handler())
	defer ts.Close()
	c := &client{t: t, url: ts.URL}

	// Login as admin
	lr := c.do("POST", "/api/v1/demo/login", map[string]string{"role": "admin"}, 200)
	tok := lr["token"].(string)

	// 1. Authorization header must require Bearer scheme (case-insensitive) and reject raw token without scheme
	reqRaw, _ := http.NewRequest("GET", ts.URL+"/api/v1/demo/me", nil)
	reqRaw.Header.Set("Authorization", tok) // missing "Bearer " prefix
	respRaw, err := http.DefaultClient.Do(reqRaw)
	if err != nil {
		t.Fatal(err)
	}
	respRaw.Body.Close()
	if respRaw.StatusCode != 401 {
		t.Fatalf("expected 401 for Authorization header without Bearer prefix, got %d", respRaw.StatusCode)
	}

	reqLower, _ := http.NewRequest("GET", ts.URL+"/api/v1/demo/me", nil)
	reqLower.Header.Set("Authorization", "bearer "+tok)
	respLower, err := http.DefaultClient.Do(reqLower)
	if err != nil {
		t.Fatal(err)
	}
	respLower.Body.Close()
	if respLower.StatusCode != 200 {
		t.Fatalf("expected 200 for lowercase 'bearer ' scheme, got %d", respLower.StatusCode)
	}

	c.tok = tok

	// 2. Missing static asset under /assets/* must return 404, not SPA index.html
	respAsset, err := http.Get(ts.URL + "/assets/missing-bundle.js")
	if err != nil {
		t.Fatal(err)
	}
	respAsset.Body.Close()
	if respAsset.StatusCode != 404 {
		t.Fatalf("expected 404 for missing /assets/ file, got %d", respAsset.StatusCode)
	}

	// 3. PATCH /api/v1/batches/{id} should support updating reference
	patchedBatch := c.do("PATCH", "/api/v1/batches/bat_1", map[string]any{"reference": "DON-NOV-99"}, 200)
	if patchedBatch["reference"] != "DON-NOV-99" {
		t.Fatalf("expected batch reference DON-NOV-99, got %v", patchedBatch["reference"])
	}

	// 4. AISnapshot should include human-readable suggested_name
	g := c.do("POST", "/api/v1/garments", map[string]any{
		"category_id": "casual_shirt",
		"batch_id":    "bat_1",
		"image_ref":   "sample:s01",
		"ai":          map[string]any{"suggested": "formal_shirt", "confidence": 0.82, "source": "demo_mock"},
	}, 201)
	aiMap, _ := g["ai"].(map[string]any)
	if aiMap["suggested_name"] != "Formal Shirt" {
		t.Fatalf("expected ai.suggested_name = 'Formal Shirt', got %v", aiMap["suggested_name"])
	}

	// 5. Audit events should respect configured currency_symbol instead of hardcoded ₹
	c.do("PUT", "/api/v1/settings", map[string]any{"currency": "USD", "currency_symbol": "$"}, 200)
	c.do("PUT", "/api/v1/categories/jeans", map[string]any{"default_price": 820}, 200)
	evs := c.do("GET", "/api/v1/events?limit=5", nil, 200)["events"].([]any)
	latestDesc := evs[0].(map[string]any)["description"].(string)
	if latestDesc == "" || latestDesc[0:5] != "Jeans" || !bytes.Contains([]byte(latestDesc), []byte("$820.00")) {
		t.Fatalf("expected audit event to use configured '$' currency symbol, got %q", latestDesc)
	}

	// 6. Empty category update should not append a blank change event
	beforeCount := len(c.do("GET", "/api/v1/events?limit=200", nil, 200)["events"].([]any))
	c.do("PUT", "/api/v1/categories/jeans", map[string]any{}, 200)
	afterCount := len(c.do("GET", "/api/v1/events?limit=200", nil, 200)["events"].([]any))
	if afterCount != beforeCount {
		t.Fatalf("expected no audit event for no-op category update, before=%d after=%d", beforeCount, afterCount)
	}
}
