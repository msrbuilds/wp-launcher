# Blueprint Editing — Design

**Goal:** Let an admin open an existing blueprint in the editor, change it, and
save — instead of recreating it from scratch.

**Tech Stack:** React + Tailwind/shadcn (dashboard), Express (API). No new
dependencies, no schema change.

---

## Background

The blueprint editor is create-only. The dashboard has `/blueprints` (list) and
`/blueprints/new` (create); the list page's single button goes to "new". Changing
anything about a blueprint — a plugin, an expiry, the Docker image, the
restriction toggles — means building a new one and losing the old.

### The backend already supports it

- `saveBlueprint()` is an upsert: `INSERT … ON CONFLICT(id) DO UPDATE`.
- `POST /api/blueprints` does not reject an existing id; it sanitizes the id and
  saves. Posting an existing id therefore already updates that blueprint.
- `GET /api/blueprints/:id?full=true` returns the unsanitized blueprint —
  including `docker` and `plugins`, which the editor needs to repopulate.

So this is almost entirely a frontend feature.

### A security bug in the way

`blueprintGuard` waves through **every** GET:

```ts
const blueprintGuard = (req, res, next) => {
  if (req.method === 'GET') return next();
  return adminAuth(req, res, next);
};
```

`sanitizeBlueprint` exists specifically to strip `docker`, `plugins` and
`demo.admin_email` from public responses, and `?full=true` bypasses it with no
authentication. Any anonymous caller can read a blueprint's admin email, plugin
list and Docker image. The edit form is the only legitimate consumer of
`?full=true`, so fixing this is part of the work rather than adjacent to it.

## Decisions

- **The ID is read-only when editing.** Changing it would upsert a *new*
  blueprint, silently orphan the original, and strand its
  `product-assets/<id>/` directory. Renaming is a separate feature.
- **Assets are preserved by round-tripping**, not by re-upload.
- Editing does not touch running sites.

---

## Components

### 1. Guard the full payload (API)

`blueprintGuard` keeps plain GETs public — the launch page and demo portal read
sanitized blueprints anonymously — but routes `?full=true` through `adminAuth`:

```ts
const blueprintGuard = (req, res, next) => {
  // The `full` payload carries docker config, plugin lists and the demo admin
  // email, all of which sanitizeBlueprint removes for anonymous callers.
  const wantsFull = req.method === 'GET' && req.query.full === 'true';
  if (req.method === 'GET' && !wantsFull) return next();
  return adminAuth(req, res, next);
};
```

### 2. Edit route and entry point (dashboard)

- `main.tsx`: `<Route path="blueprints/:id/edit" element={<BlueprintEditorPage />} />`
  inside the existing `RequireAdmin` group.
- `BlueprintsTab`: an **Edit** button per row, navigating to that path.

### 3. Editor in edit mode

`BlueprintEditorPage` reads `useParams().id`. When present it is editing:

- On mount, `GET /api/blueprints/:id?full=true` with admin headers, and populate
  every field: basics, WordPress version and locale, database, Docker image,
  plugins, themes, demo settings, restrictions, branding.
- The ID input renders **disabled**, with helper text saying the identifier
  cannot change.
- Heading becomes "Edit Blueprint"; submit becomes "Save Changes".
- Submit posts to the same endpoint. No new API surface.
- A load failure shows the existing error alert rather than a blank form, so a
  deleted or mistyped id is legible instead of silently presenting an empty
  editor that would create a blueprint on save.

### 4. Preserving assets on save

Assets arrive as file uploads, and on edit there are no `File` objects unless the
user re-attaches. The POST handler sets `branding.image_url` / `logo_url` **only
when a file is uploaded**, and the create form never sends those keys — so a
naive edit-and-save would blank the card image and icon.

The editor therefore keeps the loaded `image_url` and `logo_url` in state and
includes them in the submitted config. Uploading a new file overwrites them; not
uploading preserves them. The same applies to `plugins.preinstall[].path` and
`themes.install[].path` entries for previously uploaded zips: the files remain in
`product-assets/<id>/`, so preserving the path keeps them attached.

The editor also shows the existing filename for a local plugin or theme, so it is
clear the asset is still attached and re-uploading is optional.

## Error handling

- **Blueprint not found on load** — the error alert reads "Blueprint not found",
  and the submit button stays disabled, so a failed load cannot become an
  accidental create.
- **Anonymous `?full=true`** — 401 from `adminAuth`, the same as any other
  privileged blueprint call.
- **Save failure** — the existing alert path is unchanged.
- **Concurrent edits** — last write wins, as with every other setting in the
  panel. Blueprint editing is an admin-only, low-frequency action; optimistic
  locking would be machinery without a demonstrated problem.

## Testing

- **Unit, guard decision:** plain GET is public; `GET ?full=true` requires auth;
  `POST`/`PUT`/`DELETE` require auth. This is the security fix, so it gets an
  explicit test rather than manual confirmation.
- **Live:**
  1. Edit a blueprint's Docker Image to a specific built tag, save, reload the
     form, and confirm it persisted.
  2. Save an edit **without** touching the card image, and confirm the image
     survives — the data-loss case this design exists to prevent.
  3. Launch a site from the edited blueprint and confirm it uses the new image.
  4. Confirm the ID field is disabled while editing.

## Out of scope (YAGNI)

Renaming a blueprint (moving its assets directory and rewriting references);
duplicating a blueprint; versioning or an edit history; optimistic locking;
retroactively applying a blueprint change to running sites.
