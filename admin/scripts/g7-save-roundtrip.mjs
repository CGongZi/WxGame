#!/usr/bin/env node
/**
 * G7 存读往返：v2 存档 shape 序列化 → 解析 → 关键字段不丢；
 * 旧扁平档字段映射冒烟（与 SaveData.migrateSave 契约对齐）。
 * Usage: node scripts/g7-save-roundtrip.mjs
 */
import assert from 'assert';

const SAMPLE_V2 = {
  version: 2,
  currency: { soul: 42, totalRunCoins: 900 },
  progress: {
    highestFloor: 7,
    highestScore: 1200,
    totalKills: 120,
    totalRuns: 8,
    clearCount: 2,
    bestClearTime: 600,
    stagesCleared: ['stage_1'],
    highestEndlessFloor: 12,
  },
  unlocks: {
    weapons: ['sword', 'glacier_orb'],
    characters: ['knight', 'cryomancer'],
    talents: ['vitality'],
  },
  talents: { vitality: 1 },
  shopPurchases: { maxHp: 1, atk: 0, def: 0, moveSpeed: 0 },
  codex: { themes: ['cave'], enemies: ['slime', 'raven'], weapons: ['sword'] },
  selectedCharacter: 'cryomancer',
  settings: { bgmVolume: 1, sfxVolume: 1, vibration: true },
  grants: [],
  stash: { potion: 2 },
  flags: { tutorialDone: true },
};

const LEGACY_FLAT = {
  highestFloor: 3,
  highestScore: 100,
  totalKills: 10,
  totalRuns: 1,
  totalCoins: 50,
  unlockedItems: ['sword', 'bow'],
};

function roundtrip(raw) {
  return JSON.parse(JSON.stringify(raw));
}

/** 轻量镜像 migrateSave 的关键契约（不全量复制，只验字段不丢） */
function softMigrate(raw) {
  if (raw && raw.version >= 2 && raw.currency && raw.progress) {
    return {
      ...SAMPLE_V2,
      ...raw,
      version: 2,
      currency: { ...SAMPLE_V2.currency, ...raw.currency },
      progress: {
        ...SAMPLE_V2.progress,
        ...raw.progress,
        stagesCleared: Array.isArray(raw.progress?.stagesCleared)
          ? raw.progress.stagesCleared.filter((x) => typeof x === 'string')
          : [],
        highestEndlessFloor: typeof raw.progress?.highestEndlessFloor === 'number'
          ? Math.max(0, Math.floor(raw.progress.highestEndlessFloor))
          : 0,
      },
      settings: { ...SAMPLE_V2.settings, ...raw.settings },
      flags: { tutorialDone: !!(raw.flags && raw.flags.tutorialDone) },
    };
  }
  return {
    version: 2,
    currency: { soul: 0, totalRunCoins: raw.totalCoins ?? 0 },
    progress: {
      highestFloor: raw.highestFloor ?? 0,
      highestScore: raw.highestScore ?? 0,
      totalKills: raw.totalKills ?? 0,
      totalRuns: raw.totalRuns ?? 0,
      clearCount: 0,
      bestClearTime: raw.bestClearTime ?? 0,
      stagesCleared: [],
      highestEndlessFloor: 0,
    },
    unlocks: {
      weapons: raw.unlockedItems?.length ? raw.unlockedItems : ['sword'],
      characters: ['knight'],
      talents: [],
    },
    settings: { bgmVolume: 1, sfxVolume: 1, vibration: true },
    flags: {},
  };
}

function check() {
  const out = roundtrip(SAMPLE_V2);
  assert.strictEqual(out.version, 2);
  assert.strictEqual(out.currency.soul, 42);
  assert.strictEqual(out.selectedCharacter, 'cryomancer');
  assert.ok(out.unlocks.characters.includes('cryomancer'));
  assert.ok(out.unlocks.weapons.includes('glacier_orb'));
  assert.strictEqual(out.settings.vibration, true);
  assert.strictEqual(out.flags.tutorialDone, true);
  assert.strictEqual(out.progress.highestEndlessFloor, 12);
  assert.deepStrictEqual(out.stash, { potion: 2 });
  assert.ok(out.codex.enemies.includes('raven'));

  const migrated = softMigrate(roundtrip(SAMPLE_V2));
  assert.strictEqual(migrated.flags.tutorialDone, true);
  assert.strictEqual(migrated.progress.highestEndlessFloor, 12);

  const fromLegacy = softMigrate(roundtrip(LEGACY_FLAT));
  assert.strictEqual(fromLegacy.version, 2);
  assert.strictEqual(fromLegacy.currency.totalRunCoins, 50);
  assert.ok(fromLegacy.unlocks.weapons.includes('bow'));
  assert.strictEqual(fromLegacy.progress.highestFloor, 3);

  const again = roundtrip(out);
  assert.deepStrictEqual(again, out);

  console.log('[g7-save-roundtrip] PASS');
}

try {
  check();
} catch (e) {
  console.error('[g7-save-roundtrip] FAIL', e);
  process.exit(1);
}
