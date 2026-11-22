package demo

import (
	"fmt"
	"time"
)

// DemoCredentials are fixed, disclosed demo logins (SRS §3.1). Not production auth.
var DemoCredentials = map[string]string{
	"employee": "demo123",
	"admin":    "admin123",
}

func fp(v float64) *float64 { return &v }

// Seed builds the canonical demo dataset relative to `now`, so "today" metrics
// on the dashboard are always meaningful after a reset.
func Seed(now time.Time) *State {
	s := &State{Seq: map[string]int{}, SeededAt: now}
	s.Users = []User{
		{ID: "u_emp", Name: "Priya Sharma", Role: "employee", Username: "employee"},
		{ID: "u_admin", Name: "Arjun Mehta", Role: "admin", Username: "admin"},
	}
	s.Branches = []Branch{{ID: "br_main", Name: "Main Street Store"}}
	s.Settings = Settings{
		StoreName: "ReWear Thrift Co.", BranchID: "br_main", Currency: "INR", CurrencySymbol: "₹",
		TaxEnabled: true, TaxRate: 5, TaxLabel: "GST", ShowPriceOnLabel: true,
		PaymentMethods: []string{"cash", "card", "upi"},
	}
	s.Categories = []Category{
		{ID: "tops", Name: "Tops", Active: true},
		{ID: "bottoms", Name: "Bottoms", Active: true},
		{ID: "outerwear", Name: "Outerwear", Active: true},
		{ID: "dresses", Name: "Dresses", Active: true},
		{ID: "formal_shirt", Name: "Formal Shirt", ParentID: "tops", DefaultPrice: 599, Active: true, Subcategories: []string{"Oxford", "Poplin", "Linen"}},
		{ID: "casual_shirt", Name: "Casual Shirt", ParentID: "tops", DefaultPrice: 449, Active: true, Subcategories: []string{"Check", "Printed", "Denim"}},
		{ID: "t_shirt", Name: "T-Shirt", ParentID: "tops", DefaultPrice: 299, Active: true, Subcategories: []string{"Crew neck", "V-neck", "Polo"}},
		{ID: "jeans", Name: "Jeans", ParentID: "bottoms", DefaultPrice: 799, Active: true, Subcategories: []string{"Straight", "Skinny", "Relaxed"}},
		{ID: "trousers", Name: "Trousers", ParentID: "bottoms", DefaultPrice: 649, Active: true, Subcategories: []string{"Chino", "Formal", "Cargo"}},
		{ID: "jacket", Name: "Jacket", ParentID: "outerwear", DefaultPrice: 1299, Active: true, Subcategories: []string{"Utility", "Blazer", "Bomber"}},
		{ID: "dress", Name: "Dress", ParentID: "dresses", DefaultPrice: 899, Active: true, Subcategories: []string{"Midi", "Maxi", "Shift"}},
	}
	s.Customers = []Customer{{ID: "cus_1", Name: "Sample Customer (Demo)", Phone: "+91 90000 00000"}}

	b1At := now.Add(-72 * time.Hour)
	s.Batches = []Batch{
		{ID: "bat_1", Name: "November donations", Reference: "DON-NOV-01", BranchID: "br_main", DefaultPrice: fp(399), CreatedBy: "u_emp", CreatedAt: b1At},
		{ID: "bat_2", Name: "Premium rack", Reference: "PRM-02", BranchID: "br_main", DefaultPrice: nil, CreatedBy: "u_admin", CreatedAt: now.Add(-48 * time.Hour)},
	}
	s.Seq["batch"] = 2

	type g struct {
		sample, cat, batch, size, brand, source string
		price                                   float64
		ageH                                    int
	}
	items := []g{
		{"s01", "formal_shirt", "bat_2", "M", "Van Heusen", "category", 599, 47},
		{"s08", "formal_shirt", "bat_2", "L", "Arrow", "individual", 699, 46},
		{"s02", "casual_shirt", "bat_1", "M", "Roadster", "batch", 399, 70},
		{"s13", "casual_shirt", "bat_1", "S", "H&M", "batch", 399, 70},
		{"s03", "t_shirt", "bat_1", "L", "Bewakoof", "batch", 399, 69},
		{"s09", "t_shirt", "bat_1", "M", "Uniqlo", "individual", 249, 69},
		{"s04", "jeans", "bat_2", "32", "Levi's", "category", 799, 45},
		{"s10", "jeans", "bat_2", "30", "Wrangler", "individual", 899, 45},
		{"s07", "trousers", "bat_2", "32", "Marks & Spencer", "category", 649, 44},
		{"s14", "trousers", "bat_1", "34", "Peter England", "batch", 399, 68},
		{"s05", "jacket", "bat_2", "L", "Zara", "category", 1299, 43},
		{"s12", "jacket", "bat_2", "M", "Raymond", "individual", 1499, 43},
		{"s06", "dress", "bat_1", "S", "AND", "batch", 399, 67},
		{"s11", "dress", "bat_2", "M", "Biba", "category", 899, 42},
	}
	for _, it := range items {
		smp, _ := SampleByID(it.sample)
		created := now.Add(-time.Duration(it.ageH) * time.Hour)
		id := s.NextID("garment", "gar")
		attrs := map[string]string{"size": it.size, "brand": it.brand}
		for k, v := range smp.Attributes {
			attrs[k] = v
		}
		sugName := smp.Category
		if c := s.Category(smp.Category); c != nil {
			sugName = c.Name
		}
		gm := Garment{
			ID: id, CategoryID: it.cat, BatchID: it.batch, Barcode: s.NextBarcode(created), ImageRef: "sample:" + it.sample,
			Attributes: attrs, Price: it.price, PriceSource: it.source, Status: "available",
			AI:        &AISnapshot{Suggested: smp.Category, SuggestedName: sugName, Confidence: smp.Confidence, Source: "demo_mock", Accepted: true},
			CreatedBy: s.batchCreator(it.batch), CreatedAt: created,
		}
		s.Garments = append(s.Garments, gm)
		s.AddEvent(created, id, "garment", "created", fmt.Sprintf("Registered %s (%s) at %s%.0f [%s price]", smp.Label, gm.Barcode, "₹", gm.Price, gm.PriceSource), gm.CreatedBy)
	}

	// Three completed demo sales (4 garments sold), one of them earlier today.
	sales := []struct {
		garments []int
		method   string
		ageH     float64
		discount float64
		customer string
	}{
		{[]int{2, 4}, "cash", 30, 0, ""},
		{[]int{6}, "upi", 20, 50, "cus_1"},
		{[]int{12}, "card", 0.2, 0, ""},
	}
	for _, sl := range sales {
		at := now.Add(-time.Duration(sl.ageH * float64(time.Hour)))
		if sl.ageH < 1 && at.Day() != now.Day() {
			at = now // keep the "today" sale on today's date even right after midnight
		}
		sale := Sale{ID: s.NextID("sale", "sal"), PaymentMethod: sl.method, Status: "completed", CreatedBy: "u_emp", CreatedAt: at, CustomerID: sl.customer}
		sale.Number = fmt.Sprintf("S-%04d", s.Seq["sale"])
		for _, gi := range sl.garments {
			gm := &s.Garments[gi]
			gm.Status, gm.SaleID = "sold", sale.ID
			sale.Items = append(sale.Items, SaleItem{GarmentID: gm.ID, Barcode: gm.Barcode, CategoryID: gm.CategoryID, Description: s.Describe(gm), Price: gm.Price})
		}
		Totals(&sale, s.Settings, sl.discount)
		done := at
		sale.CompletedAt = &done
		if sl.method == "cash" {
			sale.AmountTendered = sale.Total
		}
		s.Sales = append(s.Sales, sale)
		for _, it := range sale.Items {
			s.AddEvent(at, it.GarmentID, "garment", "sold", "Sold in "+sale.Number, "u_emp")
		}
		s.AddEvent(at, sale.ID, "sale", "completed", fmt.Sprintf("%s completed via %s, total ₹%.2f", sale.Number, sl.method, sale.Total), "u_emp")
	}
	return s
}

func (s *State) batchCreator(batchID string) string {
	for _, b := range s.Batches {
		if b.ID == batchID {
			return b.CreatedBy
		}
	}
	return "u_emp"
}
