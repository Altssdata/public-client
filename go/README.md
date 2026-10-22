# Altss public Go client

Official anonymous reader for [Altss public website resources](https://altss.com/developers). The standard-library client reads public catalogs, JSON Schemas, Markdown and bounded published profile summaries. It has no runtime dependencies, login, Product credentials, paid-task execution or write operations.

```sh
go get github.com/Altssdata/public-client/go@v0.1.0
```

```go
package main

import (
    "context"
    "fmt"
    altss "github.com/Altssdata/public-client/go"
)

func main() {
    client, err := altss.New(altss.Options{})
    if err != nil { panic(err) }
    response, err := client.SearchProfiles(context.Background(), "Daimler Truck", 2, "")
    if err != nil { panic(err) }
    fmt.Println(response.Data)
}
```

`Catalog`, `Schema`, `Document` and `OpenAPI` read allowlisted references. `SearchProfiles` accepts a 2–120 character organization name, limit 1–5 and an optional cursor. `Profile` reads one public slug. All methods use only `https://altss.com` and GET. `Options{Sandbox:true}` selects fictional sandbox fixtures for profile methods; catalogs and documents keep their original public URLs. Sandbox examples use `Example` and `example-capital-01`.

The default deadline is ten seconds, with a configurable maximum of sixty seconds. Responses are limited to four MiB. Redirects are rejected and no cookies or authorization headers are supplied. A conditional catalog/document 304 has nil Data; retain the representation associated with the ETag supplied in ReadOptions. Errors expose HTTP status and Retry-After, never provider response bodies. There are no automatic retries. Instance rate headers are returned as strings in the Response metadata.

Run `go test ./...` for network-free fixture and boundary tests. Explicit integration checks use `go test -tags=integration -run TestLivePublic ./...` and make bounded GETs to published Altss resources. Test fixtures are not evidence of a live response. Support: contact@altss.com.
