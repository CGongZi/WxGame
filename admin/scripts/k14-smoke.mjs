#!/usr/bin/env node
/**
 * K14 CMS-side smoke: export full pack → draft → patch sword.damage → publish → latest.
 * Does not boot Cocos; client apply is ConfigRemote + ConfigStore.tryApply (manual / editor).
 *
 * Prereq: npm start (mock on 8787)
 * Usage: node scripts/k14-smoke.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BASE = process.env.CMS_BASE || 'http://127.0.0.1:8787';
const TARGET_DMG = 35;

function fail(msg) {
  console.error('[k14-smoke] FAIL:', msg);
  process.exit(1);
}

async function main() {
  const exportR = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'export-builtin-pack.mjs'), path.join(ROOT, 'fixtures', 'builtin-pack.json')], {
    encoding: 'utf8',
  });
  if (exportR.status !== 0) fail(exportR.stderr || exportR.stdout || 'export failed');

  const pack = JSON.parse(fs.readFileSync(path.join(ROOT, 'fixtures', 'builtin-pack.json'), 'utf8'));
  const sword = pack.weapons.find((w) => w.id === 'sword');
  if (!sword) fail('sword missing');
  sword.damage = TARGET_DMG;

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'wxgame-dev' }),
  }).then((r) => r.json());
  if (!login.token) fail('login failed');
  const h = { Authorization: `Bearer ${login.token}`, 'Content-Type': 'application/json' };

  // Replace draft wholesale via writing each top-level kind would be many calls;
  // use reset then patch weapons after stuffing draft file is easier — call publish with body? 
  // Server has no set-draft API. Write data/draft.json then publish.
  const draftPath = path.join(ROOT, 'data', 'draft.json');
  fs.mkdirSync(path.dirname(draftPath), { recursive: true });
  fs.writeFileSync(draftPath, JSON.stringify(pack, null, 2) + '\n', 'utf8');

  const pub = await fetch(`${BASE}/api/pack/publish`, { method: 'POST', headers: h, body: '{}' }).then((r) => r.json());
  if (!pub.ok) fail(pub.error || 'publish failed');

  const latest = await fetch(`${BASE}/api/pack/latest`).then((r) => r.json());
  const liveSword = (latest.weapons || []).find((w) => w.id === 'sword');
  if (!liveSword || liveSword.damage !== TARGET_DMG) {
    fail(`latest sword.damage=${liveSword && liveSword.damage} expected ${TARGET_DMG}`);
  }

  console.log('[k14-smoke] OK publish v' + pub.version + ' sword.damage=' + liveSword.damage);
  console.log('[k14-smoke] Client: ConfigRemote.configure({ url: "' + BASE + '/api/pack/latest", lockRemote: false })');
  console.log('[k14-smoke] Then cold boot → BootLoading should apply if version > builtin');
}

main().catch((e) => fail(String(e && e.message ? e.message : e)));
