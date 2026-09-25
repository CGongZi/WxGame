# CMS ↔ Client Config Contract

> Single source of truth for content packs. Admin and game must not invent divergent field sets.

## Authority

| Layer | Owns | Forbidden |
|-------|------|-----------|
| `ConfigSchema.ts` | TypeScript shapes (`ConfigPack`, entities) | `cc.Color`, functions, runtime nodes in pack JSON |
| `ConfigStore.validatePack` / `tryApply` | Runtime acceptance gate | Silent partial apply; applying without validate |
| `BuiltinPack.ts` | Offline default pack (提审必带) | Shipping without a valid builtin |
| `admin/` | Draft CRUD → validate → publish | Separate “admin-only” schema that the client cannot read |
| This doc | Pipeline + API sketch + fail-soft rules | Diverging from `ConfigSchema` without a client bump |

**SSOT for fields**: `game/WxGame/assets/scripts/core/ConfigSchema.ts`.  
If admin UI labels differ, map them 1:1 to schema keys; do not rename in the published JSON.

## Pack envelope

```ts
interface ConfigPack {
  version: number;       // monotonic; client may skip older remote
  publishedAt: string;   // ISO-ish string, required by validatePack
  characters: ConfigCharacter[];
  weapons: ConfigWeapon[];
  enemies: ConfigEnemy[];
  mapThemes: ConfigTheme[];
  biomeSpawn: Record<string, ConfigBiomeEntry[]>;
  encounters: ConfigEncounter[];
  themeEncounters: Record<string, ConfigThemeEncounter[]>;
  floors: ConfigFloor[];    // 逐层覆盖（可空）
  dungeon: ConfigDungeon;
  items: ConfigItem[];
  talents: ConfigTalent[];
  drops: ConfigDropTable[]; // trash / boss 击杀掉落（可空 → 运行时经济 fallback）
  shop: ConfigShopOffer[];
  economy: ConfigEconomy;
}
```

Hard rules enforced by `validatePack` (non-exhaustive):

- At least one character with `cost === 0`
- Every `exclusiveWeaponId` / weapon shop offer exists in `weapons`
- `weapons` must include `sword`
- Every `biomeSpawn` / `themeEncounters` key exists in `mapThemes`
- `floors[]` may be empty; duplicate `floor` rejected; `themeId` (if set) must exist in `mapThemes`; muls must be `> 0`
- `drops[]` may be empty; duplicate `id` rejected; chances in `[0,1]`; `coinMax >= coinMin`; `lootKind` ∈ `coin|chest`
- Talent `requires[]` resolve inside the talent table
- Economy numeric fields finite and in allowed ranges

## Client load order (fail-soft)

1. `ConfigStore.loadBuiltin()` — must succeed or boot shows retry
2. Optional `ConfigRemote.tryFetchAndApply()` — only if `PACK_URL` non-empty **and** `LOCK_REMOTE === false`
3. Remote `version <=` active version → `unchanged` (do not downgrade)
4. On remote fail / validate fail → keep active pack; **never block lobby**
5. Tip may mention remote failure; gameplay continues offline

**提审锁定**：发审包保持 `PACK_URL === ''` 或设 `ConfigRemote.LOCK_REMOTE = true`。  
本地联调：`ConfigRemote.configure({ url: 'http://127.0.0.1:8787/api/pack/latest', lockRemote: false })`。


## Admin publish pipeline (target)

```
draft entities → assemble ConfigPack JSON
  → admin/scripts/validate-pack.mjs (structure smoke)
  → (later) same rules as ConfigStore.validatePack
  → upload JSON (+ assets) to CDN
  → bump version + publish pointer /api/pack/latest
  → clients with PACK_URL fetch on next cold boot
```

Rollback = republish a previous `version` artifact; client keeps builtin if fetch fails.

## API sketch (K7–K12 local mock)

Local mock: `cd admin && npm start` → `http://127.0.0.1:8787`  
Login: `admin` / `wxgame-dev`. UI: `/`. Public pack: `GET /api/pack/latest`.

| Method | Path | Purpose | Status |
|--------|------|---------|--------|
| `POST` | `/api/auth/login` | Admin session (K8) | ✅ mock |
| `GET/PATCH` | `/api/entities/:kind` | CRUD drafts (K9) | ✅ mock |
| `POST` | `/api/pack/validate` | Body/draft → `{ ok, error? }` | ✅ mock (structure smoke) |
| `GET` | `/api/pack/latest` | Public **published** pack only (not live draft) | ✅ local mock |
| `POST` | `/api/assets` | Upload image/audio/JSON (K10); auth; ≤2MB; allowlist ext | ✅ local mock |
| `GET` | `/api/assets` | List uploads (auth) | ✅ local mock |
| `GET` | `/media/:id` | Public media bytes (no auth) | ✅ local mock |
| `POST` | `/api/pack/publish` | Validate → immutable artifact → latest (K11) | ✅ local mock |
| `GET` | `/api/pack/versions` | List published versions + latest pointer (auth) | ✅ local mock |
| `GET` | `/api/pack/versions/:n` | Immutable published pack (public) | ✅ local mock |
| `POST` | `/api/pack/rollback` | Repoint latest to prior artifact (K12) | ✅ local mock |
| `GET` | `/api/audit` | Append-only audit log (K12) | ✅ local mock |

**Asset / pack split (K10)**: files live under mock storage (`/media/:id`). Published ConfigPack JSON stores **urls or asset ids only** — never inline binary. Client defaults remain offline (`PACK_URL === ''`); K13 adds version skip + `LOCK_REMOTE`. K14 is E2E against a real published URL.

Entity `kind` values aligned with schema top-level tables:  
`characters` | `weapons` | `enemies` | `mapThemes` | `biomeSpawn` | `encounters` | `themeEncounters` | `floors` | `drops` | `items` | `talents` | `shop` | `economy` | `dungeon`

## WeChat constraints

- Main package ≤ 4MB; remote pack + large art on CDN / subpackages
- Review build must play offline with builtin only
- Hot-update numbers freely; rule/play-pattern changes need review judgment

## Common mistakes

- Editing `BuiltinPack` fields that CMS later overwrites without bumping `version`
- Client reading a hard-coded table that the pack already owns
- Admin exporting camelCase aliases (`floorColors`) that are not in `ConfigSchema`
- Treating validate failure as a hard boot error after builtin already loaded
