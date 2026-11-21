package demo

import (
	"fmt"
	"strings"
)

// Sample is a synthetic, generated garment image used for the demo intake flow
// and for seeded inventory. No real customer or store imagery is used.
type Sample struct {
	ID           string            `json:"id"`
	Label        string            `json:"label"`
	Art          string            `json:"-"` // shirt | casual | tshirt | jeans | trousers | jacket | dress
	Color        string            `json:"color_hex"`
	ColorName    string            `json:"color_name"`
	Category     string            `json:"-"` // ground truth used by the mock classifier
	Alternatives []Alternative     `json:"-"`
	Confidence   float64           `json:"-"`
	Attributes   map[string]string `json:"-"`
	Intake       bool              `json:"intake"` // offered in the "choose sample photo" gallery
}

type Alternative struct {
	Category string  `json:"category"`
	Score    float64 `json:"score"`
}

// Samples is the prepared set of garment pictures (SRS: have 5–7 prepared images).
var Samples = []Sample{
	{ID: "s01", Label: "Blue formal shirt", Art: "shirt", Color: "#4a78c2", ColorName: "blue", Category: "formal_shirt", Confidence: 0.82,
		Alternatives: []Alternative{{"casual_shirt", 0.14}, {"t_shirt", 0.04}}, Attributes: map[string]string{"color": "blue", "sleeve": "full"}, Intake: true},
	{ID: "s02", Label: "Red check casual shirt", Art: "casual", Color: "#c0473f", ColorName: "red", Category: "casual_shirt", Confidence: 0.71,
		Alternatives: []Alternative{{"formal_shirt", 0.21}, {"jacket", 0.05}}, Attributes: map[string]string{"color": "red", "pattern": "check", "sleeve": "full"}, Intake: true},
	{ID: "s03", Label: "Mustard graphic tee", Art: "tshirt", Color: "#e0a526", ColorName: "yellow", Category: "t_shirt", Confidence: 0.9,
		Alternatives: []Alternative{{"casual_shirt", 0.07}, {"dress", 0.02}}, Attributes: map[string]string{"color": "yellow", "sleeve": "half"}, Intake: true},
	{ID: "s04", Label: "Indigo denim jeans", Art: "jeans", Color: "#2f4b7c", ColorName: "indigo", Category: "jeans", Confidence: 0.88,
		Alternatives: []Alternative{{"trousers", 0.1}, {"jacket", 0.01}}, Attributes: map[string]string{"color": "indigo", "fit": "straight"}, Intake: true},
	{ID: "s05", Label: "Olive utility jacket", Art: "jacket", Color: "#6b7a3a", ColorName: "olive", Category: "jacket", Confidence: 0.77,
		Alternatives: []Alternative{{"casual_shirt", 0.15}, {"formal_shirt", 0.05}}, Attributes: map[string]string{"color": "olive", "sleeve": "full"}, Intake: true},
	{ID: "s06", Label: "Teal summer dress", Art: "dress", Color: "#1f9e95", ColorName: "teal", Category: "dress", Confidence: 0.86,
		Alternatives: []Alternative{{"t_shirt", 0.08}, {"casual_shirt", 0.03}}, Attributes: map[string]string{"color": "teal", "length": "midi"}, Intake: true},
	{ID: "s07", Label: "Beige chino trousers", Art: "trousers", Color: "#c9ae84", ColorName: "beige", Category: "trousers", Confidence: 0.64,
		Alternatives: []Alternative{{"jeans", 0.3}, {"dress", 0.02}}, Attributes: map[string]string{"color": "beige", "fit": "slim"}, Intake: true},
	// Additional artwork for seeded inventory variety.
	{ID: "s08", Label: "White formal shirt", Art: "shirt", Color: "#e9edf2", ColorName: "white", Category: "formal_shirt", Confidence: 0.8,
		Alternatives: []Alternative{{"casual_shirt", 0.15}, {"t_shirt", 0.05}}, Attributes: map[string]string{"color": "white", "sleeve": "full"}},
	{ID: "s09", Label: "Black tee", Art: "tshirt", Color: "#2b2d33", ColorName: "black", Category: "t_shirt", Confidence: 0.9,
		Alternatives: []Alternative{{"casual_shirt", 0.08}, {"jacket", 0.02}}, Attributes: map[string]string{"color": "black", "sleeve": "half"}},
	{ID: "s10", Label: "Light wash jeans", Art: "jeans", Color: "#7f9cc4", ColorName: "light blue", Category: "jeans", Confidence: 0.85,
		Alternatives: []Alternative{{"trousers", 0.13}, {"jacket", 0.02}}, Attributes: map[string]string{"color": "light blue", "fit": "relaxed"}},
	{ID: "s11", Label: "Maroon dress", Art: "dress", Color: "#7d2a3c", ColorName: "maroon", Category: "dress", Confidence: 0.83,
		Alternatives: []Alternative{{"t_shirt", 0.1}, {"casual_shirt", 0.07}}, Attributes: map[string]string{"color": "maroon", "length": "knee"}},
	{ID: "s12", Label: "Navy blazer jacket", Art: "jacket", Color: "#25324d", ColorName: "navy", Category: "jacket", Confidence: 0.74,
		Alternatives: []Alternative{{"formal_shirt", 0.2}, {"casual_shirt", 0.06}}, Attributes: map[string]string{"color": "navy", "sleeve": "full"}},
	{ID: "s13", Label: "Green check shirt", Art: "casual", Color: "#3f8a5a", ColorName: "green", Category: "casual_shirt", Confidence: 0.7,
		Alternatives: []Alternative{{"formal_shirt", 0.22}, {"jacket", 0.08}}, Attributes: map[string]string{"color": "green", "pattern": "check"}},
	{ID: "s14", Label: "Grey trousers", Art: "trousers", Color: "#80868f", ColorName: "grey", Category: "trousers", Confidence: 0.66,
		Alternatives: []Alternative{{"jeans", 0.28}, {"dress", 0.03}}, Attributes: map[string]string{"color": "grey", "fit": "regular"}},
}

func SampleByID(id string) (Sample, bool) {
	for _, s := range Samples {
		if s.ID == id {
			return s, true
		}
	}
	return Sample{}, false
}

func shade(hex string, f float64) string {
	var r, g, b int
	fmt.Sscanf(strings.TrimPrefix(hex, "#"), "%02x%02x%02x", &r, &g, &b)
	c := func(v int) int {
		x := int(float64(v) * f)
		if x > 255 {
			x = 255
		}
		return x
	}
	return fmt.Sprintf("#%02x%02x%02x", c(r), c(g), c(b))
}

// SampleSVG draws a simple, consistent flat illustration of a garment.
func SampleSVG(s Sample) string {
	fill, dark, light := s.Color, shade(s.Color, 0.72), shade(s.Color, 1.18)
	var body string
	switch s.Art {
	case "shirt", "casual":
		pattern := ""
		fillRef := fill
		if s.Art == "casual" {
			pattern = fmt.Sprintf(`<defs><pattern id="chk" width="28" height="28" patternUnits="userSpaceOnUse"><rect width="28" height="28" fill="%s"/><rect width="14" height="28" fill="%s" opacity=".55"/><rect width="28" height="14" fill="%s" opacity=".45"/></pattern></defs>`, fill, dark, light)
			fillRef = "url(#chk)"
		}
		body = pattern + fmt.Sprintf(`<path d="M140 80 L105 92 L70 200 L58 322 L95 328 L117 212 L125 185 L125 338 L275 338 L275 185 L283 212 L305 328 L342 322 L330 200 L295 92 L260 80 Q200 108 140 80Z" fill="%s" stroke="%s" stroke-width="4" stroke-linejoin="round"/>`, fillRef, dark) +
			fmt.Sprintf(`<path d="M140 80 L172 124 L200 100 L228 124 L260 80 L232 70 L200 94 L168 70Z" fill="%s" stroke="%s" stroke-width="4" stroke-linejoin="round"/>`, light, dark) +
			fmt.Sprintf(`<line x1="200" y1="100" x2="200" y2="338" stroke="%s" stroke-width="3"/>`, dark)
		for y := 135; y < 330; y += 40 {
			body += fmt.Sprintf(`<circle cx="210" cy="%d" r="4" fill="%s"/>`, y, light)
		}
		if s.Art == "shirt" {
			body += fmt.Sprintf(`<rect x="225" y="140" width="32" height="34" rx="3" fill="none" stroke="%s" stroke-width="3"/>`, dark)
		}
	case "tshirt":
		body = fmt.Sprintf(`<path d="M145 82 L110 92 L58 145 L95 182 L125 156 L125 335 L275 335 L275 156 L305 182 L342 145 L290 92 L255 82 Q200 122 145 82Z" fill="%s" stroke="%s" stroke-width="4" stroke-linejoin="round"/>`, fill, dark) +
			fmt.Sprintf(`<path d="M145 82 Q200 122 255 82" fill="none" stroke="%s" stroke-width="8"/>`, dark) +
			fmt.Sprintf(`<circle cx="200" cy="215" r="38" fill="%s" opacity=".85"/><path d="M182 215 L196 229 L222 200" stroke="%s" stroke-width="7" fill="none" stroke-linecap="round"/>`, light, dark)
	case "jeans", "trousers":
		body = fmt.Sprintf(`<path d="M135 70 L265 70 L288 340 L222 340 L200 165 L178 340 L112 340Z" fill="%s" stroke="%s" stroke-width="4" stroke-linejoin="round"/>`, fill, dark) +
			fmt.Sprintf(`<rect x="133" y="66" width="134" height="22" fill="%s" stroke="%s" stroke-width="4"/>`, light, dark) +
			fmt.Sprintf(`<line x1="200" y1="88" x2="200" y2="160" stroke="%s" stroke-width="3"/>`, dark)
		if s.Art == "jeans" {
			body += fmt.Sprintf(`<path d="M140 92 Q160 128 180 92 M220 92 Q240 128 260 92" fill="none" stroke="#e7b84a" stroke-width="3" stroke-dasharray="6 4"/>`)
		} else {
			body += fmt.Sprintf(`<path d="M165 92 L170 330 M235 92 L230 330" stroke="%s" stroke-width="2" opacity=".6"/>`, dark)
		}
	case "jacket":
		body = fmt.Sprintf(`<path d="M135 78 L95 92 L62 205 L52 330 L94 334 L112 215 L122 190 L118 345 L282 345 L278 190 L288 215 L306 334 L348 330 L338 205 L305 92 L265 78 L200 120Z" fill="%s" stroke="%s" stroke-width="4" stroke-linejoin="round"/>`, fill, dark) +
			fmt.Sprintf(`<path d="M135 78 L170 160 L200 120 L230 160 L265 78" fill="%s" stroke="%s" stroke-width="4" stroke-linejoin="round"/>`, light, dark) +
			fmt.Sprintf(`<line x1="200" y1="125" x2="200" y2="345" stroke="#d9d9d9" stroke-width="4" stroke-dasharray="3 3"/>`) +
			fmt.Sprintf(`<rect x="135" y="250" width="45" height="38" rx="4" fill="none" stroke="%s" stroke-width="3"/><rect x="220" y="250" width="45" height="38" rx="4" fill="none" stroke="%s" stroke-width="3"/>`, dark, dark)
	case "dress":
		body = fmt.Sprintf(`<path d="M165 68 L150 80 L156 150 L170 172 L108 342 L292 342 L230 172 L244 150 L250 80 L235 68 Q200 104 165 68Z" fill="%s" stroke="%s" stroke-width="4" stroke-linejoin="round"/>`, fill, dark) +
			fmt.Sprintf(`<rect x="164" y="164" width="72" height="14" rx="5" fill="%s" stroke="%s" stroke-width="3"/>`, light, dark) +
			fmt.Sprintf(`<path d="M140 290 Q200 305 260 290" fill="none" stroke="%s" stroke-width="3" opacity=".7"/>`, light)
	}
	return fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400"><rect width="400" height="400" fill="#f3f1ec"/><ellipse cx="200" cy="365" rx="140" ry="12" fill="#00000014"/>%s<text x="16" y="388" font-family="sans-serif" font-size="12" fill="#9a968c">DEMO SAMPLE IMAGE</text></svg>`, body)
}
