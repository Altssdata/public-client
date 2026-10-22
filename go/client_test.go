package altsspublic

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

type roundTrip func(*http.Request) (*http.Response, error)

func (f roundTrip) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func reply(code int, body, media string) *http.Response {
	return &http.Response{StatusCode: code, Header: http.Header{"Content-Type": {media}}, Body: io.NopCloser(strings.NewReader(body))}
}
func TestPublicBoundaries(t *testing.T) {
	requests := 0
	c, _ := New(Options{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
		requests++
		if r.Method != "GET" || r.URL.Host != "altss.com" || r.Header.Get("Authorization") != "" || r.Header.Get("Cookie") != "" {
			t.Fatal("public boundary")
		}
		return reply(200, `{"public":true}`, "application/json"), nil
	})})
	if _, err := c.Catalog(context.Background(), "data", ReadOptions{}); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"../account", "https://app.altss.com", "__proto__"} {
		if _, err := c.Catalog(context.Background(), name, ReadOptions{}); err == nil {
			t.Fatal("invalid catalog accepted")
		}
		if _, err := c.Profile(context.Background(), name); err == nil {
			t.Fatal("invalid slug accepted")
		}
	}
	if requests != 1 {
		t.Fatal("invalid input reached transport")
	}
}
func TestSearchAndSandbox(t *testing.T) {
	c, _ := New(Options{Sandbox: true, Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/api/v1/sandbox/public/profiles" || r.URL.Query().Get("query") != "Company & Partners" || r.URL.Query().Get("limit") != "2" {
			t.Fatal("wrong sandbox request")
		}
		response := reply(200, `{"results":[]}`, "application/json")
		response.Header.Set("Altss-Environment", "sandbox")
		response.Header.Set("RateLimit-Limit", "120")
		return response, nil
	})})
	r, err := c.SearchProfiles(context.Background(), "Company & Partners", 2, "")
	if err != nil || r.Environment != "sandbox" || r.RateLimit != "120" {
		t.Fatal("missing metadata", err)
	}
	for _, query := range []string{"x", "__", strings.Repeat("a", 121)} {
		if _, err := c.SearchProfiles(context.Background(), query, 2, ""); err == nil {
			t.Fatal("invalid query")
		}
	}
	for _, limit := range []int{0, 6, -1} {
		if _, err := c.SearchProfiles(context.Background(), "Company", limit, ""); err == nil {
			t.Fatal("invalid limit")
		}
	}
	if _, err := c.SearchProfiles(context.Background(), "Company", 2, "../private"); err == nil {
		t.Fatal("invalid cursor")
	}
}
func TestConditionalAndFailures(t *testing.T) {
	c, _ := New(Options{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
		if r.Header.Get("If-None-Match") != "\"saved\"" {
			t.Fatal("missing validator")
		}
		return reply(304, "", "application/json"), nil
	})})
	if r, err := c.Catalog(context.Background(), "data", ReadOptions{ETag: "\"saved\""}); err != nil || r.Status != 304 || r.Data != nil {
		t.Fatal("conditional contract")
	}
	if _, err := c.Catalog(context.Background(), "data", ReadOptions{ETag: "bad\r\nAuthorization: PRIVATE"}); err == nil {
		t.Fatal("header injection")
	}
	for _, status := range []int{302, 401, 404, 429, 503} {
		c, _ = New(Options{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
			response := reply(status, "PRIVATE_PROVIDER_BODY", "application/json")
			response.Header.Set("Location", "https://app.altss.com")
			response.Header.Set("Retry-After", "30")
			return response, nil
		})})
		_, err := c.OpenAPI(context.Background(), ReadOptions{})
		var actual *HTTPError
		if !errors.As(err, &actual) || actual.Status != status || actual.RetryAfter != "30" || strings.Contains(err.Error(), "PRIVATE") {
			t.Fatal("unsafe HTTP error")
		}
	}
}
func TestResponseValidation(t *testing.T) {
	for _, body := range []string{"[]", "null", "invalid", string([]byte{0xff}), strings.Repeat("x", maxBytes+1)} {
		c, _ := New(Options{Transport: roundTrip(func(*http.Request) (*http.Response, error) { return reply(200, body, "application/json"), nil })})
		if _, err := c.OpenAPI(context.Background(), ReadOptions{}); err == nil {
			t.Fatal("invalid response accepted")
		}
	}
	c, _ := New(Options{Transport: roundTrip(func(*http.Request) (*http.Response, error) { return reply(200, "{}", "text/html"), nil })})
	if _, err := c.OpenAPI(context.Background(), ReadOptions{}); err == nil {
		t.Fatal("wrong media accepted")
	}
}
func TestCancellationAndTimeout(t *testing.T) {
	if _, err := New(Options{Timeout: 61 * time.Second}); err == nil {
		t.Fatal("invalid timeout")
	}
	c, _ := New(Options{Timeout: time.Millisecond, Transport: roundTrip(func(r *http.Request) (*http.Response, error) { <-r.Context().Done(); return nil, r.Context().Err() })})
	if _, err := c.OpenAPI(context.Background(), ReadOptions{}); err == nil {
		t.Fatal("timeout ignored")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := c.OpenAPI(ctx, ReadOptions{}); err == nil {
		t.Fatal("cancel ignored")
	}
}
