#!/usr/bin/env node
/**
 * Player cloud smoke — auth → sync → redeem → admin list
 * Needs: npm start (mock on :8787)
 */
const BASE = process.env.CMS_URL || 'http://127.0.0.1:8787';

async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log('[smoke:player] base', BASE);

  const auth = await req('POST', '/api/player/auth', { code: 'smoke_wx_code_001' });
  assert(auth.token && auth.playerId, 'auth token/playerId');
  console.log('  auth ok', auth.playerId);

  const save = {
    version: 2,
    currency: { soul: 77, totalRunCoins: 0 },
    progress: {
      highestFloor: 3, highestScore: 100, totalKills: 10, totalRuns: 1,
      clearCount: 0, bestClearTime: 0, stagesCleared: [], stageStars: {}, highestEndlessFloor: 0,
    },
    unlocks: { weapons: ['sword'], characters: ['warrior'], talents: [] },
    talents: {},
    shopPurchases: { maxHp: 0, atk: 0, def: 0, moveSpeed: 0 },
    codex: { themes: [], enemies: [], weapons: [] },
    selectedCharacter: 'warrior',
    selectedWeapon: 'sword',
    selectedDifficulty: 'normal',
    settings: { sfxVolume: 1, bgmVolume: 0.6, vibration: true },
    redeemedCodes: [],
    stash: {},
    flags: {},
  };

  const sync = await req('POST', '/api/player/sync', { save, nickName: 'smoke' }, auth.token);
  assert(sync.ok && sync.save?.currency?.soul === 77, 'sync soul');
  console.log('  sync ok');

  const redeem = await req('POST', '/api/player/redeem', { code: 'SOUL88' }, auth.token);
  assert(redeem.ok && redeem.save?.currency?.soul === 77 + 88, 'redeem soul');
  console.log('  redeem SOUL88 ok → soul', redeem.save.currency.soul);

  let dupOk = false;
  try {
    await req('POST', '/api/player/redeem', { code: 'SOUL88' }, auth.token);
  } catch (e) {
    dupOk = e.status === 409;
  }
  assert(dupOk, 'duplicate redeem should 409');
  console.log('  duplicate blocked');

  await req('POST', '/api/player/events', {
    events: [{ type: 'run_death', payload: { floor: 3 } }],
  }, auth.token);
  console.log('  events ok');

  const login = await req('POST', '/api/auth/login', {
    username: process.env.CMS_USER || 'admin',
    password: process.env.CMS_PASS || 'wxgame-dev',
  });
  const players = await req('GET', '/api/players', undefined, login.token);
  assert((players.players || []).some((p) => p.id === auth.playerId), 'admin sees player');
  console.log('  admin players', players.players.length);

  const detail = await req('GET', `/api/players/${auth.playerId}`, undefined, login.token);
  assert(detail.player?.redeems?.length >= 1, 'redeem history');
  console.log('  player redeems', detail.player.redeems.length);

  const codes = await req('GET', '/api/redeems', undefined, login.token);
  assert((codes.codes || []).length >= 6, 'seed codes');
  console.log('  redeem catalog', codes.codes.length);

  console.log('[smoke:player] PASS');
}

main().catch((e) => {
  console.error('[smoke:player] FAIL', e.message || e);
  process.exit(1);
});
