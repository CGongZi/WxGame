#!/usr/bin/env node
/**
 * Export BuiltinPack.ts → JSON for CMS / ConfigRemote e2e (K14).
 * Usage: node scripts/export-builtin-pack.mjs [out.json]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '..');
const SRC = path.join(REPO, 'game', 'WxGame', 'assets', 'scripts', 'core', 'BuiltinPack.ts');
const OUT = path.resolve(process.cwd(), process.argv[2] || path.join(ROOT, 'fixtures', 'builtin-pack.json'));

const src = fs.readFileSync(SRC, 'utf8');
const marker = 'export const BUILTIN_PACK: ConfigPack = ';
const idx = src.indexOf(marker);
if (idx < 0) {
  console.error('[export-builtin-pack] BUILTIN_PACK not found');
  process.exit(1);
}
const from = src.indexOf('{', idx);
const end = src.lastIndexOf('};');
if (from < 0 || end < from) {
  console.error('[export-builtin-pack] object bounds not found');
  process.exit(1);
}
const objSrc = src.slice(from, end + 1);
let pack;
try {
  pack = new Function(`return (${objSrc});`)();
} catch (e) {
  console.error('[export-builtin-pack] eval failed', e);
  process.exit(1);
}

// Bump for remote apply (must be > BuiltinPack.version when testing against game builtin)
if (typeof pack.version === 'number') {
  pack.version = pack.version + 1;
  pack.publishedAt = new Date().toISOString();
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(pack, null, 2) + '\n', 'utf8');
console.log(`[export-builtin-pack] wrote ${OUT} version=${pack.version}`);
