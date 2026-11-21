// Package barcodes implements a dependency-free Code 128 (code set B) encoder
// that renders scannable SVG barcodes.
package barcodes

import (
	"errors"
	"fmt"
	"strings"
)

// patterns holds bar/space module widths for Code 128 symbol values 0..106.
// Index 106 is the STOP pattern (13 modules, including the final bar).
var patterns = []string{
	"212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
	"221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
	"221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
	"212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
	"231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
	"231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
	"314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
	"112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
	"111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
	"214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
	"114131", "311141", "411131", "211412", "211214", "211232", "2331112",
}

const (
	startB = 104
	stop   = 106
)

// Patterns exposes the pattern table (used by tests).
func Patterns() []string { return patterns }

// Encode returns the sequence of Code 128 symbol values (start, data, checksum, stop).
func Encode(data string) ([]int, error) {
	if data == "" {
		return nil, errors.New("barcode value is empty")
	}
	if len(data) > 64 {
		return nil, errors.New("barcode value too long")
	}
	values := []int{startB}
	for _, r := range data {
		if r < 32 || r > 126 {
			return nil, fmt.Errorf("character %q is not encodable in Code 128 set B", r)
		}
		values = append(values, int(r)-32)
	}
	sum := values[0]
	for i := 1; i < len(values); i++ {
		sum += values[i] * i
	}
	values = append(values, sum%103, stop)
	return values, nil
}

// Modules returns the barcode as a slice of booleans (true = bar) excluding quiet zones.
func Modules(data string) ([]bool, error) {
	values, err := Encode(data)
	if err != nil {
		return nil, err
	}
	var mods []bool
	for _, v := range values {
		bar := true
		for _, w := range patterns[v] {
			n := int(w - '0')
			for i := 0; i < n; i++ {
				mods = append(mods, bar)
			}
			bar = !bar
		}
	}
	return mods, nil
}

// SVG renders the barcode. moduleWidth and height are in SVG user units.
// When withText is true, the human-readable value is printed underneath.
func SVG(data string, moduleWidth, height float64, withText bool) (string, error) {
	mods, err := Modules(data)
	if err != nil {
		return "", err
	}
	quiet := 10.0 * moduleWidth
	width := quiet*2 + float64(len(mods))*moduleWidth
	textH := 0.0
	if withText {
		textH = 18
	}
	var b strings.Builder
	fmt.Fprintf(&b, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %.2f %.2f" width="%.2f" height="%.2f" shape-rendering="crispEdges">`, width, height+textH, width, height+textH)
	fmt.Fprintf(&b, `<rect width="100%%" height="100%%" fill="#fff"/><g fill="#000">`)
	for i := 0; i < len(mods); {
		if !mods[i] {
			i++
			continue
		}
		j := i
		for j < len(mods) && mods[j] {
			j++
		}
		fmt.Fprintf(&b, `<rect x="%.2f" y="0" width="%.2f" height="%.2f"/>`, quiet+float64(i)*moduleWidth, float64(j-i)*moduleWidth, height)
		i = j
	}
	b.WriteString(`</g>`)
	if withText {
		fmt.Fprintf(&b, `<text x="%.2f" y="%.2f" font-family="monospace" font-size="14" text-anchor="middle" fill="#000">%s</text>`, width/2, height+15, escape(data))
	}
	b.WriteString(`</svg>`)
	return b.String(), nil
}

func escape(s string) string {
	r := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;")
	return r.Replace(s)
}
