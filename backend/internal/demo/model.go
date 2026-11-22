// Package demo holds the prototype data model, seeded dataset and a
// resettable, file-persisted store. Field names follow SRS section 11 so the
// data contract stays compatible with the planned production model.
package demo

import "time"

type User struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Role     string `json:"role"` // "employee" | "admin"
	Username string `json:"username"`
	Password string `json:"-"`
}

type Branch struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type Category struct {
	ID            string   `json:"id"` // slug, e.g. formal_shirt
	Name          string   `json:"name"`
	ParentID      string   `json:"parent_id,omitempty"`
	DefaultPrice  float64  `json:"default_price"`
	Active        bool     `json:"active"`
	Subcategories []string `json:"subcategories,omitempty"`
}

type Batch struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Reference    string    `json:"reference,omitempty"`
	BranchID     string    `json:"branch_id"`
	DefaultPrice *float64  `json:"default_price"`
	CreatedBy    string    `json:"created_by"`
	CreatedAt    time.Time `json:"created_at"`
}

// AISnapshot records what the classifier suggested versus what was saved.
type AISnapshot struct {
	Suggested     string  `json:"suggested"`
	SuggestedName string  `json:"suggested_name,omitempty"`
	Confidence    float64 `json:"confidence"`
	Source        string  `json:"source"`
	Accepted      bool    `json:"accepted"`
}

type Garment struct {
	ID          string            `json:"id"`
	CategoryID  string            `json:"category_id"`
	BatchID     string            `json:"batch_id"`
	Barcode     string            `json:"barcode"`
	ImageRef    string            `json:"image_ref"`
	Attributes  map[string]string `json:"attributes"`
	Price       float64           `json:"price"`
	PriceSource string            `json:"price_source"`
	Status      string            `json:"status"` // "available" | "sold"
	AI          *AISnapshot       `json:"ai,omitempty"`
	SaleID      string            `json:"sale_id,omitempty"`
	CreatedBy   string            `json:"created_by"`
	CreatedAt   time.Time         `json:"created_at"`
}

type SaleItem struct {
	GarmentID   string  `json:"garment_id"`
	Barcode     string  `json:"barcode"`
	CategoryID  string  `json:"category_id"`
	Description string  `json:"description"`
	Price       float64 `json:"price"`
}

type Sale struct {
	ID            string     `json:"id"`
	Number        string     `json:"number"`
	Items         []SaleItem `json:"items"`
	Subtotal      float64    `json:"subtotal"`
	Discount      float64    `json:"discount"`
	TaxRate       float64    `json:"tax_rate"`
	Tax           float64    `json:"tax"`
	Total         float64    `json:"total"`
	PaymentMethod string     `json:"payment_method"`
	AmountTendered float64   `json:"amount_tendered,omitempty"`
	ChangeDue     float64    `json:"change_due,omitempty"`
	Status        string     `json:"status"` // "draft" | "completed"
	CustomerID    string     `json:"customer_id,omitempty"`
	CreatedBy     string     `json:"created_by"`
	CreatedAt     time.Time  `json:"created_at"`
	CompletedAt   *time.Time `json:"completed_at,omitempty"`
}

type Event struct {
	ID          string    `json:"id"`
	EntityID    string    `json:"entity_id"`
	EntityType  string    `json:"entity_type"`
	Action      string    `json:"action"`
	Timestamp   time.Time `json:"timestamp"`
	Description string    `json:"description"`
	Actor       string    `json:"actor,omitempty"`
}

type Customer struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Phone string `json:"phone"`
}

type Settings struct {
	StoreName        string   `json:"store_name"`
	BranchID         string   `json:"branch_id"`
	Currency         string   `json:"currency"`
	CurrencySymbol   string   `json:"currency_symbol"`
	TaxEnabled       bool     `json:"tax_enabled"`
	TaxRate          float64  `json:"tax_rate"`
	TaxLabel         string   `json:"tax_label"`
	ShowPriceOnLabel bool     `json:"show_price_on_label"`
	PaymentMethods   []string `json:"payment_methods"`
}

// State is the complete persisted demo dataset.
type State struct {
	Users      []User     `json:"users"`
	Branches   []Branch   `json:"branches"`
	Categories []Category `json:"categories"`
	Batches    []Batch    `json:"batches"`
	Garments   []Garment  `json:"garments"`
	Sales      []Sale     `json:"sales"`
	Events     []Event    `json:"events"`
	Customers  []Customer `json:"customers"`
	Settings   Settings   `json:"settings"`
	Seq        map[string]int `json:"seq"`
	SeededAt   time.Time  `json:"seeded_at"`
}
