package demo

import (
	"errors"
	"strings"
	"testing"
	"time"
)

func TestSeedAndStoreLifecycle(t *testing.T) {
	dir := t.TempDir()
	st, err := Open(dir)
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}

	st.Read(func(s *State) {
		if len(s.Garments) != 14 {
			t.Fatalf("expected 14 seeded garments, got %d", len(s.Garments))
		}
		if len(s.ActiveLeafCategories()) != 7 {
			t.Fatalf("expected 7 active leaf categories, got %d", len(s.ActiveLeafCategories()))
		}
		if len(s.Batches) != 2 {
			t.Fatalf("expected 2 seeded batches, got %d", len(s.Batches))
		}
		if len(s.Sales) != 3 {
			t.Fatalf("expected 3 seeded sales, got %d", len(s.Sales))
		}
		for _, g := range s.Garments {
			if g.AI == nil || g.AI.SuggestedName == "" {
				t.Fatalf("expected seeded garment %s to have AI.SuggestedName populated, got %+v", g.ID, g.AI)
			}
		}
	})

	// Write failure must roll back in-memory state
	_ = st.Write(func(s *State) error {
		s.Settings.StoreName = "Corrupted Name"
		s.Garments = nil
		return errors.New("simulated write failure")
	})

	st.Read(func(s *State) {
		if s.Settings.StoreName != "ReWear Thrift Co." || len(s.Garments) != 14 {
			t.Fatalf("failed Write did not roll back in-memory state: store=%q garments=%d", s.Settings.StoreName, len(s.Garments))
		}
	})

	// Successful write persists to disk and survives reopen
	err = st.Write(func(s *State) error {
		s.Settings.StoreName = "ReWear Flagship"
		return nil
	})
	if err != nil {
		t.Fatalf("Write failed: %v", err)
	}

	reopened, err := Open(dir)
	if err != nil {
		t.Fatalf("Reopen failed: %v", err)
	}
	reopened.Read(func(s *State) {
		if s.Settings.StoreName != "ReWear Flagship" {
			t.Fatalf("expected persisted store name 'ReWear Flagship', got %q", s.Settings.StoreName)
		}
	})
}

func TestBarcodeUniquenessAndParentDeactivation(t *testing.T) {
	now := time.Date(2026, 11, 22, 10, 0, 0, 0, time.UTC)
	s := Seed(now)

	seen := map[string]bool{}
	for _, g := range s.Garments {
		seen[g.Barcode] = true
	}
	for i := 0; i < 20; i++ {
		code := s.NextBarcode(now)
		if seen[code] {
			t.Fatalf("duplicate barcode generated: %s", code)
		}
		seen[code] = true
	}

	// Deactivating a parent group hides its children from ActiveLeafCategories
	tops := s.Category("tops")
	if tops == nil {
		t.Fatal("missing tops category")
	}
	tops.Active = false
	leaves := s.ActiveLeafCategories()
	for _, c := range leaves {
		if c.ParentID == "tops" {
			t.Fatalf("expected child of inactive parent 'tops' to be excluded, found %s", c.ID)
		}
	}
}

func TestTotalsAndSampleSVG(t *testing.T) {
	sale := Sale{
		Items: []SaleItem{
			{Price: 499},
			{Price: 301},
		},
	}
	set := Settings{TaxEnabled: true, TaxRate: 5}
	Totals(&sale, set, 100)
	if sale.Subtotal != 800 || sale.Discount != 100 || sale.Tax != 35 || sale.Total != 735 {
		t.Fatalf("unexpected totals: %+v", sale)
	}

	// Discount clamped to subtotal
	Totals(&sale, set, 5000)
	if sale.Discount != 800 || sale.Tax != 0 || sale.Total != 0 {
		t.Fatalf("expected discount clamped to subtotal: %+v", sale)
	}

	// All 14 samples render valid SVG
	for _, sm := range Samples {
		svg := SampleSVG(sm)
		if !strings.HasPrefix(svg, "<svg") || !strings.HasSuffix(svg, "</svg>") {
			t.Fatalf("invalid SVG for sample %s", sm.ID)
		}
	}
}
