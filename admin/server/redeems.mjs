/**
 * Server-side redeem codes (mock). Seeds match client #186 catalog.
 */

import fs from 'fs';
import path from 'path';
import { ROOT } from './store.mjs';

const DATA_DIR = path.join(ROOT, 'data');
const REDEEMS_PATH = path.join(DATA_DIR, 'redeems.json');

/** Same catalog as game RedeemCodes.ts — server is source of truth when CloudSync is on. */
const SEED_CODES = [
  {
    code: 'WELCOME',
    title: '新人礼包',
    enabled: true,
    rewards: [
      { kind: 'soul', amount: 50 },
      { kind: 'item', itemId: 'potion_hp', amount: 2 },
    ],
  },
  {
    code: 'SOUL88',
    title: '灵魂补给',
    enabled: true,
    rewards: [{ kind: 'soul', amount: 88 }],
  },
  {
    code: 'BAGPACK',
    title: '冒险背包',
    enabled: true,
    rewards: [
      { kind: 'item', itemId: 'potion_hp', amount: 3 },
      { kind: 'item', itemId: 'bomb', amount: 2 },
      { kind: 'item', itemId: 'potion_rage', amount: 1 },
    ],
  },
  {
    code: 'PIXELGO',
    title: '像素出击',
    enabled: true,
    rewards: [
      { kind: 'soul', amount: 100 },
      { kind: 'item', itemId: 'frost_bomb', amount: 2 },
      { kind: 'item', itemId: 'potion_shield', amount: 1 },
    ],
  },
  {
    code: 'RANGEROK',
    title: '游侠试用',
    enabled: true,
    rewards: [
      { kind: 'character', characterId: 'ranger' },
      { kind: 'soul', amount: 30 },
      { kind: 'item', itemId: 'scroll_haste', amount: 1 },
    ],
  },
  {
    code: 'VIPDAY',
    title: '节日加赠',
    enabled: true,
    rewards: [
      { kind: 'soul', amount: 200 },
      { kind: 'item', itemId: 'elixir_life', amount: 1 },
      { kind: 'item', itemId: 'coin_pouch', amount: 2 },
    ],
  },
];

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(REDEEMS_PATH)) {
    fs.writeFileSync(
      REDEEMS_PATH,
      JSON.stringify({ codes: SEED_CODES }, null, 2) + '\n',
      'utf8',
    );
  }
}

function loadDb() {
  ensure();
  try {
    const db = JSON.parse(fs.readFileSync(REDEEMS_PATH, 'utf8'));
    if (!Array.isArray(db.codes)) db.codes = [...SEED_CODES];
    return db;
  } catch {
    return { codes: [...SEED_CODES] };
  }
}

function saveDb(db) {
  ensure();
  fs.writeFileSync(REDEEMS_PATH, JSON.stringify(db, null, 2) + '\n', 'utf8');
}

export function normalizeCode(raw) {
  return String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function listCodes() {
  return loadDb().codes.slice();
}

export function getCode(raw) {
  const code = normalizeCode(raw);
  if (!code) return null;
  return loadDb().codes.find((c) => c.code === code) || null;
}

export function upsertCode(body) {
  const code = normalizeCode(body?.code);
  if (!code) return { error: 'code required' };
  if (!body.title || typeof body.title !== 'string') return { error: 'title required' };
  if (!Array.isArray(body.rewards) || body.rewards.length < 1) return { error: 'rewards required' };

  const db = loadDb();
  const entry = {
    code,
    title: String(body.title).slice(0, 64),
    enabled: body.enabled !== false,
    rewards: body.rewards,
  };
  const idx = db.codes.findIndex((c) => c.code === code);
  if (idx >= 0) db.codes[idx] = entry;
  else db.codes.push(entry);
  saveDb(db);
  return { ok: true, code: entry };
}

export function deleteCode(raw) {
  const code = normalizeCode(raw);
  const db = loadDb();
  const before = db.codes.length;
  db.codes = db.codes.filter((c) => c.code !== code);
  if (db.codes.length === before) return { error: 'not found' };
  saveDb(db);
  return { ok: true };
}

/**
 * Apply rewards onto a SaveData-shaped object (mutates).
 * Mirrors GameManager.tryRedeemCode grant rules.
 */
export function applyRewardsToSave(save, rewards) {
  if (!save.currency) save.currency = { soul: 0, totalRunCoins: 0 };
  if (!save.unlocks) save.unlocks = { weapons: [], characters: [], talents: [] };
  if (!Array.isArray(save.unlocks.characters)) save.unlocks.characters = [];
  if (!save.stash) save.stash = {};
  if (!Array.isArray(save.redeemedCodes)) save.redeemedCodes = [];

  const granted = [];
  for (const r of rewards || []) {
    if (!r || typeof r !== 'object') continue;
    if (r.kind === 'soul') {
      const n = Math.max(0, Math.floor(Number(r.amount) || 0));
      if (n > 0) {
        save.currency.soul = (save.currency.soul || 0) + n;
        granted.push({ kind: 'soul', amount: n });
      }
    } else if (r.kind === 'item') {
      const n = Math.max(0, Math.floor(Number(r.amount) || 0));
      const id = r.itemId;
      if (n > 0 && id) {
        save.stash[id] = (save.stash[id] || 0) + n;
        granted.push({ kind: 'item', itemId: id, amount: n });
      }
    } else if (r.kind === 'character') {
      const id = r.characterId;
      if (id && save.unlocks.characters.indexOf(id) < 0) {
        save.unlocks.characters.push(id);
        granted.push({ kind: 'character', characterId: id });
      } else if (id) {
        save.currency.soul = (save.currency.soul || 0) + 20;
        granted.push({ kind: 'soul', amount: 20 });
      }
    }
  }
  return granted;
}
