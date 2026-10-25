# T1 Language basics and drift
- Date: 2026-10-25 · Commits: cbff8e5

## What was built
The AI explained the T1 concepts first: variables (types, validation, where values come from), `.tfvars`, locals, outputs, `count` vs `for_each`, `fmt`/`validate`, drift and import. It also explained the new HCL syntax before the first command: `map(object)` with `optional()`, for expressions, `each.key`/`each.value`, instance addresses, and the built-in functions. The user made three design choices and ran every command that changed containers or state.

- **`terraform/docker-basics/`**, extended from T0:
  - `variables.tf`:
    - `redis_image` (default `redis:8-alpine`, must start with `redis:`) and `name_prefix` (default `tf-redis`, lowercase pattern).
    - `containers`: a required `map(object({ port, maxmemory, maxmemory_policy = optional(string, "allkeys-lru") }))` with four validations: port range, unique ports, `maxmemory` format, and a real Redis eviction policy.
  - `locals.tf`: `bind_ip` and `container_names`, a for expression giving `cache` → `tf-redis-cache`.
  - `main.tf`: one shared `docker_image`, and `docker_container.redis` with `for_each = var.containers`. The command takes `--maxmemory`/`--maxmemory-policy` from each entry. `restart = "no"` is spelled out for the drift exercise.
  - `outputs.tf`: `containers`, with each container's name, address and a `docker exec … redis-cli ping` command.
  - `terraform.tfvars.example`: `cache` (64mb, allkeys-lru), `sessions` (32mb, volatile-lru) and `queue` (32mb, noeviction) on 6380–6382. The user's copy, `terraform.tfvars`, is git-ignored.
  - `imports.tf`: `docker_container.legacy` for `tf-redis-legacy` on 6383, which the user started by hand with `docker run`. A comment records the `import` block that brought it in.
- **`AGENTS.md` Commands:** the tfvars copy step, the four containers, a drift line (`plan -refresh-only`), PowerShell 5.1 quoting, and `state show` with a `for_each` address.

Verified:
- **Before handing over:**
  - `fmt -check` and `validate` passed, and `plan` with the example values showed `4 to add`.
  - A bad tfvars file produced three of the validation errors, for example "Each container needs its own port."
  - Two PowerShell 5.1 traps were found by running the commands: an unquoted `-var-file=x.tfvars` gives "Too many command line arguments", and plain inner quotes in `'docker_container.redis["cache"]'` reach Terraform as `redis[cache]`.
- **Step 1, apply:**
  - `4 added`. The image was created first, then the three containers in parallel.
  - `docker ps` showed all three `(healthy)` on 6380–6382, and `CONFIG GET maxmemory-policy` on `tf-redis-queue` returned `noeviction`.
  - `state list` showed the data source and the three `redis["…"]` instances. `state show` showed computed attributes such as `entrypoint` and `working_dir`.
- **Step 2, drift:**
  - The user ran `docker update --restart unless-stopped tf-redis-cache` and `docker rm -f tf-redis-queue`.
  - `plan -refresh-only` reported "Objects have changed outside of Terraform": cache's `restart "no" -> "unless-stopped"` and queue "has been deleted". It also showed provider noise (`+ dns = []` and the like, null vs empty) on `sessions`, which nobody had touched.
  - Plain `plan` showed `1 to add, 1 to change` (`~ restart` in place, `+` queue). `apply` reverted both, and a new queue container came up.
- **Step 3, configuration changes:**
  - Changing cache's `maxmemory` to `128mb` gave `-/+` with `# forces replacement` on `command`. It ran destroy-then-create, and `CONFIG GET maxmemory` returned `134217728`.
  - Commenting out `sessions` gave `1 to destroy` for that instance only, with the reason "(because key ["sessions"] is not in for_each map)". This was a plan only; the entry was restored.
- **Step 4, import:**
  - The AI read the hand-made container with `docker inspect` and wrote the import block and resource.
  - The first plan replaced the container, with `# forces replacement` on `image`, `env` and `ports`. The provider's source showed why: on import it records the image name, it never reads `env`, and it only reads `ports` when the state already has them.
  - With `image` by name, `env = []` and `lifecycle { ignore_changes = [ports] }`, the plan showed `1 to import, 0 to add, 1 to change, 0 to destroy`. The change only set Terraform-only settings such as `must_run` and `wait`.
  - The user's apply: `1 imported, 0 added, 1 changed, 0 destroyed`. `docker ps` showed the same container ID `9fa998b77024`, created 9 minutes earlier. A final `plan` said "No changes".
  - The import block was then removed. Afterwards, `validate` passed and `plan` still said "No changes".
- **Done-when** (explain drift and import, and when to use `count` vs `for_each`): the AI explained all three, and the user saw each one on real containers. The user's own explain-back was **skipped**, as in K6–T0 (finish first, study later).

## Decisions (link ADRs)
No ADRs; these are playground choices the user made:
- **Three Redis instances in one `for_each` map,** not three different apps. This keeps the focus on `for_each`, variables and drift with one image.
- **An `import` block, not the `terraform import` CLI.** The block shows the import in `plan` before anything changes, and it's the current approach (Terraform 1.5+).
- **`terraform.tfvars.example` committed and copied locally,** matching the repo's `.gitignore` (`*.tfvars`, except `*.tfvars.example`) and catalog-api's `.env.example`.
- **The imported container is a separate resource, not a fifth map key.** The map's health check and custom command would force a replacement, which would defeat the import.
- **The import block was removed after the apply.** Kept, it would make `plan` fail after any `destroy` or on a fresh clone, because the container ID would no longer exist.

## Follow-ups
- **`ignore_changes = [ports]` on `docker_container.legacy` is permanent.** The provider will never read its ports back, so changing the port means `terraform apply "-replace=docker_container.legacy"`.
- **The data source still calls Docker Hub on every `plan`** (from the T0 follow-ups). It was left as is; T2 moves on to new folders.
- **The containers are still running** (4 containers, state in `terraform/docker-basics/`). `terraform destroy` removes all four, including `tf-redis-legacy`, which Terraform now owns.
- **T2** starts `terraform/local/`: kind, Kubernetes and Helm providers, with configuration that depends on another resource and `depends_on`. It also decides whether Terraform installs the platform releases and this chart.
- **Carried from K7:** T3 environments as values files; T5 managed OpenSearch/RDS switches, re-sized requests, and restricting `POST /admin/reindex`.
