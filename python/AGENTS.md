# Python public reader

Preserve the parent repository's public-only scope. Fixed https://altss.com origin,
GETs only, named resource paths and bounded profile slugs/search. No tokens,
account data, proxy credential loading, redirect following, hidden retry, writes,
bulk export or Product execution. TLS validation remains enabled. Keep a shared
remaining time budget across socket operations and a strict 4 MiB body limit.
Document operating-system DNS timeout limitations and synchronous behavior.

Run meaningful network-boundary/deadline/error tests, wheel and source builds,
strict metadata and declaration checks, an isolated wheel installation and real
public reads before release. Never count a prepared artifact, source tag or
pending publisher configuration as a live PyPI publication. Preserve the existing
proprietary licensing and exact package evidence; never store credentials here.
