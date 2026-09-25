/**
 * Local publish pipeline (K11 mock) — draft → validate → immutable artifact → latest pointer.
 * Not a real CDN; files under admin/data/published/
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadDraft, saveDraft } from './store.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUB_DIR = path.join(ROOT, 'data', 'published');
const LATEST_PATH = path.join(PUB_DIR, 'latest.json');

function ensureDir() {
  if (!fs.existsSync(PUB_DIR)) fs.mkdirSync(PUB_DIR, { recursive: true });
}

export function readLatestPointer() {
  ensureDir();
  if (!fs.existsSync(LATEST_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(LATEST_PATH, 'utf8'));
  } catch {
    return null;
  }
}

export function loadPublishedPack() {
  const ptr = readLatestPointer();
  if (!ptr || !ptr.file) return null;
  const abs = path.join(PUB_DIR, ptr.file);
  if (!fs.existsSync(abs)) return null;
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

export function listPublishedVersions() {
  ensureDir();
  const files = fs.readdirSync(PUB_DIR).filter((f) => /^pack-v\d+\.json$/.test(f));
  return files
    .map((f) => {
      const m = /^pack-v(\d+)\.json$/.exec(f);
      return { version: Number(m[1]), file: f };
    })
    .sort((a, b) => b.version - a.version);
}

/**
 * @param {{ validate: (pack: unknown) => { ok: boolean, error?: string }, baseUrl: string }} opts
 */
export function publishDraft(opts) {
  ensureDir();
  const draft = loadDraft();
  const check = opts.validate(draft);
  if (!check.ok) return { error: check.error || 'validate failed' };

  const existing = listPublishedVersions();
  const maxExisting = existing.length ? existing[0].version : 0;
  const nextVersion = Math.max(Number(draft.version || 0), maxExisting) + 1;
  const pack = {
    ...draft,
    version: nextVersion,
    publishedAt: new Date().toISOString(),
  };

  const file = `pack-v${nextVersion}.json`;
  const abs = path.join(PUB_DIR, file);
  if (fs.existsSync(abs)) {
    return { error: `immutable artifact already exists: ${file}` };
  }
  fs.writeFileSync(abs, JSON.stringify(pack, null, 2) + '\n', 'utf8');

  // Keep draft in sync with published version so next edit bumps cleanly.
  saveDraft(pack);

  const pointer = {
    version: nextVersion,
    file,
    publishedAt: pack.publishedAt,
    url: `${opts.baseUrl}/api/pack/latest`,
    artifactUrl: `${opts.baseUrl}/api/pack/versions/${nextVersion}`,
  };
  fs.writeFileSync(LATEST_PATH, JSON.stringify(pointer, null, 2) + '\n', 'utf8');

  return { ok: true, ...pointer, pack };
}

export function loadPublishedVersion(version) {
  ensureDir();
  const file = `pack-v${Number(version)}.json`;
  const abs = path.join(PUB_DIR, file);
  if (!fs.existsSync(abs)) return null;
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

/** First boot: if nothing published, publish current draft once (after validate). */
export function ensureInitialPublish(opts) {
  if (readLatestPointer()) return { seeded: false };
  const out = publishDraft(opts);
  if (out.error) return { seeded: false, error: out.error };
  return { seeded: true, version: out.version };
}

export { PUB_DIR, LATEST_PATH };
