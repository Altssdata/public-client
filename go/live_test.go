//go:build integration

package altsspublic

import (
	"context"
	"testing"
)

func TestLivePublic(t *testing.T) {
	c, err := New(Options{})
	if err != nil {
		t.Fatal(err)
	}
	catalog, err := c.Catalog(context.Background(), "data", ReadOptions{})
	if err != nil || catalog.Status != 200 {
		t.Fatal("live public catalog", err)
	}
	if _, ok := catalog.Data.(map[string]any)["entities"]; !ok {
		t.Fatal("missing public field descriptions")
	}
	search, err := c.SearchProfiles(context.Background(), "Daimler Truck", 2, "")
	if err != nil || search.Status != 200 {
		t.Fatal("live public search", err)
	}
	if len(search.Data.(map[string]any)["results"].([]any)) < 1 {
		t.Fatal("no public profile matches")
	}
}
