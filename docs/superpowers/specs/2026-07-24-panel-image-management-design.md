# Panel Docker Image Management — Design

**Goal:** Let admins build and manage WordPress Docker images from the panel — base
PHP variants and custom images with plugins/themes baked in — replacing the manual
`scripts/build-wp-image.sh` + setup flow, and let blueprints select a built image.

**Tech Stack:** Node/Express + Dockerode (provisioner), better-sqlite3 (API), React +
Tailwind/shadcn (dashboard). No new services or dependencies.

---

## Background: what exists today

- **Provisioner** already has Dockerode `buildImage`, `pull`, `listImages`, and a
  `POST /images/build` endpoint (takes a filesystem `contextPath` + `tag`, prefix-checked
  against `wp-launcher/`). The docker-socket-proxy already permits `BUILD/IMAGES/POST`.
- **API** has a dormant `buildImage(contextPath, tag)` helper (`docker.service.ts`) used
  internally by save-as-template; no route or UI surfaces image building.
- **Base + product images** are built by `scripts/build-wp-image.sh` (base PHP variants
  `wp-launcher/wordpress:phpX`, and product images `FROM` a base with plugins/themes),
  run at install time (`install.sh`) or manually.
- **Blueprints** reference an image via a free-text `docker.image` field; container
  creation validates the image starts with `wp-launcher/` (`ALLOWED_IMAGE_PREFIX`).

There is no way to see, build, or manage images from the panel.

## Decisions (from brainstorming)

- Scope: a **guided WP image builder**, not a general Docker manager. Stays inside the
  `wp-launcher/` namespace.
- Build source: a **standalone build form** (base PHP/WP + plugins/themes), independent of
  blueprints.
- Build UX: **background job with a live streaming log**, survives navigation.
- **Base images are built in-panel** too; a custom build auto-builds its base if missing.
- The blueprint `docker.image` field becomes a **dropdown** of built images.
- **Admins + owner** may build (existing `adminAuth`).

---

## Architecture & data flow

### Build-as-tar-stream (no shared volumes)

The provisioner does **not** share the API's `data/` or `wordpress/` directories (it only
mounts `product-assets` and `data/snapshots`). Rather than add shared mounts, the **API
assembles each build context as a tar in memory/temp and streams it to the provisioner**;
Dockerode's `buildImage(tarStream, opts)` accepts a tar directly. This keeps the provisioner
stateless about build contexts and requires **no docker-compose changes**.

### Two build kinds

- **base** (`wp-launcher/wordpress:phpX`): the API tars its read-only `/app/wordpress`
  context and sends it with build-args (`PHP_VERSION`, `WP_VERSION`). The PHP→WP pairing
  (`7.4 → WP 6.1`, else default WP) is ported from `build-wp-image.sh`.
- **custom** (`FROM wp-launcher/wordpress:phpX` + baked plugins/themes): the API generates
  a Dockerfile (porting the script's plugin/theme steps to TypeScript), includes uploaded
  `.zip` files in the tar, and lets `RUN curl` fetch wordpress.org slugs and URLs during the
  build. If the chosen base image is missing, the **same job** builds the base first (its
  output logged under a "Building base image…" header) and then the custom image — one job,
  one log, one final status.

### Async job + polling

Reuses the existing "trigger then poll" pattern (SystemTab update log):

1. Panel `POST`s a build spec → API inserts an `image_builds` row (`queued`), returns a
   `jobId`, and starts the build in the background (fire-and-forget task; not tied to the
   request lifetime).
2. Background task: API builds the tar, calls the provisioner build endpoint, which runs
   `docker build` and **streams build output back** over the HTTP response. The API decodes
   the stream, appends lines to `image_builds.log`, and flips status `building → success`
   or `failed` (parsing the stream's `error`/`errorDetail`).
3. Panel polls `GET …/builds/:id` (status + log tail) — same loop SystemTab uses.

Concurrency: **one build at a time**. A new build while another is `building` is queued
(runs when the current finishes) or rejected with a clear message — see Open question O1.

---

## Data model

New SQLite table `image_builds`:

| column         | type | notes                                            |
|----------------|------|--------------------------------------------------|
| id             | TEXT | uuid, PK                                          |
| tag            | TEXT | e.g. `wp-launcher/my-shop:latest`                |
| kind           | TEXT | `base` \| `custom`                               |
| status         | TEXT | `queued` \| `building` \| `success` \| `failed`  |
| log            | TEXT | appended build output (plain text)               |
| error          | TEXT | short failure message, null on success           |
| spec           | TEXT | JSON of the submitted build spec (for re-runs)   |
| created_by     | TEXT | user id                                           |
| started_at     | TEXT | UTC, set when status → building                  |
| completed_at   | TEXT | UTC, set when status → success/failed            |
| created_at     | TEXT | UTC default                                      |

Built images themselves are **not** a table — they live in Docker; the images list comes
from the provisioner's `listImages` filtered to the `wp-launcher/` prefix.

---

## API (`/api/admin/images`, adminAuth)

- `GET /` — built `wp-launcher/*` images: `{ tag, id, size, created, usedByBlueprints[] }[]`.
  `usedByBlueprints` cross-references blueprint `docker.image` values so the UI can warn
  before deletes and show usage.
- `POST /builds` — start a build. `multipart/form-data`: a `spec` JSON part plus optional
  `plugin_files` / `theme_files` zips (mirrors the blueprint upload contract). Validates and
  sanitizes, inserts the row, returns `{ jobId, tag }`.
  - `spec`: `{ kind, name, tag?, phpVersion, wpVersion?, plugins: Source[], themes: Source[] }`
  - `Source`: `{ source: 'wordpress.org'|'url'|'local', slug?|url?|filename?, }` (same shape
    blueprints already use).
- `GET /builds?limit=` — recent build jobs (id, tag, kind, status, timestamps).
- `GET /builds/:id` — one job with `status`, `log`, `error` (the poll endpoint).
- `DELETE /:tag` — remove an image via the provisioner. Refuses (409) if a blueprint
  references it or a running site uses it, unless `?force=true`.

Rate limiting: the admin limiter already covers `/api/admin/*`; builds are additionally
serialized by the one-at-a-time queue.

## Provisioner changes

- Add `POST /images/build-stream`: body is `application/x-tar`, with `tag` and optional
  `buildargs` from query/headers; validates the tag prefix; calls
  `docker.buildImage(req, { t, buildargs })` and **pipes the build output stream to the
  response** (chunked). The existing `POST /images/build` (contextPath mode) is left
  untouched so the internal save-as-template caller keeps working — no change to
  `blueprint-export.service.ts`.
- `POST /images/remove` — `{ tag }` → `docker.getImage(tag).remove()`, prefix-validated.

## Dashboard

New **Images** page in the Settings nav group (admin/owner only), three sections:

- **Base Images** — the PHP variants (8.3/8.2/8.1/7.4). Each row: built? + size + a
  Build/Rebuild button. Rebuild starts a `base` build job.
- **Custom Images** — built `wp-launcher/*` custom images (tag, size, used-by count) with
  Delete (branded confirm; warns on in-use). A **Build image** button opens the build form.
- **Builds** — recent jobs with status badges; clicking one shows the streaming log
  (polled) in a panel, using the branded toast for start/failure summaries.

**Build form** (dialog): Name (→ sanitized to `wp-launcher/<slug>:latest`), base PHP
version (dropdown), optional WP version, and **Plugins/Themes repeaters reused from the
blueprint editor** (`PluginRepeater`/`ThemeRepeater`, source = wordpress.org slug / URL /
upload). Submits multipart to `POST /builds`.

**Blueprint editor:** the `docker.image` text input becomes a `Select` populated from
`GET /api/admin/images`, with a "Default (`wp-launcher/wordpress:latest`)" option that maps
to an empty `docker.image` (unchanged launch behaviour). Free-typed legacy values are shown
as-is if not in the list.

**Nav:** add `{ to: '/images', label: 'Images', icon: Boxes }` (lucide) to the Settings
group, gated to privileged roles (same as the other settings items).

---

## Security & guardrails

- `adminAuth` on every endpoint (admins + owner).
- Tag/name: sanitized to `wp-launcher/<slug>:<tag>` where `<slug>` is `[a-z0-9-]+` (same
  rule blueprint ids use), `<tag>` defaults to `latest`; reject `..`; enforce the prefix in
  both API and provisioner.
- **Guided only — no raw Dockerfile input.** The Dockerfile is generated server-side from
  the validated spec, so there is no arbitrary `RUN`. The only remote fetches are
  `wordpress.org` plugin/theme downloads and admin-supplied URLs, executed daemon-side
  during the build — admin-gated and equivalent in trust to the existing script.
- Uploads: `.zip` only, existing per-file size cap; filenames sanitized (`path.basename` +
  charset filter), as blueprint uploads already do.
- One build at a time; a build's temp tar/context is cleaned up on completion.
- Delete protection: an image referenced by a blueprint or a running site can't be removed
  without `?force=true`.

## Testing

- **Unit — Dockerfile generation:** table-driven tests that a build spec (plugins/themes by
  each source type, PHP/WP pairing, demo content) produces the expected Dockerfile lines.
  This is the porting-risk hotspot from the shell script.
- **Unit — validation:** tag/name sanitization and prefix enforcement; upload filename
  sanitization.
- **Unit — job state machine:** `image_builds` transitions and log-append via the test DB
  helper (`__setDbForTesting`).
- **Integration (light):** the build-job flow against a **mocked provisioner stream** —
  a success stream and an `errorDetail` stream — asserting final status and that the log
  captured output.
- **Manual/browser:** build a base image, build a custom image (watch the live log), select
  it in a blueprint's dropdown, launch a site on it, then delete an unused image.

## Out of scope (YAGNI)

Pulling or pushing external registries; raw Dockerfile editing; multi-arch builds; image
version history beyond Docker tags; scheduling/cron builds.

## Open questions

- **O1 — queue vs reject on concurrent build:** default is a single serialized queue (a
  second build waits). Simpler alternative: reject with "a build is already running." Queue
  is chosen unless the plan finds it materially harder.
- **O2 — base rebuild + running sites:** rebuilding a base image doesn't affect already-
  running containers (they keep their image layers); new sites use the new base. No special
  handling needed, noted so it isn't a surprise.
