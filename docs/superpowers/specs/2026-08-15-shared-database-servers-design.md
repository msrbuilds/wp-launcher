# Shared Database Servers — Design

**Date:** 2026-08-15
**Status:** Approved, ready for planning

## Problem

Every MySQL/MariaDB site gets its own database container. Measured on a live
host with four idle sites, none being browsed:

| Container | Memory |
|---|---|
| `wp-site-*` (WordPress) | 96–106 MB |
| `wp-db-*` (database) | **495–508 MB** |

WordPress is not the problem. The four database sidecars account for roughly
2 GB of the 2.4 GB total, and the cost is **linear in site count** — twenty
sites would need 10 GB of database alone.

The sidecars are also completely untuned. `packages/provisioner/src/index.ts`
creates them with no `Cmd`, so MySQL 8.4 runs server defaults: `performance_schema`
enabled (200–400 MB by itself), a 128 MB buffer pool, and 151 max connections
each reserving buffers — for a demo site holding one small WordPress database.

Hosting panels fit hundreds of sites in 8 GB because they run **one** database
server shared by all of them. That is the difference being closed here.

## Goals

- Total database memory roughly **constant** rather than linear in site count.
- Blueprints keep choosing `mysql` or `mariadb` and keep getting that engine.
- An install that only uses SQLite pays nothing at all.
- Snapshots, restore, export, cloning, sync and Adminer keep working.

## Non-goals

- Changing the WordPress containers. At ~100 MB they are already reasonable.
- Migrating existing sidecar sites automatically. See Migration.
- Supporting an external, operator-supplied database server. The design does not
  preclude it — `WORDPRESS_DB_HOST` is already per-container — but nothing here
  builds it.

## Approach

Replace per-site database containers with one shared server **per engine**,
started only when a site needs it.

Running one shared MariaDB *and* one shared MySQL costs two baselines, but
running only the engines actually in use costs nothing extra. Collapsing both
blueprint values onto a single engine was rejected: blueprints promise a
specific engine and should keep that promise.

### Topology

Two containers, created and owned by the provisioner exactly as site containers
are — not compose services, so their lifecycle is ours to control without
involving the host platform:

| Container | Image | Volume |
|---|---|---|
| `wpl-db-mariadb` | `mariadb:11` | `wpl-db-mariadb-data` |
| `wpl-db-mysql` | `mysql:8.4` | `wpl-db-mysql-data` |

Both join `DOCKER_NETWORK` (the private `wpl-sites` network on Dokploy) and run
with tuning flags sized for many small databases rather than one large one:

```
--performance-schema=OFF
--innodb-buffer-pool-size=64M
--innodb-log-buffer-size=8M
--max-connections=100
--table-open-cache=128
--table-definition-cache=128
--tmp-table-size=8M
--max-heap-table-size=8M
```

`--performance-schema=OFF` is the single largest saving on MySQL 8.4.

### Lifecycle

`ensureEngineRunning(engine)` runs before any database is provisioned:

1. If the container does not exist, create it (pulling the image if needed) and
   start it.
2. If it exists but is stopped, start it.
3. Poll `mysqladmin ping` every second for up to **60 seconds**.

The first launch of a given engine therefore costs a cold start of roughly
5–15 seconds. Later launches see an already-running server and pay nothing.

If the engine does not answer within the timeout, the launch fails with
"database engine `<engine>` did not become ready" and no site container is
created. Half-creating a site whose database never arrives is worse than a
clean failure the operator can retry.

On site deletion, after the database is dropped, count the remaining site
containers using that engine. At zero, stop the engine container — it is
stopped, not removed, so its volume and tuning survive and a later start is
fast.

Counting uses the Docker API: site containers carry `wp-launcher.db-engine`,
a new label recording which engine they use.

### Provisioning a site

Replaces the sidecar block at `packages/provisioner/src/index.ts:194-240`:

```sql
CREATE DATABASE `<dbName>`;
CREATE USER '<dbUser>'@'%' IDENTIFIED BY '<password>';
GRANT ALL PRIVILEGES ON `<dbName>`.* TO '<dbUser>'@'%';
ALTER USER '<dbUser>'@'%' WITH MAX_USER_CONNECTIONS 10;
```

Executed by `docker exec` into the engine container using the root credentials
described below — the same mechanism snapshots already use to run `mysqldump`.

The site's environment then carries the shared host and its own database name,
where today both are constants:

| Variable | Was | Becomes |
|---|---|---|
| `WORDPRESS_DB_HOST` | `wp-db-<subdomain>` | `wpl-db-<engine>` |
| `WORDPRESS_DB_NAME` | `wordpress` | `<dbName>` |
| `WORDPRESS_DB_USER` | `wordpress` | `<dbUser>` |
| `WORDPRESS_DB_PASSWORD` | random | random (unchanged) |

### Identifiers

MySQL limits usernames to **32 characters** while subdomains may reach 63, so
the username cannot simply embed the subdomain.

- **Database:** `wp_` + the subdomain with `-` replaced by `_`, truncated to 60.
- **User:** `wp_` + the sanitised subdomain truncated to **20** + `_` + the
  first 4 hex characters of its SHA-1. Always ≤ 28 characters, readable in
  Adminer, and collision-safe for practical purposes.
- **Password:** `generateDbPassword()`, already used for sidecars.

### Root credentials

The provisioner needs root access to create and drop databases. It reads
`SHARED_DB_ROOT_PASSWORD` from its environment — the same pattern as
`PROVISIONER_INTERNAL_KEY` and `API_KEY`, generated by the operator with
`openssl rand -hex 32`.

The value is passed to the engine container as `MARIADB_ROOT_PASSWORD` /
`MYSQL_ROOT_PASSWORD` when it is first created. Changing it afterwards does not
change the running server's password; the guide must say so, because a mismatch
would break provisioning with a confusing authentication error.

### Deletion

Deletion must handle **both** kinds of site, because sidecar sites keep running
after the upgrade. The two are told apart by their labels, and the distinction
must be explicit rather than inferred from the engine name:

| Label present | Meaning | Teardown |
|---|---|---|
| `wp-launcher.db-container` | a sidecar site, created before this change | remove that container, as today |
| `wp-launcher.db-engine` | a shared-server site | drop its database and user |
| neither | SQLite | nothing |

`wp-launcher.db-container` is no longer emitted for new sites, and
`wp-launcher.db-engine` is new. Removing the old branch would strand every
pre-existing site's sidecar as an orphan, so it stays until those sites are
gone.

For a shared-server site:

1. `DROP DATABASE IF EXISTS <dbName>;`
2. `DROP USER IF EXISTS '<dbUser>'@'%';`
3. Stop the engine if no site containers using it remain.

Failure to drop must not block deletion. The site's own teardown is what the
user asked for; an orphaned database wastes disk but breaks nothing, and the
orphan watchdog can reclaim it later.

## What is unaffected

Snapshots (`index.ts:949`), restore (`index.ts:1068`), export-zip
(`index.ts:1672`), the `db-credentials` endpoint (`index.ts:520`), Adminer and
site sync all read `WORDPRESS_DB_HOST` and friends out of the container's
environment rather than assuming a sidecar name. Pointing those variables at the
shared host carries every one of them across unchanged. This is the main reason
the change is tractable.

## Isolation trade-off

Today a compromised WordPress site can reach only its own database server.
Afterwards it holds an account on a server that also stores other sites' data.

Grants are scoped to the site's own database and connections are capped per
user, which is what shared hosting has always done — but it is a genuine
reduction from the current arrangement, and it partly walks back the network
isolation work at the database layer. Accepted deliberately in exchange for the
memory saving.

## Migration

Existing sidecar sites keep working untouched, because `WORDPRESS_DB_HOST` is
baked into each container's environment and still names its own sidecar. They
convert when relaunched. There is no flag day and no downtime.

Operators wanting the memory back immediately must relaunch their MySQL and
MariaDB sites; the guide should say so without implying it is automatic.

## Expected result

For the measured four-site host:

| | Now | After |
|---|---|---|
| 4 sites | ~2.4 GB | ~550 MB |
| each further site | +~600 MB | +~100 MB |

## Testing

Unit, in CI:

- Identifier derivation: a 63-character subdomain yields a username ≤ 32
  characters; two subdomains sharing their first 20 characters yield different
  usernames; the database name is derived from the subdomain with hyphens
  replaced.
- Engine selection: `mysql` and `mariadb` map to their own host names;
  `sqlite` provisions no database and starts no engine.

Verification on a real host, since neither memory nor lifecycle can be
unit-tested:

1. Launch a MariaDB site on an install with no engine running. It works, and
   `wpl-db-mariadb` starts.
2. Launch a second MariaDB site. No second engine appears, and
   `docker stats` shows one engine plus two ~100 MB WordPress containers.
3. Snapshot and restore that site. Both succeed against the shared server.
4. Adminer at `db.BASE_DOMAIN` connects with the site's credentials and shows
   **only** that site's database.
5. Delete one site; its database and user are gone and the other still works.
6. Delete the last MariaDB site; `wpl-db-mariadb` stops.
7. A pre-existing sidecar site still loads throughout.

Items 4 and 5 are the ones that fail quietly — a grant that is too broad exposes
other sites' data, and a failed drop leaks a database per deleted site.

## Follow-up work

- **Orphan reclamation.** Databases whose site no longer exists should be
  swept, the way container orphans already are. Not built here; a failed drop
  currently leaks silently.
- **External database support.** Pointing `WORDPRESS_DB_HOST` at an
  operator-supplied server needs only configuration plumbing, and would let
  larger installs use managed database services.
