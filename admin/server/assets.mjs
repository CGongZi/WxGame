/**
 * Local asset store (K10 mock) — stand-in for object storage / CDN.
 * Files live under admin/data/uploads/; public URL /media/:id
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const UPLOAD_DIR = path.join(ROOT, 'data', 'uploads');
const MANIFEST_PATH = path.join(UPLOAD_DIR, 'manifest.json');

const ALLOWED_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.gif',
  '.mp3', '.wav', '.ogg',
  '.json',
]);

const MAX_BYTES = 2 * 1024 * 1024;

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.json': 'application/json',
};

function ensureDir() {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (!fs.existsSync(MANIFEST_PATH)) {
    fs.writeFileSync(MANIFEST_PATH, '[]\n', 'utf8');
  }
}

function readManifest() {
  ensureDir();
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function writeManifest(list) {
  ensureDir();
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(list, null, 2) + '\n', 'utf8');
}

function safeId(raw) {
  const s = String(raw || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return s.slice(0, 64) || `asset_${Date.now().toString(36)}`;
}

function extOf(name, contentType) {
  const fromName = path.extname(name || '').toLowerCase();
  // Filename extension wins: non-empty disallowed (.exe etc.) must not fall through via Content-Type.
  if (fromName) return ALLOWED_EXT.has(fromName) ? fromName : '';
  const map = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/ogg': '.ogg',
    'application/json': '.json',
  };
  return map[contentType] || '';
}

/**
 * @param {{ id?: string, filename: string, contentType?: string, buffer: Buffer, baseUrl: string }} opts
 */
export function saveAsset(opts) {
  ensureDir();
  const ext = extOf(opts.filename, opts.contentType || '');
  if (!ext || !ALLOWED_EXT.has(ext)) {
    return { error: `unsupported type (allow: ${[...ALLOWED_EXT].join(' ')})` };
  }
  if (!opts.buffer || opts.buffer.length < 1) return { error: 'empty file' };
  if (opts.buffer.length > MAX_BYTES) return { error: `file too large (max ${MAX_BYTES} bytes)` };

  const id = safeId(opts.id || path.basename(opts.filename, path.extname(opts.filename)));
  const storedName = `${id}${ext}`;
  const abs = path.join(UPLOAD_DIR, storedName);
  fs.writeFileSync(abs, opts.buffer);

  const entry = {
    id,
    filename: opts.filename,
    storedName,
    contentType: MIME[ext] || opts.contentType || 'application/octet-stream',
    bytes: opts.buffer.length,
    url: `${opts.baseUrl}/media/${id}`,
    at: new Date().toISOString(),
  };

  const list = readManifest().filter((x) => x.id !== id);
  list.unshift(entry);
  writeManifest(list);
  return { asset: entry };
}

export function listAssets() {
  return readManifest();
}

export function getAssetMeta(id) {
  return readManifest().find((x) => x.id === id) || null;
}

export function resolveAssetPath(id) {
  const meta = getAssetMeta(id);
  if (!meta) return null;
  const abs = path.join(UPLOAD_DIR, meta.storedName);
  if (!fs.existsSync(abs)) return null;
  return { abs, meta };
}

export { ALLOWED_EXT, MAX_BYTES, UPLOAD_DIR };
