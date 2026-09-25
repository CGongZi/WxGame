/**
 * Audit log + rollback (K12 mock).
 * Append-only JSONL under admin/data/audit.jsonl
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadPublishedVersion, readLatestPointer } from './publish.mjs';
import { saveDraft } from './store.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const AUDIT_PATH = path.join(ROOT, 'data', 'audit.jsonl');
const PUB_DIR = path.join(ROOT, 'data', 'published');
const LATEST_PATH = path.join(PUB_DIR, 'latest.json');

function ensureParent() {
  const dir = path.dirname(AUDIT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function appendAudit(entry) {
  ensureParent();
  const row = {
    at: new Date().toISOString(),
    ...entry,
  };
  fs.appendFileSync(AUDIT_PATH, JSON.stringify(row) + '\n', 'utf8');
  return row;
}

export function listAudit(limit = 50) {
  ensureParent();
  if (!fs.existsSync(AUDIT_PATH)) return [];
  const lines = fs.readFileSync(AUDIT_PATH, 'utf8').split(/\n+/).filter(Boolean);
  const n = Math.max(1, Math.min(200, Number(limit) || 50));
  return lines.slice(-n).reverse().map((line) => {
    try { return JSON.parse(line); }
    catch { return { at: '', action: 'corrupt', detail: line.slice(0, 80) }; }
  });
}

/**
 * Repoint latest to an existing immutable artifact. Does not rewrite the artifact.
 * Syncs draft to that pack so editors see the rolled-back content.
 */
export function rollbackToVersion(version, opts) {
  const pack = loadPublishedVersion(version);
  if (!pack) return { error: `version not found: ${version}` };

  const prev = readLatestPointer();
  const file = `pack-v${Number(version)}.json`;
  const pointer = {
    version: Number(version),
    file,
    publishedAt: pack.publishedAt || new Date().toISOString(),
    url: `${opts.baseUrl}/api/pack/latest`,
    artifactUrl: `${opts.baseUrl}/api/pack/versions/${version}`,
    rolledBackAt: new Date().toISOString(),
  };
  fs.writeFileSync(LATEST_PATH, JSON.stringify(pointer, null, 2) + '\n', 'utf8');
  saveDraft(pack);

  const audit = appendAudit({
    actor: opts.actor || 'admin',
    action: 'pack.rollback',
    detail: {
      toVersion: Number(version),
      fromVersion: prev ? prev.version : null,
    },
  });

  return { ok: true, ...pointer, audit };
}

export { AUDIT_PATH };
