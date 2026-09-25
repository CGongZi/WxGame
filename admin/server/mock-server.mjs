#!/usr/bin/env node
/**
 * CMS mock server — K8 auth · K9 CRUD · K10 upload · K11 publish · K12 audit/rollback · pack validate/latest
 * Default: http://localhost:8787
 * Login: admin / wxgame-dev
 * Not a real CDN — published packs under data/published/
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import {
  ENTITY_KINDS, loadDraft, saveDraft, getEntity, patchEntity, resetDraftFromSeed, ROOT,
} from './store.mjs';
import { saveAsset, listAssets, resolveAssetPath, MAX_BYTES } from './assets.mjs';
import { parseMultipart, readRawBody } from './multipart.mjs';
import {
  publishDraft, loadPublishedPack, listPublishedVersions, loadPublishedVersion, ensureInitialPublish, readLatestPointer,
} from './publish.mjs';
import { appendAudit, listAudit, rollbackToVersion } from './audit.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const ADMIN_USER = process.env.CMS_USER || 'admin';
const ADMIN_PASS = process.env.CMS_PASS || 'wxgame-dev';

/** @type {Map<string, { user: string, at: number }>} */
const sessions = new Map();

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
}

function send(res, status, body) {
  cors(res);
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(raw);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) return resolve(null);
      try { resolve(JSON.parse(text)); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function tokenFrom(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : '';
}

function requireAuth(req, res) {
  const token = tokenFrom(req);
  if (!token || !sessions.has(token)) {
    send(res, 401, { error: 'unauthorized' });
    return null;
  }
  return sessions.get(token);
}

function newToken() {
  return `tok_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function validatePackFile(pack) {
  const tmp = path.join(ROOT, 'data', '_validate-tmp.json');
  fs.writeFileSync(tmp, JSON.stringify(pack), 'utf8');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'validate-pack.mjs'), tmp], {
    encoding: 'utf8',
  });
  try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  if (r.status === 0) return { ok: true };
  const err = (r.stderr || r.stdout || 'validate failed').trim();
  return { ok: false, error: err.replace(/^\[validate-pack\] FAIL:\s*/, '') };
}

function baseUrl() {
  return `http://127.0.0.1:${PORT}`;
}

function serveStatic(req, res, urlPath) {
  const publicDir = path.join(ROOT, 'public');
  let rel = urlPath === '/' ? '/index.html' : urlPath;
  rel = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
  const file = path.join(publicDir, rel);
  if (!file.startsWith(publicDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    send(res, 404, { error: 'not found' });
    return;
  }
  const ext = path.extname(file);
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
  cors(res);
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

function serveMedia(req, res, id) {
  const found = resolveAssetPath(id);
  if (!found) {
    send(res, 404, { error: 'asset not found' });
    return;
  }
  cors(res);
  res.writeHead(200, {
    'Content-Type': found.meta.contentType,
    'Content-Length': found.meta.bytes,
    'Cache-Control': 'public, max-age=60',
  });
  fs.createReadStream(found.abs).pipe(res);
}

async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
  const { pathname } = url;

  try {
    if (req.method === 'POST' && pathname === '/api/auth/login') {
      const body = await readBody(req);
      if (!body || body.username !== ADMIN_USER || body.password !== ADMIN_PASS) {
        send(res, 401, { error: 'invalid credentials' });
        return;
      }
      const token = newToken();
      sessions.set(token, { user: body.username, at: Date.now() });
      appendAudit({ actor: body.username, action: 'auth.login', detail: {} });
      send(res, 200, { token, user: body.username });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/entities') {
      if (!requireAuth(req, res)) return;
      send(res, 200, { kinds: ENTITY_KINDS });
      return;
    }

    const entMatch = /^\/api\/entities\/([a-zA-Z]+)$/.exec(pathname);
    if (entMatch) {
      const kind = entMatch[1];
      if (req.method === 'GET') {
        if (!requireAuth(req, res)) return;
        const out = getEntity(kind);
        if (out.error) send(res, 404, out);
        else send(res, 200, out);
        return;
      }
      if (req.method === 'PATCH') {
        if (!requireAuth(req, res)) return;
        const body = await readBody(req);
        if (body === null || body === undefined) {
          send(res, 400, { error: 'body required' });
          return;
        }
        const value = body && typeof body === 'object' && 'draft' in body ? body.draft : body;
        const out = patchEntity(kind, value);
        if (out.error) send(res, 404, out);
        else {
          const sess = sessions.get(tokenFrom(req));
          appendAudit({ actor: sess?.user || 'admin', action: 'entity.patch', detail: { kind } });
          send(res, 200, out);
        }
        return;
      }
    }

    // —— K10 assets ——
    if (req.method === 'GET' && pathname === '/api/assets') {
      if (!requireAuth(req, res)) return;
      send(res, 200, { assets: listAssets() });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/assets') {
      if (!requireAuth(req, res)) return;
      const ct = req.headers['content-type'] || '';
      try {
        if (ct.includes('multipart/form-data')) {
          const raw = await readRawBody(req, MAX_BYTES + 64 * 1024);
          const parsed = parseMultipart(raw, ct);
          if (parsed.error) {
            send(res, 400, { error: parsed.error });
            return;
          }
          const out = saveAsset({
            id: parsed.id,
            filename: parsed.file.filename,
            contentType: parsed.file.contentType,
            buffer: parsed.file.buffer,
            baseUrl: baseUrl(),
          });
          if (out.error) send(res, 400, out);
          else {
            const sess = sessions.get(tokenFrom(req));
            appendAudit({ actor: sess?.user || 'admin', action: 'asset.upload', detail: { id: out.asset.id } });
            send(res, 200, out);
          }
          return;
        }
        const body = await readBody(req);
        if (!body || !body.filename || !body.dataBase64) {
          send(res, 400, { error: 'expected multipart file or { filename, dataBase64 }' });
          return;
        }
        const out = saveAsset({
          id: body.id,
          filename: body.filename,
          contentType: body.contentType,
          buffer: Buffer.from(body.dataBase64, 'base64'),
          baseUrl: baseUrl(),
        });
        if (out.error) send(res, 400, out);
        else {
          const sess = sessions.get(tokenFrom(req));
          appendAudit({ actor: sess?.user || 'admin', action: 'asset.upload', detail: { id: out.asset.id } });
          send(res, 200, out);
        }
        return;
      } catch (e) {
        send(res, 400, { error: String(e && e.message ? e.message : e) });
        return;
      }
    }

    const mediaMatch = /^\/media\/([a-z0-9_-]+)$/i.exec(pathname);
    if (req.method === 'GET' && mediaMatch) {
      serveMedia(req, res, mediaMatch[1]);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/pack/draft') {
      if (!requireAuth(req, res)) return;
      send(res, 200, loadDraft());
      return;
    }

    if (req.method === 'POST' && pathname === '/api/pack/validate') {
      if (!requireAuth(req, res)) return;
      const body = await readBody(req);
      let pack = loadDraft();
      if (body && typeof body === 'object') {
        if (body.pack) pack = body.pack;
        else if (typeof body.version === 'number') pack = body;
      }
      send(res, 200, validatePackFile(pack));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/pack/reset') {
      if (!requireAuth(req, res)) return;
      const pack = resetDraftFromSeed();
      send(res, 200, { ok: true, version: pack.version });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/pack/bump') {
      if (!requireAuth(req, res)) return;
      const pack = loadDraft();
      pack.version = Number(pack.version || 0) + 1;
      pack.publishedAt = new Date().toISOString();
      saveDraft(pack);
      send(res, 200, { version: pack.version, publishedAt: pack.publishedAt });
      return;
    }

    // —— K11 publish ——
    if (req.method === 'POST' && pathname === '/api/pack/publish') {
      if (!requireAuth(req, res)) return;
      const sess = sessions.get(tokenFrom(req));
      const out = publishDraft({ validate: validatePackFile, baseUrl: baseUrl() });
      if (out.error) send(res, 400, { ok: false, error: out.error });
      else {
        appendAudit({ actor: sess?.user || 'admin', action: 'pack.publish', detail: { version: out.version } });
        send(res, 200, {
          ok: true,
          version: out.version,
          publishedAt: out.publishedAt,
          url: out.url,
          artifactUrl: out.artifactUrl,
        });
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/api/pack/rollback') {
      if (!requireAuth(req, res)) return;
      const body = await readBody(req);
      const version = body && body.version;
      if (version === undefined || version === null) {
        send(res, 400, { error: 'body.version required' });
        return;
      }
      const sess = sessions.get(tokenFrom(req));
      const out = rollbackToVersion(version, { baseUrl: baseUrl(), actor: sess?.user || 'admin' });
      if (out.error) send(res, 404, { ok: false, error: out.error });
      else send(res, 200, {
        ok: true,
        version: out.version,
        url: out.url,
        artifactUrl: out.artifactUrl,
        rolledBackAt: out.rolledBackAt,
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/audit') {
      if (!requireAuth(req, res)) return;
      const limit = url.searchParams.get('limit');
      send(res, 200, { entries: listAudit(limit) });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/pack/versions') {
      if (!requireAuth(req, res)) return;
      const ptr = readLatestPointer();
      send(res, 200, { latest: ptr, versions: listPublishedVersions() });
      return;
    }

    const verMatch = /^\/api\/pack\/versions\/(\d+)$/.exec(pathname);
    if (req.method === 'GET' && verMatch) {
      const pack = loadPublishedVersion(verMatch[1]);
      if (!pack) send(res, 404, { error: 'version not found' });
      else send(res, 200, pack);
      return;
    }

    // Public — published latest only (draft edits require publish)
    if (req.method === 'GET' && pathname === '/api/pack/latest') {
      const pack = loadPublishedPack();
      if (!pack) {
        send(res, 404, { error: 'no published pack; POST /api/pack/publish first' });
        return;
      }
      send(res, 200, pack);
      return;
    }

    if (req.method === 'GET' && (pathname === '/' || pathname.endsWith('.html') || pathname.endsWith('.css') || pathname.endsWith('.js'))) {
      serveStatic(req, res, pathname);
      return;
    }

    send(res, 404, { error: 'not found', path: pathname });
  } catch (e) {
    console.error('[mock-server]', e);
    send(res, 500, { error: String(e && e.message ? e.message : e) });
  }
}

loadDraft();
const bootPub = ensureInitialPublish({ validate: validatePackFile, baseUrl: baseUrl() });
http.createServer(handler).listen(PORT, () => {
  console.log(`[cms-mock] http://127.0.0.1:${PORT}`);
  console.log(`[cms-mock] login ${ADMIN_USER} / ${ADMIN_PASS}`);
  console.log(`[cms-mock] upload POST /api/assets → GET /media/:id`);
  console.log(`[cms-mock] publish POST /api/pack/publish → GET /api/pack/latest`);
  if (bootPub.seeded) console.log(`[cms-mock] seeded publish v${bootPub.version}`);
  if (bootPub.error) console.warn(`[cms-mock] initial publish skipped: ${bootPub.error}`);
});
