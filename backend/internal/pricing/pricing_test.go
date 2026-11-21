package pricing

import "testing"

func f(v float64) *float64 { return &v }

func TestResolve(t *testing.T) {
	cases := []struct {
		name string
		in   Input
		want Result
	}{
		{"category", Input{CategoryDefault: 599}, Result{599, SourceCategory}},
		{"batch", Input{CategoryDefault: 599, BatchDefault: f(350)}, Result{350, SourceBatch}},
		{"override", Input{CategoryDefault: 599, BatchDefault: f(350), Override: f(425.555)}, Result{425.56, SourceIndividual}},
		{"override zero allowed", Input{CategoryDefault: 599, Override: f(0)}, Result{0, SourceIndividual}},
	}
	for _, c := range cases {
		got, err := Resolve(c.in)
		if err != nil || got != c.want {
			t.Errorf("%s: got %+v err=%v want %+v", c.name, got, err, c.want)
		}
	}
	if _, err := Resolve(Input{CategoryDefault: 10, Override: f(-1)}); err == nil {
		t.Error("expected negative override to fail")
	}
}
