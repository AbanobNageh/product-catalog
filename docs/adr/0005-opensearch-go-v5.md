# 0005. search-service pins: opensearch-go v5, OpenSearch 3.9.0, Go 1.26

- **Status:** Accepted (approved at the 1.3 close)
- **Date:** 2026-10-22

## Context
When planning 1.3, the ecosystem no longer matched the spec:
- **opensearch-go v5 is the current major.** v5.0.0 shipped on 2026-09-22, and v5.1.1 on 2026-10-20. The repo's `main` branch is now `/v5`. v4 still gets releases (v4.8.1 on 2026-10-09) and is described as "the fallback for older OpenSearch lines". No end-of-support date is stated. The spec said "v4".
- **Compatibility:** v5 is CI-tested against OpenSearch 2.19 and all of 3.x. v4 is tested "through 3.6.x", so the current server (3.9) is best-effort on v4.
- **Breaking changes in v5:**
  - The API is generated from the OpenSearch OpenAPI spec.
  - Document calls move to `client.Doc.*`, and `DocumentID` becomes `ID`.
  - Params become pointers, and `VersionType` becomes an enum.
  - Partial bulk failures now return a `*PartialBulkError` by default. v4's default error mask hid them.
  - Node discovery and a request router are **on by default**.
- **v5 is young.** Four bugs were fixed in 5.0.x–5.1.1; one of them, in 5.0.0–5.0.2, broke aggregation request bodies. No v5 regression issues are open.
- **`opensearchproject/opensearch:latest` points at 2.19.7,** not 3.x. The current stable release is 3.9.0 (2026-09-29), and no 4.x exists.
- **Go 1.27.0 shipped on 2026-08-19.** The spec says Go 1.26, which is still supported (latest patch 1.26.10), and it is what's installed.

## Considered options
1. **v5.1.1, OpenSearch 3.9.0 pinned, Go 1.26.**
2. **The spec's v4 (4.8.1), OpenSearch 3.9.0, Go 1.26.**
3. **Newest everything:** v5, OpenSearch 3.9.0, Go 1.27.

## Decision
**Option 1.** v5 is the supported line for the server we run, and its default bulk error handling is what the bulk contract needs (report failed items, don't hide them). It is pinned exactly in `go.mod`. Client config:
- **Node discovery is switched off** (`DiscoverNodesOnStart: false`, `DiscoverNodesInterval: -1`). Discovery would return container-internal addresses the host can't reach, and in Kubernetes we want to go through the Service, not around it.
- **Built-in retries are switched off** (`DisableRetry: true`). v5 retries 5xx and network errors up to 6 times by default, which would hide failures, against the spec's "no retries".
- **The default request router stays on.** No config field disables it; only the process-wide `OPENSEARCH_GO_ROUTER=false` env var does. With discovery off, it only ever knows the seed URL, so it routes every request there. That makes it harmless. The OpenSearch image is pinned to `3.9.0` everywhere, never `latest`. Go stays on 1.26, as in the spec. `docs/plan/app.md` is updated from "v4" to "v5".

## Consequences
- Good: the client is tested against our server version. Partial bulk failures can't be silently swallowed by default.
- Bad: v5 is about a month old. Most blog posts and Stack Overflow answers show the v4 (or v2) API, so examples need translating (`client.Doc.Index`, `ID`, pointer params). The official `UPGRADING_V4_TO_V5.md` covers the mapping.
- Bad: the discovery and retry opt-outs have to stay explicit. A future config refactor that drops them breaks host-to-container access, or hides failures, in confusing ways, so a comment marks them.
- Bad: v5 errors often carry no typed status (HEAD calls, non-JSON 5xx bodies), so our code reads the status from the response it returns alongside the error.

## Revisit when
v4 gets an end-of-support date (no change needed), v5 ships a breaking minor, or Go 1.26 nears its end of support (when 1.28 ships).
