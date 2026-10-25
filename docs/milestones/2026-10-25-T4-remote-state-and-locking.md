# T4 Remote state and locking
- Date: 2026-10-25 · Commits: c7aabcf

## What was built
Before writing anything, the AI explained the T4 concepts:
- why local state is a problem for a team
- backends, and why a backend block can't use variables (partial configuration)
- remote state, state locking with a conditional write (`If-None-Match: *`)
- `terraform init -migrate-state`, and bucket versioning

It also checked the plan's tool before using it. MinIO stopped publishing its images in 2025 and its repository is archived; `minio/minio` is gone from Docker Hub and `quay.io/minio/minio` can't be pulled. The user made four design choices (ADR-0016), then the AI wrote every file. The user ran the migration and the lock drill.

- **`terraform/state-backend/`**, its own Compose project `catalog-state`, separate from the app's `docker-compose.yml`:
  - `minio`: `cgr.dev/chainguard/minio` (MinIO `RELEASE.2026-10-23T20-06-51Z`, built from source by Chainguard), pinned by `@sha256:` digest because the free tier only offers `latest`. The S3 API is on `127.0.0.1:9000`, the console on `:9001`, and the data in the named volume `catalog-state_minio-data`.
  - `setup`: a one-shot `minio-client:latest-dev` job (the `-dev` variant has a shell), safe to re-run. It creates the bucket `terraform-state` and turns on versioning. It adds a lifecycle rule (old versions expire after 90 days, leftover delete markers are removed), but only if the bucket has none. It creates the policy `terraform-state` and the user `TF_STATE_ACCESS_KEY` with that policy.
  - `terraform-state-policy.json`: `s3:ListBucket` on the bucket, and `Get`/`Put`/`DeleteObject` on `product-catalog/*` only.
  - `.env.example`: the root and Terraform secrets. `.env` is git-ignored (checked with `git check-ignore`).
- **`terraform/envs/{dev,staging}/backend.tf`:**
  - `backend "s3"` with key `product-catalog/<env>/terraform.tfstate`, `use_lockfile = true` and `profile = "catalog-state"`.
  - The MinIO settings: `endpoints.s3`, `use_path_style`, and the four `skip_*` flags for the AWS-only calls.
  - The two files differ only in the key. The `versions.tf` headers now list `backend.tf`.
- **`AGENTS.md` Commands:**
  - a `terraform/state-backend` entry: writing `.env` with random secrets, start and check, the console, the `catalog-state` profile (written as ASCII), and "never `down -v`";
  - "MinIO must be running" before any command in an environment;
  - `backend.tf` added to the dev/staging diff loop;
  - `terraform state pull` for remote state.

  Each command was run first on scratch files.

Verified:
- **Before handing over:** a rehearsal on a throwaway copy, with project `t4-rehearsal`, a scratch root and a scratch credentials file, removed with `down -v` afterwards:
  - `setup` ran twice cleanly.
  - `init -migrate-state` from a local state, then `plan` → no changes. The local `terraform.tfstate` became 0 bytes, and the `.backup` kept the old state.
  - A second run during a 20-second apply got `412 PreconditionFailed` and `Error acquiring the state lock`, and the `.tflock` content matched the Lock Info.
  - The Terraform user was refused a write outside `product-catalog/` and bucket creation.
  - No `skip_s3_checksum` was needed.
  - Also checked: `fmt -check` and `validate` in both environments, `docker compose config` with and without `.env`, and the `.env`/profile commands on scratch files.
- **The rehearsal changed the design:** every lock and unlock left a version and a delete marker in the versioned bucket, so the lifecycle rule was added (and checked to be added only once).
- **Migration (the user):** `init -migrate-state` in dev, then staging. The AI checked afterwards:
  - `minio` running and `setup` `Exited (0)`;
  - both keys in the bucket (35 KiB each);
  - the local `terraform.tfstate` files at 0 bytes;
  - `plan` → "No changes" in both.
- **Lock drill (the user):**
  - Terminal 1: `apply "-replace=module.platform.terraform_data.gateway_api_crds"` left at its prompt. That replacement is harmless even if confirmed: it only re-applies the same CRDs. The AI had first tested `terraform console`, which doesn't hold the lock.
  - Terminal 2: `plan` failed on the lock; staging's `plan` worked (one lock per key); `plan -lock-timeout=2m` waited.
  - The bucket's version history shows the apply's lock from 10:08:08 to 10:10:15, and the waiting plan's lock 3 seconds later. The dev state is still version 1, so the apply wasn't confirmed. No lock remains, and `plan` → "No changes" in both.
- **Done-when:**
  - **State lives in MinIO:** passed (above).
  - **Explain locking:** explained by the AI in the close-out reply, with the drill as evidence. The explain-back was skipped (finish first, study later).

## Decisions (link ADRs)
- [ADR-0016](../adr/0016-remote-state-in-minio.md), all four as recommended:
  - **Chainguard's MinIO, pinned by digest**, over Garage or SeaweedFS (whether they support conditional writes wasn't verified).
  - **Its own Compose project** in `terraform/state-backend/`, not the app's Compose file, not a bootstrap Terraform root, and not a `docker run`.
  - **A named profile, `catalog-state`,** for a MinIO user limited to `product-catalog/*`. Not per-shell environment variables, and not a `-backend-config` file (whose values get copied into `.terraform/`).
  - **dev and staging only.** `terraform/docker-basics` stays on local state.

## Follow-ups
- **The user's call:** delete `terraform/envs/*/terraform.tfstate.backup`. They hold the pre-migration state, admin key included; MinIO now has the real copy.
- **Updating the backend images:** Chainguard's free images can only be pinned by digest. Updates mean copying the new digest by hand (`docker buildx imagetools inspect`). MinIO gets no upstream releases any more.
- **Losing the volume loses every environment's state** while the clusters keep running. Versioning doesn't cover `docker compose down -v`. Options if this matters: a periodic `mc mirror` to a folder, or simply rebuilding the environments.
- **T5:**
  - A real S3 state bucket needs `encrypt = true` (or a KMS key), Block Public Access, IAM roles instead of a long-lived key, and its own bootstrap: who creates the bucket, and where does that state live?
  - The `skip_*` flags and `endpoints` go away.
- **T2's provider caveat** can now be removed: a separate cluster root could publish its outputs to MinIO, and the workloads root could read them with `terraform_remote_state`. That's two applies per environment; not planned.
- **`AGENTS.md` session routine** (user-owned): the start-of-session smoke check could include `docker compose -f terraform/state-backend/compose.yaml ps` alongside the `--context` change proposed in T3.
- **Carried from T3:** preload OpenSearch with `kind_load`; `atomic = true` on the release.
- **Carried for T5:** the managed OpenSearch/RDS switches, re-sized requests, and restricting `POST /admin/reindex`.
- **App follow-ups (the user's call):** search-service crash-loops until OpenSearch is up; Redis in `/readyz`; no index self-heal.
