# Python public reader

The owner requested continuing the remaining Ora/public-website improvements.
The existing public JavaScript and Go clients leave Python users without an
official equivalent. Add a Python 3.11+ package under python/ in the existing
public-client repository, with no runtime dependencies or authenticated Product
access. Preserve the incumbent proprietary license, JavaScript package bytes
and versions, Go module, homepage UI and anonymous public service behavior.

The client reads named catalogs, schemas, Markdown and bounded profile summaries,
uses the existing fictional sandbox, returns canonical citations supplied by the
service, and supports conditional document/catalog reads. Fixed HTTPS origin,
no redirects, ambient credentials, writes, retries, telemetry or bulk exports.
Keep TLS verification, socket time budgets and a strict 4 MiB response limit.
Document OS DNS and slow-header limitations rather than claim a hard process
deadline. Release failures must remain errors, not fabricated empty records.

Verification: deterministic validation, credential/redirect boundaries,
response sizes/types/decoding, shared read budget and connection cleanup;
strict types/lint, wheel/source builds and strict metadata checks; isolated
installation, installed declarations and genuine public reads with only selected
metadata retained privately. Existing JavaScript regressions remain mandatory.
Publication to GitHub and PyPI are separate outcomes. Do not advertise PyPI
installation on altss.com until an actual registry release is read back and
installed. An owner PyPI session and publishing authentication remain external
prerequisites; never commit credentials or turn a pending configuration into a
claim of publication.
