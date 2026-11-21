// Package pricing implements the three prototype pricing modes:
// category default, batch default and individual override.
package pricing

import (
	"errors"
	"math"
)

const (
	SourceCategory   = "category"
	SourceBatch      = "batch"
	SourceIndividual = "individual"
)

// Input describes the pricing context for one garment.
type Input struct {
	CategoryDefault float64  // always present
	BatchDefault    *float64 // optional, set by the employee for the current batch
	Override        *float64 // optional, set for this garment only
}

// Result is the effective price and the rule that produced it.
type Result struct {
	Price  float64 `json:"price"`
	Source string  `json:"price_source"`
}

// Resolve applies precedence: individual override > batch default > category default.
func Resolve(in Input) (Result, error) {
	if in.Override != nil {
		if err := Validate(*in.Override); err != nil {
			return Result{}, err
		}
		return Result{Round2(*in.Override), SourceIndividual}, nil
	}
	if in.BatchDefault != nil {
		if err := Validate(*in.BatchDefault); err != nil {
			return Result{}, err
		}
		return Result{Round2(*in.BatchDefault), SourceBatch}, nil
	}
	if err := Validate(in.CategoryDefault); err != nil {
		return Result{}, err
	}
	return Result{Round2(in.CategoryDefault), SourceCategory}, nil
}

// Validate rejects negative, non-finite or absurd prices.
func Validate(p float64) error {
	if math.IsNaN(p) || math.IsInf(p, 0) {
		return errors.New("price is not a number")
	}
	if p < 0 {
		return errors.New("price cannot be negative")
	}
	if p > 10000000 {
		return errors.New("price is unrealistically large")
	}
	return nil
}

// Round2 rounds to 2 decimal places (half away from zero).
func Round2(v float64) float64 { return math.Round(v*100) / 100 }
