package barcodes

import (
	"strings"
	"testing"
)

func TestPatternTable(t *testing.T) {
	if len(patterns) != 107 {
		t.Fatalf("expected 107 patterns, got %d", len(patterns))
	}
	seen := map[string]bool{}
	for i, p := range patterns {
		sum := 0
		for _, c := range p {
			sum += int(c - '0')
		}
		want := 11
		if i == stop {
			want = 13
		}
		if sum != want {
			t.Errorf("pattern %d (%s) sums to %d, want %d", i, p, sum, want)
		}
		if seen[p] {
			t.Errorf("duplicate pattern %s at %d", p, i)
		}
		seen[p] = true
	}
}

func TestChecksumKnownValue(t *testing.T) {
	// "PJJ123C": 104 + 48*1 + 42*2 + 42*3 + 17*4 + 18*5 + 19*6 + 35*7 = 879; 879 mod 103 = 55.
	v, err := Encode("PJJ123C")
	if err != nil {
		t.Fatal(err)
	}
	if got := v[len(v)-2]; got != 55 {
		t.Fatalf("checksum = %d, want 55", got)
	}
}

// decode reverses Modules to verify a round trip.
func decode(mods []bool) (string, bool) {
	lookup := map[string]int{}
	for i, p := range patterns[:106] {
		lookup[p] = i
	}
	var runs []int
	for i := 0; i < len(mods); {
		j := i
		for j < len(mods) && mods[j] == mods[i] {
			j++
		}
		runs = append(runs, j-i)
		i = j
	}
	var vals []int
	for k := 0; k+6 <= len(runs)-7; k += 6 {
		key := ""
		for _, r := range runs[k : k+6] {
			key += string(rune('0' + r))
		}
		v, ok := lookup[key]
		if !ok {
			return "", false
		}
		vals = append(vals, v)
	}
	if len(vals) < 3 || vals[0] != startB {
		return "", false
	}
	sum := vals[0]
	for i := 1; i < len(vals)-1; i++ {
		sum += vals[i] * i
	}
	if sum%103 != vals[len(vals)-1] {
		return "", false
	}
	var sb strings.Builder
	for _, v := range vals[1 : len(vals)-1] {
		sb.WriteRune(rune(v + 32))
	}
	return sb.String(), true
}

func TestRoundTrip(t *testing.T) {
	for _, s := range []string{"GM-261121-0001", "hello World 42", "~!@#"} {
		m, err := Modules(s)
		if err != nil {
			t.Fatal(err)
		}
		got, ok := decode(m)
		if !ok || got != s {
			t.Fatalf("round trip %q -> %q ok=%v", s, got, ok)
		}
	}
}

func TestRejectsInvalid(t *testing.T) {
	if _, err := Encode(""); err == nil {
		t.Fatal("expected error for empty")
	}
	if _, err := Encode("é"); err == nil {
		t.Fatal("expected error for non-ascii")
	}
}

func TestSVG(t *testing.T) {
	s, err := SVG("GM-1", 2, 60, true)
	if err != nil || !strings.HasPrefix(s, "<svg") || !strings.Contains(s, "GM-1") {
		t.Fatalf("bad svg: %v %s", err, s)
	}
}
