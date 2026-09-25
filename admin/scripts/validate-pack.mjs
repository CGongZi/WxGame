#!/usr/bin/env node
/**
 * Structure smoke for ConfigPack (K7+ / B1 floors / drops / stages).
 * Not a full port of ConfigStore.validatePack — catches missing tables / envelope,
 * biome/theme key alignment, floors[] themeId / duplicate / mul rules,
 * drops[] chance / coin range / lootKind, and optional stages[] chain / theme / reward
 * before publish (K11 local pipeline uses this gate).
 *
 * Usage: node scripts/validate-pack.mjs <pack.json>
 * Exit 0 = ok, 1 = invalid / usage error.
 */

import fs from 'fs';
import path from 'path';

const REQUIRED_TOP = [
  'version', 'publishedAt', 'characters', 'weapons', 'enemies', 'mapThemes',
  'biomeSpawn', 'encounters', 'themeEncounters', 'floors', 'dungeon',
  'items', 'talents', 'drops', 'shop', 'economy',
];

function fail(msg) {
  console.error(`[validate-pack] FAIL: ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`[validate-pack] OK: ${msg}`);
  process.exit(0);
}

const file = process.argv[2];
if (!file) {
  fail('usage: node scripts/validate-pack.mjs <pack.json>');
}

const abs = path.resolve(process.cwd(), file);
if (!fs.existsSync(abs)) fail(`file not found: ${abs}`);

let raw;
try {
  raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
} catch (e) {
  fail(`JSON parse: ${e.message}`);
}

if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('root must be object');

for (const key of REQUIRED_TOP) {
  if (!(key in raw)) fail(`missing top-level key: ${key}`);
}

if (typeof raw.version !== 'number' || !(raw.version >= 1)) fail('version must be number >= 1');
if (typeof raw.publishedAt !== 'string' || !raw.publishedAt) fail('publishedAt must be non-empty string');

for (const arrKey of ['characters', 'weapons', 'enemies', 'mapThemes', 'encounters', 'items', 'talents', 'shop', 'floors', 'drops']) {
  if (!Array.isArray(raw[arrKey])) fail(`${arrKey} must be array`);
}

if (raw.characters.length < 1) fail('characters empty');
if (!raw.characters.some((c) => c && c.cost === 0)) fail('need at least one free character (cost === 0)');

if (raw.weapons.length < 1) fail('weapons empty');
if (!raw.weapons.some((w) => w && w.id === 'sword')) fail('weapons must include id "sword"');

if (raw.mapThemes.length < 1) fail('mapThemes empty');
if (!raw.biomeSpawn || typeof raw.biomeSpawn !== 'object' || Array.isArray(raw.biomeSpawn)) {
  fail('biomeSpawn must be object');
}
if (!raw.themeEncounters || typeof raw.themeEncounters !== 'object' || Array.isArray(raw.themeEncounters)) {
  fail('themeEncounters must be object');
}
if (!raw.dungeon || typeof raw.dungeon !== 'object') fail('dungeon must be object');
if (!raw.economy || typeof raw.economy !== 'object') fail('economy must be object');

const themeIds = new Set(raw.mapThemes.map((t) => t && t.id).filter(Boolean));
for (const key of Object.keys(raw.biomeSpawn)) {
  if (!themeIds.has(key)) fail(`biomeSpawn theme missing in mapThemes: ${key}`);
}
for (const key of Object.keys(raw.themeEncounters)) {
  if (!themeIds.has(key)) fail(`themeEncounters theme missing in mapThemes: ${key}`);
}

// B1 floors[] — mirror ConfigStore.checkFloors (empty OK; themeId / floor uniqueness)
{
  const total = raw.dungeon && typeof raw.dungeon.totalFloors === 'number'
    ? raw.dungeon.totalFloors
    : null;
  const seen = new Set();
  for (const row of raw.floors) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) fail('floors entry must be object');
    const floor = row.floor;
    if (typeof floor !== 'number' || !Number.isFinite(floor) || floor < 1 || !Number.isInteger(floor)) {
      fail(`floors.floor invalid: ${floor}`);
    }
    if (total !== null && floor > total) fail(`floors.floor > totalFloors: ${floor}`);
    if (seen.has(floor)) fail(`floors.floor duplicate: ${floor}`);
    seen.add(floor);
    if (row.themeId !== undefined) {
      if (typeof row.themeId !== 'string' || !themeIds.has(row.themeId)) {
        fail(`floors.themeId missing in mapThemes: floor ${floor} → ${row.themeId}`);
      }
    }
    for (const key of ['enemyCountMul', 'scaleMul', 'bossHpMul']) {
      if (row[key] === undefined) continue;
      const v = row[key];
      if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
        fail(`floors.${key} invalid: floor ${floor}`);
      }
    }
  }
}

// drops[] — mirror ConfigStore.checkDrops (empty OK)
{
  const seen = new Set();
  for (const row of raw.drops) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) fail('drops entry must be object');
    const id = row.id;
    if (typeof id !== 'string' || !id) fail('drops.id invalid');
    if (seen.has(id)) fail(`drops.id duplicate: ${id}`);
    seen.add(id);
    for (const key of ['coinChance', 'heartChance']) {
      const v = row[key];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) {
        fail(`drops.${key} invalid: ${id}`);
      }
    }
    for (const key of ['coinMin', 'coinMax', 'heartAmount']) {
      const v = row[key];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
        fail(`drops.${key} invalid: ${id}`);
      }
    }
    if (row.coinMax < row.coinMin) fail(`drops.coinMax < coinMin: ${id}`);
    if (row.lootKind !== 'coin' && row.lootKind !== 'chest') {
      fail(`drops.lootKind invalid: ${id}`);
    }
  }
}

// stages[] — optional; mirror ConfigStore.checkStages essentials
if (raw.stages !== undefined) {
  if (!Array.isArray(raw.stages)) fail('stages must be array');
  const itemIds = new Set(raw.items.map((it) => it && it.id).filter(Boolean));
  const stageIds = new Set();
  for (const row of raw.stages) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) fail('stages entry must be object');
    const id = row.id;
    if (typeof id !== 'string' || !id) fail('stages.id invalid');
    if (stageIds.has(id)) fail(`stages.id duplicate: ${id}`);
    stageIds.add(id);
    if (typeof row.name !== 'string' || typeof row.emoji !== 'string' || typeof row.desc !== 'string') {
      fail(`stages text invalid: ${id}`);
    }
    const floors = row.totalFloors;
    if (typeof floors !== 'number' || !Number.isFinite(floors) || floors < 1 || floors > 20) {
      fail(`stages.totalFloors invalid: ${id}`);
    }
    const bonus = row.clearBonusSoul;
    if (typeof bonus !== 'number' || !Number.isFinite(bonus) || bonus < 0) {
      fail(`stages.clearBonusSoul invalid: ${id}`);
    }
    if (row.roomsPerFloor !== undefined) {
      const r = row.roomsPerFloor;
      if (typeof r !== 'number' || !Number.isFinite(r) || r < 1 || r > 12) {
        fail(`stages.roomsPerFloor invalid: ${id}`);
      }
    }
    if (row.unlockAfter !== undefined) {
      if (typeof row.unlockAfter !== 'string' || !row.unlockAfter) {
        fail(`stages.unlockAfter invalid: ${id}`);
      }
    }
    if (row.themeId !== undefined) {
      if (typeof row.themeId !== 'string' || !themeIds.has(row.themeId)) {
        fail(`stages.themeId missing in mapThemes: ${id} → ${row.themeId}`);
      }
    }
    if (row.scaleMul !== undefined) {
      const m = row.scaleMul;
      if (typeof m !== 'number' || !Number.isFinite(m) || m <= 0) {
        fail(`stages.scaleMul invalid: ${id}`);
      }
    }
    if (row.rewardItemId !== undefined) {
      if (typeof row.rewardItemId !== 'string' || !itemIds.has(row.rewardItemId)) {
        fail(`stages.rewardItemId missing in items: ${id}`);
      }
      const amt = row.rewardItemAmount ?? 1;
      if (typeof amt !== 'number' || !Number.isFinite(amt) || amt < 1) {
        fail(`stages.rewardItemAmount invalid: ${id}`);
      }
    }
  }
  for (const row of raw.stages) {
    const after = row && row.unlockAfter;
    if (typeof after === 'string' && after && !stageIds.has(after)) {
      fail(`stages.unlockAfter missing: ${row.id} → ${after}`);
    }
  }
}

ok(`${path.basename(abs)} version=${raw.version}`);
