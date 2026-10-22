// Package altsspublic reads named, anonymous Altss website resources.
// It never accesses app.altss.com, sends credentials, follows redirects or writes data.
package altsspublic

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

const origin = "https://altss.com"
const maxBytes = 4 * 1024 * 1024

var slugPattern = regexp.MustCompile(`^[a-z0-9-]{1,200}$`)
var cursorPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,256}$`)
var etagPattern = regexp.MustCompile(`^(W/)?"[\x21\x23-\x7e]{1,200}"$`)

type Options struct {
	Timeout   time.Duration
	Transport http.RoundTripper
	Sandbox   bool
}
type Client struct {
	http    *http.Client
	sandbox bool
}
type ReadOptions struct{ ETag string }
type Response struct {
	Status                                             int
	URL, ETag, LastModified, CacheControl, Environment string
	RateLimit, RateRemaining, ResetSeconds             string
	Data                                               any
}
type HTTPError struct {
	Status     int
	RetryAfter string
}

func (e *HTTPError) Error() string {
	return "Altss public resource returned HTTP " + strconv.Itoa(e.Status)
}

func New(options Options) (*Client, error) {
	if options.Timeout == 0 {
		options.Timeout = 10 * time.Second
	}
	if options.Timeout < time.Millisecond || options.Timeout > 60*time.Second {
		return nil, errors.New("timeout must be between 1 millisecond and 60 seconds")
	}
	transport := options.Transport
	if transport == nil {
		transport = http.DefaultTransport
	}
	return &Client{http: &http.Client{Timeout: options.Timeout, Transport: transport, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}, sandbox: options.Sandbox}, nil
}
func contains(values []string, value string) bool {
	for _, candidate := range values {
		if candidate == value {
			return true
		}
	}
	return false
}
func (c *Client) Catalog(ctx context.Context, name string, options ReadOptions) (*Response, error) {
	if !contains([]string{"data", "task", "commercial"}, name) {
		return nil, errors.New("unknown public catalog")
	}
	return c.get(ctx, "/api/v1/"+name+"-catalog.json", false, options)
}
func (c *Client) Schema(ctx context.Context, name string, options ReadOptions) (*Response, error) {
	if !contains([]string{"company", "organization", "family-office", "institutional-investor", "person", "fund", "transaction", "relationship", "commitment", "event", "evidence", "task-result"}, name) {
		return nil, errors.New("unknown public schema")
	}
	return c.get(ctx, "/api/v1/schemas/"+name+".json", false, options)
}
func (c *Client) Document(ctx context.Context, name string, options ReadOptions) (*Response, error) {
	if !contains([]string{"developers", "pricing", "methodology", "coverage", "platform", "ai", "agents", "auth"}, name) {
		return nil, errors.New("unknown public document")
	}
	return c.get(ctx, "/"+name+".md", true, options)
}
func (c *Client) OpenAPI(ctx context.Context, options ReadOptions) (*Response, error) {
	return c.get(ctx, "/api/v1/openapi.json", false, options)
}
func (c *Client) profileBase() string {
	if c.sandbox {
		return "/api/v1/sandbox/public/profiles"
	}
	return "/api/v1/public/profiles"
}
func (c *Client) Profile(ctx context.Context, slug string) (*Response, error) {
	if !slugPattern.MatchString(slug) {
		return nil, errors.New("invalid public profile slug")
	}
	return c.get(ctx, c.profileBase()+"/"+slug, false, ReadOptions{})
}
func (c *Client) SearchProfiles(ctx context.Context, query string, limit int, cursor string) (*Response, error) {
	query = strings.TrimSpace(query)
	count := utf8.RuneCountInString(query)
	hasName := strings.IndexFunc(query, func(r rune) bool { return unicode.IsLetter(r) || unicode.IsNumber(r) }) >= 0
	if !utf8.ValidString(query) || count < 2 || count > 120 || !hasName || limit < 1 || limit > 5 || (cursor != "" && !cursorPattern.MatchString(cursor)) {
		return nil, errors.New("invalid bounded public search")
	}
	values := url.Values{"query": {query}, "limit": {strconv.Itoa(limit)}}
	if cursor != "" {
		values.Set("cursor", cursor)
	}
	return c.get(ctx, c.profileBase()+"?"+values.Encode(), false, ReadOptions{})
}
func (c *Client) get(ctx context.Context, path string, markdown bool, options ReadOptions) (*Response, error) {
	if options.ETag != "" && !etagPattern.MatchString(options.ETag) {
		return nil, errors.New("invalid entity tag")
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, origin+path, nil)
	if err != nil {
		return nil, errors.New("invalid public request")
	}
	media := "application/json"
	if markdown {
		media = "text/markdown"
	}
	request.Header.Set("Accept", media)
	if options.ETag != "" {
		request.Header.Set("If-None-Match", options.ETag)
	}
	response, err := c.http.Do(request)
	if err != nil {
		return nil, errors.New("public request failed or exceeded its deadline")
	}
	defer response.Body.Close()
	result := &Response{Status: response.StatusCode, URL: request.URL.String(), ETag: response.Header.Get("ETag"), LastModified: response.Header.Get("Last-Modified"), CacheControl: response.Header.Get("Cache-Control"), Environment: response.Header.Get("Altss-Environment"), RateLimit: response.Header.Get("RateLimit-Limit"), RateRemaining: response.Header.Get("RateLimit-Remaining"), ResetSeconds: response.Header.Get("RateLimit-Reset")}
	if response.StatusCode == 304 && options.ETag != "" {
		return result, nil
	}
	if response.StatusCode != 200 {
		return nil, &HTTPError{Status: response.StatusCode, RetryAfter: response.Header.Get("Retry-After")}
	}
	contentType := strings.ToLower(strings.TrimSpace(strings.Split(response.Header.Get("Content-Type"), ";")[0]))
	if contentType != media && !(media == "application/json" && contentType == "application/schema+json") {
		return nil, errors.New("unexpected public content type")
	}
	if response.ContentLength > maxBytes {
		return nil, errors.New("public response exceeds 4 MiB")
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, maxBytes+1))
	if err != nil {
		return nil, errors.New("public response could not be read")
	}
	if len(body) > maxBytes {
		return nil, errors.New("public response exceeds 4 MiB")
	}
	if !utf8.Valid(body) {
		return nil, errors.New("invalid public response encoding")
	}
	if markdown {
		result.Data = string(body)
		return result, nil
	}
	var data map[string]any
	if json.Unmarshal(body, &data) != nil || data == nil {
		return nil, errors.New("public response must be a JSON object")
	}
	result.Data = data
	return result, nil
}
