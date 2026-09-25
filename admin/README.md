# WxGame CMS Admin

Independent content console for the pixel dungeon.  
**K7** locked the contract; **K8–K12** add a local mock server + editor + asset upload + publish + audit/rollback (not production auth/CDN).

## Relation to the game

| Piece | Path |
|-------|------|
| Field SSOT | `game/WxGame/assets/scripts/core/ConfigSchema.ts` |
| Runtime gate | `ConfigStore.validatePack` / `tryApply` |
| Offline default | `BuiltinPack.ts` |
| Optional client fetch | `ConfigRemote.ts` (`PACK_URL` empty = skip) |
| Written contract | `.trellis/spec/frontend/cms-contract.md` |

Admin must export JSON that passes the same shape as `ConfigPack`. Do not maintain a parallel “CMS schema”.

## Quick start (K8–K12 mock)

```bash
cd admin
npm run validate:seed          # structure smoke on seed pack
npm start                      # http://127.0.0.1:8787
```

- Open the URL → login **`admin` / `wxgame-dev`**
- Edit a kind (e.g. `weapons`) → **保存 PATCH** → **校验整包** → **发布 publish**
- Upload assets (K10) → list returns `/media/:id` urls; **packs store urls/ids only**, not binary
- Public pack: `GET /api/pack/latest` serves **published** JSON only (draft PATCH does not change it until publish)
- Optional later preview: point `ConfigRemote.PACK_URL` at local latest; leave empty for review builds

Env overrides: `PORT`, `CMS_USER`, `CMS_PASS`.

Draft persists to `admin/data/draft.json` (gitignored); first boot copies `fixtures/seed-draft.json`.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm start` | Mock API + static editor |
| `npm run validate -- <file>` | Structure smoke |
| `npm run validate:seed` | Validate seed fixture |
| `npm run export:builtin` | `BuiltinPack.ts` → `fixtures/builtin-pack.json` (version+1) |
| `npm run smoke:k14` | Full-pack draft → sword.damage=35 → publish → assert latest (needs mock up) |

Publish gate uses the same structure smoke as `validate-pack.mjs` (includes B1 `floors[]` themeId / duplicate / mul checks). Full numeric/reference parity remains in client `ConfigStore.validatePack` (stricter publish parity can deepen later).

**K14 path (local mock, not production CDN):** `export:builtin` / `smoke:k14` proves CMS publish; point the client with `ConfigRemote.configure({ url: 'http://127.0.0.1:8787/api/pack/latest', lockRemote: false })` then cold-boot. Ship defaults stay `PACK_URL === ''` / `LOCK_REMOTE === false`. In-combat damage hand-test is separate from the smoke.

## Layout

```
admin/
  README.md
  package.json
  docs/api-contract.md
  public/index.html          # login + JSON editor + upload + publish
  server/mock-server.mjs     # K8–K12 mock API
  server/store.mjs           # draft.json
  server/publish.mjs         # immutable pack-v{N} + latest pointer
  server/assets.mjs          # local upload store (≤2MB allowlist)
  server/multipart.mjs
  scripts/validate-pack.mjs
  fixtures/seed-draft.json   # positive structure smoke
  fixtures/invalid-minimal.json
  data/                      # draft + uploads + published/ (gitignored)
```

## Status vs Phase K

| Item | Status |
|------|--------|
| K7 contract + validate smoke | ✅ |
| K8 login (Bearer token mock) | ✅ mock |
| K9 entity GET/PATCH + UI | ✅ mock (all kinds) |
| K10 asset upload | ✅ mock (`/api/assets` → `/media/:id`) |
| K11 publish pipeline | ✅ mock (`publish` → `data/published` → `/api/pack/latest`) |
| K12 audit / rollback | ✅ mock (`/api/audit`, `/api/pack/rollback`) |
| K13 client CDN URL | ✅ `PACK_URL` + version skip + `LOCK_REMOTE` |
| K14 e2e weapon damage | ✅ CMS `smoke:k14` + client configure path（真机局内手测） |

## Fail-soft rule

Clients always load builtin first. Remote failure must not block lobby. See cms-contract.md.
