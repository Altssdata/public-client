# Reviewed Python registry publication

The Python 0.1.0 source and distribution files are already published and tested
on GitHub. The owner completed PyPI email verification and 2FA. Add a manual
publishing workflow for exactly the reviewed wheel and source archive, with
hard-coded SHA-256 digests and a fixed release URL. It cannot choose an arbitrary
version, build new code, accept artifact URLs or run on push, pull requests or
release events. The default mode only verifies downloads. Publishing requires
an explicit manual input on the main branch, after verification succeeds.

Only the publishing job has OIDC permission. It uses the pypi environment and a
pinned official PyPA action. No long-lived token, password, saved recovery code
or account-wide credential is created or committed. The PyPI owner must approve
the separate trusted-publisher binding for project altss-public-client, owner
Altssdata, repository public-client, workflow publish-python.yml, environment
pypi. This is a new project-specific publishing delegation, distinct from the
owner's sign-in and 2FA setup. Do not submit that binding without owner approval.

Verify YAML structure, manual/main-only conditions, permissions, immutable
artifact URLs/digests and the actual download/verification script before merging.
Run the verification-only workflow first. After approved binding and a successful
publish, read PyPI's public metadata, compare both artifact hashes, install the
exact registry version in a clean environment and verify real anonymous reads.
GitHub release, trusted-publisher configuration, workflow success and actual PyPI
publication remain separate outcomes. Do not advertise PyPI installation until
the registry and installation checks pass. Private Product data, homepage UI,
JavaScript version, Go module and existing public contracts are unchanged.
