// Shared plumbing for the store-fill scripts — zero dependencies (Node 18+).
// Auth, the two API clients, and the store-config.json loader.
//
// Credentials never live in store-config.json. They come from env:
//   ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_FILE (default ~/.appstoreconnect/private_keys/AuthKey_<id>.p8)
//   PLAY_KEY_FILE (service-account JSON)
//   REVIEW_DEMO_PASSWORD (the store reviewer's login — typed by the human, never written to disk)

import { readFileSync, existsSync } from 'node:fs';
import { createSign, createPrivateKey } from 'node:crypto';
import { homedir } from 'node:os';
import { resolve, dirname } from 'node:path';

// ── config ──────────────────────────────────────────────────────────────────
export function loadConfig(path = 'store-assets/store-config.json') {
  const abs = resolve(path);
  if (!existsSync(abs)) throw new Error(`No ${path} — run the appstronaut intake first (intake.md).`);
  const cfg = JSON.parse(readFileSync(abs, 'utf8'));
  cfg._dir = dirname(abs);
  return cfg;
}

/** Read a text file referenced by the config, relative to the config's folder. */
export function readRef(cfg, ref) {
  return readFileSync(resolve(cfg._dir, ref), 'utf8').trim();
}

/**
 * Pull a fenced block that follows a `## Heading` in a listing markdown file, e.g.
 * listingField(md, 'Description') returns the ```…``` block under "## Description…".
 */
export function listingField(md, heading) {
  const at = md.search(new RegExp(`^##\\s+${heading}\\b`, 'mi'));
  if (at === -1) return null;
  const block = md.slice(at).match(/```[a-z]*\n([\s\S]*?)\n```/);
  return block ? block[1].trim() : null;
}

export const log = (...a) => console.log(...a);
export const plan = (dry, what) => console.log(`${dry ? '  [plan]' : '  [done]'} ${what}`);

// ── App Store Connect: ES256 JWT (ASC wants raw r||s, not DER) ─────────────
const b64url = (buf) => Buffer.from(buf).toString('base64url');
function derToRaw(der) {
  let i = 2;
  if (der[1] & 0x80) i += der[1] & 0x7f;
  const rLen = der[i + 1]; const r = der.subarray(i + 2, i + 2 + rLen);
  i = i + 2 + rLen;
  const sLen = der[i + 1]; const s = der.subarray(i + 2, i + 2 + sLen);
  const pad = (b) => { const out = Buffer.alloc(32); b.subarray(-32).copy(out, 32 - Math.min(32, b.length)); return out; };
  return Buffer.concat([pad(r), pad(s)]);
}

function ascJwt() {
  const keyId = process.env.ASC_KEY_ID; const issuer = process.env.ASC_ISSUER_ID;
  if (!keyId || !issuer) throw new Error('Set ASC_KEY_ID and ASC_ISSUER_ID (App Store Connect → Users and Access → Integrations).');
  const keyFile = process.env.ASC_KEY_FILE || `${homedir()}/.appstoreconnect/private_keys/AuthKey_${keyId}.p8`;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iss: issuer, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' }));
  const signer = createSign('SHA256');
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${b64url(derToRaw(signer.sign(createPrivateKey(readFileSync(keyFile)))))}`;
}

export async function asc(method, path, body) {
  const res = await fetch('https://api.appstoreconnect.apple.com' + path, {
    method,
    headers: { Authorization: `Bearer ${ascJwt()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const detail = json?.errors?.map((e) => `${e.status} ${e.code}: ${e.title} — ${e.detail}`).join('\n') || text;
    const err = new Error(`${method} ${path}\n${detail}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

// ── Google Play: RS256 service-account token ───────────────────────────────
let playToken;
export async function playAuth() {
  if (playToken) return playToken;
  const keyFile = process.env.PLAY_KEY_FILE;
  if (!keyFile) throw new Error('Set PLAY_KEY_FILE to the Play service-account JSON.');
  const sa = JSON.parse(readFileSync(keyFile, 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${header}.${claims}.${b64url(signer.sign(sa.private_key))}`,
  });
  const json = await res.json();
  if (!json.access_token) throw new Error(`Play token exchange failed: ${JSON.stringify(json)}`);
  return (playToken = json.access_token);
}

export async function play(method, url, body, contentType = 'application/json') {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${await playAuth()}`, 'Content-Type': contentType },
    body: body ? (contentType === 'application/json' ? JSON.stringify(body) : body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${url}\n${json?.error?.message || text}`);
  return json;
}

export const playApi = (pkg) => `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}`;
export const playUpload = (pkg) => `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${pkg}`;

/**
 * Run fn inside a Play edit. Dry runs validate and discard; real runs commit.
 * Play flips the commit contract once an app has ever been published: a draft app
 * REQUIRES changesNotSentForReview=true, a live app REFUSES it. Try live, fall back.
 */
export async function withPlayEdit(pkg, fn, { commit }) {
  const API = playApi(pkg);
  const edit = await play('POST', `${API}/edits`);
  try {
    const out = await fn(edit.id);
    if (!commit) {
      await play('POST', `${API}/edits/${edit.id}:validate`);
      log('  Play edit validated (dry run) — nothing committed.');
      await play('DELETE', `${API}/edits/${edit.id}`).catch(() => {});
      return out;
    }
    try {
      await play('POST', `${API}/edits/${edit.id}:commit`);
    } catch (e) {
      if (!/changesNotSentForReview/.test(String(e))) throw e;
      await play('POST', `${API}/edits/${edit.id}:commit?changesNotSentForReview=true`);
    }
    log('  Play edit committed (not sent for review).');
    return out;
  } catch (e) {
    await play('DELETE', `${API}/edits/${edit.id}`).catch(() => {});
    throw e;
  }
}
