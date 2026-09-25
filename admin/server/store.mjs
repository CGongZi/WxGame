/**
 * Draft pack store (K8/K9 mock).
 * Persists to admin/data/draft.json; seeds from fixtures/seed-draft.json when missing.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const DRAFT_PATH = path.join(DATA_DIR, 'draft.json');
const SEED_PATH = path.join(ROOT, 'fixtures', 'seed-draft.json');

export const ENTITY_KINDS = [
  'characters', 'weapons', 'enemies', 'mapThemes', 'biomeSpawn',
  'encounters', 'themeEncounters', 'floors', 'drops', 'items', 'talents', 'shop', 'economy', 'dungeon',
];

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function loadDraft() {
  ensureDataDir();
  if (!fs.existsSync(DRAFT_PATH)) {
    const seed = fs.readFileSync(SEED_PATH, 'utf8');
    fs.writeFileSync(DRAFT_PATH, seed, 'utf8');
  }
  return JSON.parse(fs.readFileSync(DRAFT_PATH, 'utf8'));
}

export function saveDraft(pack) {
  ensureDataDir();
  fs.writeFileSync(DRAFT_PATH, JSON.stringify(pack, null, 2) + '\n', 'utf8');
}

export function resetDraftFromSeed() {
  ensureDataDir();
  const seed = fs.readFileSync(SEED_PATH, 'utf8');
  fs.writeFileSync(DRAFT_PATH, seed, 'utf8');
  return JSON.parse(seed);
}

export function getEntity(kind) {
  if (!ENTITY_KINDS.includes(kind)) return { error: `unknown kind: ${kind}` };
  const pack = loadDraft();
  return { draft: pack[kind] };
}

export function patchEntity(kind, value) {
  if (!ENTITY_KINDS.includes(kind)) return { error: `unknown kind: ${kind}` };
  const pack = loadDraft();
  pack[kind] = value;
  pack.publishedAt = new Date().toISOString();
  saveDraft(pack);
  return { draft: pack[kind], version: pack.version, publishedAt: pack.publishedAt };
}

export { DRAFT_PATH, SEED_PATH, ROOT };
