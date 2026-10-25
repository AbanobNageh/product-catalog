# 0016. Remote state in MinIO, with S3-native locking

- **Status:** Accepted (approved 2026-10-25, after the T5 close; decided in T4)
- **Date:** 2026-10-25

## Context
- After T3, each environment root (`terraform/envs/dev`, `terraform/envs/staging`) keeps its state in a local `terraform.tfstate` (about 35 KB, including the kind cluster's admin key). Nobody else can use it, a lost disk loses it, and nothing stops two runs at once.
- T4's plan: run MinIO in Docker, move each environment's state to the `s3` backend pointed at it, and lock with `use_lockfile = true`.
- Facts checked on 2026-10-25:
  - MinIO stopped publishing its community images in October 2025, went into maintenance mode in December 2025, and its repository is archived. `minio/minio` is gone from Docker Hub, and `quay.io/minio/minio` can't be pulled.
  - Chainguard publishes a free `cgr.dev/chainguard/minio` built from source (`RELEASE.2026-10-23T20-06-51Z`, rebuilt 2026-10-24) and `cgr.dev/chainguard/minio-client`. The free tier only offers `latest` and `latest-dev`.
  - The `s3` backend's `use_lockfile` writes `<key>.tflock` with a conditional write (`If-None-Match: *`). DynamoDB locking is deprecated. HashiCorp only tests the backend against AWS S3.
  - A rehearsal on a throwaway copy passed: `init -migrate-state` from local state, `plan` "No changes", a second run during an apply got `412 PreconditionFailed` and `Error acquiring the state lock`, the lock object was deleted afterwards, and the Terraform user was denied writes outside `product-catalog/` and bucket creation. No `skip_s3_checksum` was needed.

## Options
1. **Server:** Chainguard MinIO pinned by digest (chosen); Garage; SeaweedFS. Their images pull, but whether they honour conditional writes wasn't verified. A server that ignores `If-None-Match` would let two runs take the lock at once.
2. **How it runs:** its own Compose project in `terraform/state-backend/` (chosen); a service in the app's `docker-compose.yml`; a bootstrap Terraform root with the Docker provider; a documented `docker run`.
3. **Credentials:** a named profile in `%USERPROFILE%\.aws\credentials` for a MinIO user limited to the state keys (chosen); `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` in each shell; a git-ignored `backend.hcl` passed with `-backend-config` (HashiCorp warns those values get copied into `.terraform/` and plan files).
4. **Scope:** dev and staging (chosen); also `terraform/docker-basics`.

## Decision
- **Server:** `cgr.dev/chainguard/minio` and `cgr.dev/chainguard/minio-client:latest-dev` (it has a shell for the setup script), both pinned by `@sha256:` digest in `terraform/state-backend/compose.yaml`. The API is on `127.0.0.1:9000`, the web console on `127.0.0.1:9001`, and the data is in the named volume `catalog-state_minio-data`.
- **Its own Compose project, `catalog-state`:** `docker compose down -v` in the app can't delete the state, and Terraform doesn't manage the thing that stores Terraform's state (no chicken-and-egg).
- **The bucket, `terraform-state`,** is created by a one-shot `setup` service that is safe to re-run:
  - versioning is on;
  - a lifecycle rule deletes old versions after 90 days and removes leftover delete markers (each lock leaves one);
  - a policy (`terraform-state-policy.json`) allows `s3:ListBucket` on the bucket, and `Get`/`Put`/`DeleteObject` on `product-catalog/*` only;
  - a user (`TF_STATE_ACCESS_KEY`) gets that policy.
- **Keys:** `product-catalog/<env>/terraform.tfstate`, and the lock is `<key>.tflock`.
- **Secrets:** the root and Terraform passwords are in `terraform/state-backend/.env` (git-ignored; `.env.example` is committed). Terraform reads the `catalog-state` profile, so `backend.tf` holds only non-secret literals.
- `terraform/docker-basics` stays on local state (T0–T1 playground).

## Consequences
- MinIO must be running before any `plan` or `apply` in an environment. After a reboot, Docker Desktop restarts it (`restart: unless-stopped`).
- Chainguard's free images can only be pinned by digest, not by version. A new digest has to be copied in by hand to update. MinIO itself gets no more upstream releases; Chainguard's rebuilds are the source of fixes.
- The state is still on this machine (in a Docker volume), and it's unencrypted at rest: the admin keys are in it. That's acceptable locally. On AWS (T5), a real S3 bucket would add `encrypt = true` (or a KMS key), block public access and use IAM roles instead of a long-lived key.
- Losing the volume loses every environment's state, while the clusters keep running. Recovering means `terraform import` or rebuilding. Versioning protects against bad writes, not against `docker compose down -v`.
- A crashed run can leave the lock behind: `terraform force-unlock <lock ID>`, only after checking that no run is still going.
- The local `terraform.tfstate` becomes empty after the migration, but `terraform.tfstate.backup` keeps the old state, admin key included. Delete it once `plan` shows "No changes" against MinIO.
