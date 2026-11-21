// Package classification provides the AI category suggestion adapter.
//
// Modes:
//   - Known demo sample images -> deterministic mock predictions (source "demo_mock").
//   - Uploaded photos with GEMINI_API_KEY set on the server -> real vision API call
//     with structured JSON output, validated against the allowed category list
//     (source "vision_api"). API keys never leave the server.
//   - Uploaded photos without a key, or when the API fails/times out ->
//     heuristic demo fallback clearly labelled (source "demo_fallback").
package classification

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"hash/fnv"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"
)

type Alternative struct {
	Category string  `json:"category"`
	Score    float64 `json:"score"`
}

type Result struct {
	Category     string            `json:"category"`
	Confidence   float64           `json:"confidence"`
	Alternatives []Alternative     `json:"alternatives"`
	Attributes   map[string]string `json:"attributes"`
	Source       string            `json:"source"`
	IsFallback   bool              `json:"is_fallback"`
	Notice       string            `json:"notice"`
	LatencyMS    int64             `json:"latency_ms"`
}

type AllowedCategory struct {
	ID   string
	Name string
}

// Live reports whether a real vision provider is configured.
func Live() bool { return os.Getenv("GEMINI_API_KEY") != "" }

func Mode() string {
	if Live() {
		return "vision_api"
	}
	return "demo_mock"
}

// Normalize keeps the result inside the allowed taxonomy: invalid categories
// are dropped, at most two alternatives are kept, scores are clamped.
func Normalize(r Result, allowed []AllowedCategory) (Result, error) {
	ok := map[string]bool{}
	for _, a := range allowed {
		ok[a.ID] = true
	}
	if !ok[r.Category] {
		return r, fmt.Errorf("model returned category %q outside the allowed list", r.Category)
	}
	clamp := func(v float64) float64 {
		if v < 0 {
			return 0
		}
		if v > 0.99 {
			return 0.99 // never present a suggestion as certain
		}
		return v
	}
	r.Confidence = clamp(r.Confidence)
	var alts []Alternative
	seen := map[string]bool{r.Category: true}
	for _, a := range r.Alternatives {
		if ok[a.Category] && !seen[a.Category] {
			seen[a.Category] = true
			alts = append(alts, Alternative{a.Category, clamp(a.Score)})
		}
	}
	sort.SliceStable(alts, func(i, j int) bool { return alts[i].Score > alts[j].Score })
	if len(alts) > 2 {
		alts = alts[:2]
	}
	r.Alternatives = alts
	if r.Attributes == nil {
		r.Attributes = map[string]string{}
	}
	return r, nil
}

// Heuristic produces a deterministic, clearly-labelled demo fallback for an
// arbitrary photo: dominant colour is measured, category is pseudo-random but stable.
func Heuristic(img []byte, allowed []AllowedCategory) Result {
	h := fnv.New32a()
	h.Write(img)
	sum := h.Sum32()
	n := len(allowed)
	r := Result{Attributes: map[string]string{}, Source: "demo_fallback", IsFallback: true,
		Notice: "Demo fallback: no live vision API was used for this photo. Please confirm the category."}
	if n == 0 {
		return r
	}
	i := int(sum % uint32(n))
	r.Category = allowed[i].ID
	r.Confidence = 0.42 + float64(sum%17)/100
	if n > 1 {
		r.Alternatives = append(r.Alternatives, Alternative{allowed[(i+1)%n].ID, 0.25})
	}
	if n > 2 {
		r.Alternatives = append(r.Alternatives, Alternative{allowed[(i+2)%n].ID, 0.12})
	}
	if c := DominantColor(img); c != "" {
		r.Attributes["color"] = c
	}
	return r
}

// DominantColor returns a coarse colour name for JPEG/PNG input ("" if undecodable).
func DominantColor(b []byte) string {
	img, _, err := image.Decode(bytes.NewReader(b))
	if err != nil {
		return ""
	}
	bd := img.Bounds()
	var rs, gs, bs, n uint64
	// sample the central 50% region on a grid
	for y := bd.Min.Y + bd.Dy()/4; y < bd.Max.Y-bd.Dy()/4; y += max(1, bd.Dy()/60) {
		for x := bd.Min.X + bd.Dx()/4; x < bd.Max.X-bd.Dx()/4; x += max(1, bd.Dx()/60) {
			r, g, b, _ := img.At(x, y).RGBA()
			rs, gs, bs, n = rs+uint64(r>>8), gs+uint64(g>>8), bs+uint64(b>>8), n+1
		}
	}
	if n == 0 {
		return ""
	}
	return NameColor(int(rs/n), int(gs/n), int(bs/n))
}

func NameColor(r, g, b int) string {
	mx, mn := max(r, max(g, b)), min(r, min(g, b))
	if mx < 50 {
		return "black"
	}
	if mn > 200 {
		return "white"
	}
	if mx-mn < 25 {
		return "grey"
	}
	switch {
	case r >= g && r >= b:
		if g > 150 && b < 120 {
			return "yellow"
		}
		if g > 100 && b < 80 {
			return "orange"
		}
		if b > 120 {
			return "pink"
		}
		if mx < 140 {
			return "maroon"
		}
		return "red"
	case g >= r && g >= b:
		if b > 120 && g-b < 40 {
			return "teal"
		}
		return "green"
	default:
		if r > 120 {
			return "purple"
		}
		if mx < 120 {
			return "navy"
		}
		return "blue"
	}
}

// Vision calls the configured provider (Gemini generateContent) with the image
// and the allowed category list, requesting structured JSON.
func Vision(ctx context.Context, img []byte, mime string, allowed []AllowedCategory) (Result, error) {
	key := os.Getenv("GEMINI_API_KEY")
	if key == "" {
		return Result{}, errors.New("vision API not configured")
	}
	model := os.Getenv("GEMINI_MODEL")
	if model == "" {
		model = "gemini-2.5-flash"
	}
	var ids []string
	for _, a := range allowed {
		ids = append(ids, fmt.Sprintf("%s (%s)", a.ID, a.Name))
	}
	prompt := "You are a garment classifier for a thrift store. Classify the single main garment in the photo into exactly one of these category ids: " +
		strings.Join(ids, ", ") + `. Respond ONLY with JSON: {"category": "<id>", "confidence": <0..1>, "alternatives": [{"category": "<id>", "score": <0..1>}], "attributes": {"color": "<simple colour>", "sleeve": "<full|half|none if applicable>", "pattern": "<solid|check|stripe|print>"}}. Use at most two alternatives, all ids from the list.`
	body := map[string]any{
		"contents": []any{map[string]any{"parts": []any{
			map[string]any{"text": prompt},
			map[string]any{"inline_data": map[string]any{"mime_type": mime, "data": base64.StdEncoding.EncodeToString(img)}},
		}}},
		"generationConfig": map[string]any{"responseMimeType": "application/json", "temperature": 0},
	}
	jb, _ := json.Marshal(body)
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, "https://generativelanguage.googleapis.com/v1beta/models/"+model+":generateContent", bytes.NewReader(jb))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-goog-api-key", key)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return Result{}, err
	}
	defer resp.Body.Close()
	rb, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode != 200 {
		return Result{}, fmt.Errorf("vision API status %d", resp.StatusCode)
	}
	var gr struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}
	if err := json.Unmarshal(rb, &gr); err != nil || len(gr.Candidates) == 0 || len(gr.Candidates[0].Content.Parts) == 0 {
		return Result{}, errors.New("vision API returned no content")
	}
	var r Result
	txt := strings.TrimSpace(gr.Candidates[0].Content.Parts[0].Text)
	txt = strings.TrimPrefix(strings.TrimSuffix(strings.TrimPrefix(txt, "```json"), "```"), "```")
	if err := json.Unmarshal([]byte(txt), &r); err != nil {
		return Result{}, fmt.Errorf("vision API JSON invalid: %w", err)
	}
	r.Source = "vision_api"
	r.Notice = "AI suggestion from a sandbox vision API. Accuracy has not been validated on store images."
	return Normalize(r, allowed)
}

// Timeout used for live calls; the UI additionally offers manual fallback.
const Timeout = 8 * time.Second
