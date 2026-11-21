package api

import (
	"testing"

	"garment/backend/internal/demo"
)

func openTemp(t *testing.T) (*demo.Store, error) { return demo.Open(t.TempDir()) }
