package demo

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// Store is a mutex-guarded, JSON-file-persisted demo store.
// It is intentionally simple: single process, whole-state writes.
type Store struct {
	mu   sync.Mutex
	dir  string
	st   *State
	Now  func() time.Time
}

func Open(dir string) (*Store, error) {
	if err := os.MkdirAll(filepath.Join(dir, "images"), 0o755); err != nil {
		return nil, err
	}
	s := &Store{dir: dir, Now: time.Now}
	b, err := os.ReadFile(s.statePath())
	if err == nil {
		var st State
		if jerr := json.Unmarshal(b, &st); jerr == nil && len(st.Categories) > 0 {
			if st.Seq == nil {
				st.Seq = map[string]int{}
			}
			s.st = &st
			return s, nil
		}
	}
	return s, s.Reset()
}

func (s *Store) statePath() string { return filepath.Join(s.dir, "demo-state.json") }
func (s *Store) ImageDir() string  { return filepath.Join(s.dir, "images") }

// Reset restores the seeded dataset and removes uploaded demo images.
func (s *Store) Reset() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	os.RemoveAll(s.ImageDir())
	os.MkdirAll(s.ImageDir(), 0o755)
	s.st = Seed(s.Now())
	return s.saveLocked()
}

func (s *Store) saveLocked() error {
	b, err := json.MarshalIndent(s.st, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.statePath() + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, s.statePath())
}

// Read runs fn with the state under lock (fn must not retain pointers).
func (s *Store) Read(fn func(st *State)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	fn(s.st)
}

// Write runs fn under lock and persists if fn succeeds. On error the
// in-memory state is restored from a snapshot so failed requests leave no trace.
func (s *Store) Write(fn func(st *State) error) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	snap, _ := json.Marshal(s.st)
	if err := fn(s.st); err != nil {
		var restored State
		if json.Unmarshal(snap, &restored) == nil {
			s.st = &restored
		}
		return err
	}
	return s.saveLocked()
}

// ---- State helpers (call only while holding the store lock) ----

func (st *State) NextID(seq, prefix string) string {
	st.Seq[seq]++
	return fmt.Sprintf("%s_%d", prefix, st.Seq[seq])
}

// NextBarcode returns a collision-safe demo garment code: GM-YYMMDD-NNNN where
// NNNN is a persisted monotonic sequence; uniqueness is additionally verified.
func (st *State) NextBarcode(at time.Time) string {
	for {
		st.Seq["barcode"]++
		code := fmt.Sprintf("GM-%s-%04d", at.Format("060102"), st.Seq["barcode"])
		if st.GarmentByBarcode(code) == nil {
			return code
		}
	}
}

func (st *State) AddEvent(at time.Time, entityID, entityType, action, desc, actor string) {
	st.Events = append(st.Events, Event{ID: st.NextID("event", "evt"), EntityID: entityID, EntityType: entityType, Action: action, Timestamp: at, Description: desc, Actor: actor})
}

func (st *State) Category(id string) *Category {
	for i := range st.Categories {
		if st.Categories[i].ID == id {
			return &st.Categories[i]
		}
	}
	return nil
}

// IsLeaf reports whether a category can be assigned to a garment.
func (st *State) IsLeaf(id string) bool {
	c := st.Category(id)
	if c == nil {
		return false
	}
	for _, o := range st.Categories {
		if o.ParentID == id {
			return false
		}
	}
	return true
}

func (st *State) ActiveLeafCategories() []Category {
	var out []Category
	for _, c := range st.Categories {
		if c.Active && st.IsLeaf(c.ID) {
			if p := st.Category(c.ParentID); p != nil && !p.Active {
				continue
			}
			out = append(out, c)
		}
	}
	return out
}

func (st *State) Batch(id string) *Batch {
	for i := range st.Batches {
		if st.Batches[i].ID == id {
			return &st.Batches[i]
		}
	}
	return nil
}

func (st *State) Garment(id string) *Garment {
	for i := range st.Garments {
		if st.Garments[i].ID == id {
			return &st.Garments[i]
		}
	}
	return nil
}

func (st *State) GarmentByBarcode(code string) *Garment {
	code = strings.TrimSpace(strings.ToUpper(code))
	for i := range st.Garments {
		if strings.ToUpper(st.Garments[i].Barcode) == code {
			return &st.Garments[i]
		}
	}
	return nil
}

func (st *State) Sale(id string) *Sale {
	for i := range st.Sales {
		if st.Sales[i].ID == id {
			return &st.Sales[i]
		}
	}
	return nil
}

func (st *State) User(id string) *User {
	for i := range st.Users {
		if st.Users[i].ID == id {
			return &st.Users[i]
		}
	}
	return nil
}

func (st *State) Describe(g *Garment) string {
	name := g.CategoryID
	if c := st.Category(g.CategoryID); c != nil {
		name = c.Name
	}
	parts := []string{}
	if v := g.Attributes["color"]; v != "" {
		parts = append(parts, strings.Title(v))
	}
	if v := g.Attributes["brand"]; v != "" {
		parts = append(parts, v)
	}
	parts = append(parts, name)
	d := strings.Join(parts, " ")
	if v := g.Attributes["size"]; v != "" {
		d += " (" + v + ")"
	}
	return d
}

func (st *State) EventsFor(entityID string) []Event {
	var out []Event
	for _, e := range st.Events {
		if e.EntityID == entityID {
			out = append(out, e)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Timestamp.Before(out[j].Timestamp) })
	return out
}

func round2(v float64) float64 { return math.Round(v*100) / 100 }

// Totals computes subtotal, discount, tax and total for a sale using settings.
// Tax is applied to (subtotal - discount).
func Totals(sale *Sale, set Settings, discount float64) {
	sub := 0.0
	for _, it := range sale.Items {
		sub += it.Price
	}
	sale.Subtotal = round2(sub)
	if discount < 0 {
		discount = 0
	}
	if discount > sale.Subtotal {
		discount = sale.Subtotal
	}
	sale.Discount = round2(discount)
	sale.TaxRate = 0
	sale.Tax = 0
	if set.TaxEnabled {
		sale.TaxRate = set.TaxRate
		sale.Tax = round2((sale.Subtotal - sale.Discount) * set.TaxRate / 100)
	}
	sale.Total = round2(sale.Subtotal - sale.Discount + sale.Tax)
}

var ErrNotFound = errors.New("not found")
