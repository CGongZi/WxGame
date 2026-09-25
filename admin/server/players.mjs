/**
 * Player cloud store (mock) — local JSON under data/players.json
 * Identity: wx.login code → openid (dev hash) → playerId
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ROOT } from './store.mjs';

const DATA_DIR = path.join(ROOT, 'data');
const PLAYERS_PATH = path.join(DATA_DIR, 'players.json');
const MAX_EVENTS = 200;

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(PLAYERS_PATH)) {
    fs.writeFileSync(PLAYERS_PATH, JSON.stringify({ players: {} }, null, 2) + '\n', 'utf8');
  }
}

function loadDb() {
  ensure();
  try {
    return JSON.parse(fs.readFileSync(PLAYERS_PATH, 'utf8'));
  } catch {
    return { players: {} };
  }
}

function saveDb(db) {
  ensure();
  fs.writeFileSync(PLAYERS_PATH, JSON.stringify(db, null, 2) + '\n', 'utf8');
}

/** Mock: map wx.login code → stable openid (no real WeChat code2session). */
export function openidFromCode(code) {
  const raw = String(code || '').trim() || `anon_${Date.now()}`;
  const hash = crypto.createHash('sha256').update(`wxgame:${raw}`).digest('hex').slice(0, 24);
  return `o_dev_${hash}`;
}

function newPlayerId() {
  return `pl_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
}

export function findOrCreateByCode(code) {
  const openid = openidFromCode(code);
  const db = loadDb();
  let player = Object.values(db.players).find((p) => p.openid === openid);
  const now = new Date().toISOString();
  if (!player) {
    const id = newPlayerId();
    player = {
      id,
      openid,
      createdAt: now,
      updatedAt: now,
      lastSyncAt: null,
      lastLoginAt: now,
      save: null,
      redeems: [],
      events: [],
      nickName: '',
    };
    db.players[id] = player;
    saveDb(db);
  } else {
    player.lastLoginAt = now;
    db.players[player.id] = player;
    saveDb(db);
  }
  return player;
}

export function getPlayer(id) {
  const db = loadDb();
  return db.players[id] || null;
}

export function listPlayers() {
  const db = loadDb();
  return Object.values(db.players)
    .map((p) => ({
      id: p.id,
      openid: p.openid,
      nickName: p.nickName || '',
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      lastSyncAt: p.lastSyncAt,
      lastLoginAt: p.lastLoginAt,
      soul: p.save?.currency?.soul ?? null,
      highestFloor: p.save?.progress?.highestFloor ?? null,
      redeemCount: Array.isArray(p.redeems) ? p.redeems.length : 0,
      eventCount: Array.isArray(p.events) ? p.events.length : 0,
    }))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

/**
 * Last-write-wins sync. Client may send full SaveData.
 * @returns {{ ok: true, player, conflict: false } | { error: string }}
 */
export function syncSave(playerId, save, meta = {}) {
  if (!save || typeof save !== 'object') return { error: 'save required' };
  const db = loadDb();
  const player = db.players[playerId];
  if (!player) return { error: 'player not found' };
  const now = new Date().toISOString();
  player.save = save;
  player.updatedAt = now;
  player.lastSyncAt = now;
  if (meta.nickName) player.nickName = String(meta.nickName).slice(0, 64);
  db.players[playerId] = player;
  saveDb(db);
  return { ok: true, player, conflict: false };
}

export function recordRedeem(playerId, entry) {
  const db = loadDb();
  const player = db.players[playerId];
  if (!player) return { error: 'player not found' };
  if (!Array.isArray(player.redeems)) player.redeems = [];
  player.redeems.push(entry);
  player.updatedAt = new Date().toISOString();
  db.players[playerId] = player;
  saveDb(db);
  return { ok: true, player };
}

export function appendEvents(playerId, events) {
  const db = loadDb();
  const player = db.players[playerId];
  if (!player) return { error: 'player not found' };
  if (!Array.isArray(player.events)) player.events = [];
  const now = new Date().toISOString();
  const list = Array.isArray(events) ? events : [];
  for (const ev of list.slice(0, 50)) {
    if (!ev || typeof ev !== 'object') continue;
    player.events.push({
      id: `ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      type: String(ev.type || 'unknown').slice(0, 64),
      at: ev.at || now,
      payload: ev.payload && typeof ev.payload === 'object' ? ev.payload : {},
    });
  }
  if (player.events.length > MAX_EVENTS) {
    player.events = player.events.slice(-MAX_EVENTS);
  }
  player.updatedAt = now;
  db.players[playerId] = player;
  saveDb(db);
  return { ok: true, count: player.events.length };
}

export function updatePlayerSave(playerId, save) {
  return syncSave(playerId, save, {});
}
