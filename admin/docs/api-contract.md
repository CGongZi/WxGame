# Admin API Contract

Implemented by `admin/server/mock-server.mjs` (K8–K12 mock).  
`GET /api/pack/latest` serves the **published** pack (not live draft). Uploads at `/media/:id`.

Base URL (dev): `http://localhost:8787`  
Public pack: set `ConfigRemote.PACK_URL` to `http://127.0.0.1:8787/api/pack/latest` for local preview.

Default login: `admin` / `wxgame-dev` (`CMS_USER` / `CMS_PASS`).

## Auth (K8)

### `POST /api/auth/login`

```json
{ "username": "admin", "password": "wxgame-dev" }
```

→ `{ "token": "…", "user": "admin" }` — send as `Authorization: Bearer <token>` on mutating / draft routes.

## Entities (K9)

### `GET /api/entities`

Auth required. → `{ "kinds": [ … ] }`

### `GET /api/entities/:kind`

Auth required.  
`kind` ∈ `characters|weapons|enemies|mapThemes|biomeSpawn|encounters|themeEncounters|floors|items|talents|shop|economy|dungeon`

→ `{ "draft": … }`

### `PATCH /api/entities/:kind`

Auth required. Body = full draft for that kind, or `{ "draft": … }`.  
Updates `publishedAt` on the pack.

## Pack

### `GET /api/pack/draft`

Auth required. Full draft pack JSON.

### `POST /api/pack/validate`

Auth required. Body optional (`{}` validates current draft, or `{ "pack": … }`).  
→ `{ "ok": true }` or `{ "ok": false, "error": "…" }` (structure smoke via `validate-pack.mjs`).

### `POST /api/pack/bump`

Auth required. Increments `version`, refreshes `publishedAt`.

### `POST /api/pack/reset`

Auth required. Replaces draft with `fixtures/seed-draft.json`.

### `POST /api/pack/publish`

Auth required. Validates current draft → writes immutable `data/published/pack-v{N}.json` → updates `latest.json` pointer → syncs draft version.

→ `{ "ok": true, "version": N, "url": "…/api/pack/latest", "artifactUrl": "…/api/pack/versions/N" }`

### `GET /api/pack/versions`

Auth required. → `{ "latest": {…}, "versions": [ { version, file } ] }`

### `GET /api/pack/versions/:n`

**Public**. Immutable published artifact.

### `GET /api/pack/latest`

**Public**. Returns **published** pack only (not live draft). 404 until first publish (server auto-seeds once on boot if empty).

## Rollback & audit (K12)

### `POST /api/pack/rollback`

Auth required. Body: `{ "version": N }` where `pack-vN.json` already exists.  
Repoints `latest.json` (does not rewrite immutable artifacts) and syncs draft to that pack.

### `GET /api/audit?limit=50`

Auth required. → `{ "entries": [ { at, actor, action, detail } ] }` (newest first).

## Not in this mock (later)

| Path | Phase |
|------|-------|
| Real object-storage / CDN | replace local `data/uploads` + `data/published` |
| Production auth / WeChat open platform | K8 upgrade |

## Assets (K10)

### `GET /api/assets`

Auth required. → `{ "assets": [ { id, filename, url, bytes, contentType, at } ] }`

### `POST /api/assets`

Auth required.

- **multipart**: fields `file` (required), `id` (optional)
- **JSON fallback**: `{ "id"?, "filename", "contentType"?, "dataBase64" }`

Allowed: png/jpg/webp/gif/mp3/wav/ogg/json · max **2MB**.  
Rejects other extensions (e.g. `.exe`) even if `Content-Type` is spoofed.  
→ `{ "asset": { id, url, … } }` where `url` is `/media/:id` (local mock CDN).

### `GET /media/:id`

**Public** (no auth). Serves the uploaded bytes.

**Pack rule**: ConfigPack / draft entities store **URLs (or asset ids) only** — never embed binary file bytes in the pack JSON. Upload returns a `url`; reference that string from entity fields when needed.

## Client notes

- Empty `ConfigRemote.PACK_URL` → no network (default for review builds). Leave empty through K12; set only for deliberate K13/K14 local preview.
- Fetch / validate failure → keep builtin; never hard-fail boot after builtin loaded.
