package classification

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"testing"
)

func TestNormalizeAndHeuristic(t *testing.T) {
	allowed := []AllowedCategory{
		{ID: "formal_shirt", Name: "Formal Shirt"},
		{ID: "casual_shirt", Name: "Casual Shirt"},
		{ID: "jeans", Name: "Jeans"},
		{ID: "jacket", Name: "Jacket"},
	}

	// Rejects primary category outside allowed taxonomy
	_, err := Normalize(Result{Category: "unknown_cat", Confidence: 0.9}, allowed)
	if err == nil {
		t.Fatal("expected Normalize to reject category outside allowed taxonomy")
	}

	// Clamps confidence to <= 0.99, filters unknown/duplicate alternatives, keeps top 2 sorted by score
	norm, err := Normalize(Result{
		Category:   "formal_shirt",
		Confidence: 1.2,
		Alternatives: []Alternative{
			{Category: "formal_shirt", Score: 0.8}, // duplicate of primary
			{Category: "not_allowed", Score: 0.9},  // outside taxonomy
			{Category: "jeans", Score: 0.15},
			{Category: "casual_shirt", Score: 0.45},
			{Category: "jacket", Score: 0.30},
		},
	}, allowed)
	if err != nil {
		t.Fatalf("Normalize failed: %v", err)
	}
	if norm.Confidence != 0.99 {
		t.Fatalf("expected clamped confidence 0.99, got %v", norm.Confidence)
	}
	if len(norm.Alternatives) != 2 || norm.Alternatives[0].Category != "casual_shirt" || norm.Alternatives[1].Category != "jacket" {
		t.Fatalf("unexpected normalized alternatives: %+v", norm.Alternatives)
	}

	// Heuristic produces deterministic fallback with dominant color extraction on valid PNG
	img := image.NewRGBA(image.Rect(0, 0, 40, 40))
	for y := 0; y < 40; y++ {
		for x := 0; x < 40; x++ {
			img.Set(x, y, color.RGBA{R: 30, G: 80, B: 210, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	h1 := Heuristic(buf.Bytes(), allowed)
	h2 := Heuristic(buf.Bytes(), allowed)
	if !h1.IsFallback || h1.Source != "demo_fallback" || h1.Category != h2.Category {
		t.Fatalf("expected deterministic fallback result, got %+v vs %+v", h1, h2)
	}
	if h1.Attributes["color"] != "blue" {
		t.Fatalf("expected dominant color 'blue', got %q", h1.Attributes["color"])
	}
}

func TestNameColorPalette(t *testing.T) {
	cases := []struct {
		r, g, b int
		want    string
	}{
		{10, 10, 10, "black"},
		{240, 240, 240, "white"},
		{120, 125, 122, "grey"},
		{220, 200, 40, "yellow"},
		{220, 130, 30, "orange"},
		{220, 40, 40, "red"},
		{40, 180, 60, "green"},
		{30, 60, 90, "navy"},
		{40, 90, 220, "blue"},
	}
	for _, c := range cases {
		if got := NameColor(c.r, c.g, c.b); got != c.want {
			t.Errorf("NameColor(%d,%d,%d) = %q, want %q", c.r, c.g, c.b, got, c.want)
		}
	}
}
