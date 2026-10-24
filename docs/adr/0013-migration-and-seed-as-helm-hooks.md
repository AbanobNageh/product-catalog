# 0013. Migration and seed Jobs as Helm hooks

- **Status:** Accepted (approved at the K7 close)
- **Date:** 2026-10-24

## Context
- Since K3, a release has been manual: build both images, load them, edit the tag in two files, delete the old migration Job (a Job's pod template is immutable), apply it, wait for it, then apply the Deployment (`AGENTS.md`). The seed Job works the same way.
- In K7 the chart deploys everything, including Postgres. The order still matters: migrations before the new code on an upgrade, and the seed after the migration, once catalog-api and OpenSearch answer (it reindexes through catalog-api).
- A **Helm hook** is a resource with a `helm.sh/hook` annotation. Helm doesn't apply it with the rest of the release. It creates it at a named point (`pre-install`, `post-install`, `pre-upgrade`, …), waits for a Job to complete, and fails the install or upgrade if it doesn't.

## Options
1. **Plain templates.** The Jobs are ordinary release objects. Helm applies them alongside the Deployment, so there's no ordering, and the next upgrade fails because the Job's template changed (immutable).
2. **Hooks.** Chosen.
   - Migration: `post-install,pre-upgrade`, weight 0.
   - Seed: `post-install`, weight 10, only when `catalogApi.seed.enabled` (dev).
   - Both use `hook-delete-policy: before-hook-creation`.
3. **An init container in catalog-api** that runs the migration. It's always in order, but every pod would migrate at start, against "never at app startup" (`AGENTS.md`), and it would need the migrate image inside the app pod (ADR-0009).

## Decision
- **Migration on `pre-upgrade`:** every `helm upgrade` migrates with the new image before the Deployment rolls out, which is K3's order without the manual steps.
- **Migration on `post-install`, not `pre-install`:** on the first install, Postgres is part of the same release, so a `pre-install` hook would run before Postgres exists. `post-install` runs after the objects are created. With `--wait`, it runs only once they are ready. catalog-api runs for a short while before its tables exist, but only on the very first install, before any traffic. Its `/readyz` uses `SELECT 1`, so it still becomes ready and `--wait` doesn't deadlock.
- **Seed on `post-install` only, weight 10:** after the migration. Upgrades don't reseed.
- **`before-hook-creation`:** Helm deletes the previous Job just before it creates the new one. This replaces the manual `kubectl delete job`, and the finished Job stays until then, so its logs can be read.
- **Install with `--wait`:** Helm 4 doesn't wait for readiness by default (`hookOnly`). Without `--wait`, the post-install hooks start before OpenSearch and catalog-api are up, and the seed's reindex fails.

## Consequences
- A release is now: build and load the images, then `helm upgrade ... --set catalogApi.image.tag=<v>`. The tag lives in one place.
- Hook resources aren't part of the release's manifest. `helm uninstall` doesn't delete the finished Jobs; delete them with `kubectl delete job -l app.kubernetes.io/instance=product-catalog`.
- **`helm rollback` restores manifests, not the database.** It runs `pre-rollback` hooks, not `pre-upgrade`, so no migration runs, and none is undone. Migrations must stay backward-compatible (expand/contract) so that the previous version still works on the new schema.
- A failed migration fails the upgrade before any pod changes, so the old version keeps serving.
- Production would also consider a GitOps tool such as Argo CD (sync waves instead of hooks) and a migration lock timeout. Both are out of scope here.
