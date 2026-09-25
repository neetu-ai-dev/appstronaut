#!/usr/bin/env node
// Pre-flight: run every automatable row of rejection-catalogue.md before anything is uploaded
// or submitted. FAIL = would be rejected or blocks submission; WARN = look before you ship.
//
//   node preflight.mjs [--config store-assets/store-config.json] [--offline] [--stage setup|submit]
//
// --stage setup (default) treats "site / API not live yet" as WARN, so console setup can proceed;
// --stage submit makes them FAIL. --offline skips network checks. Exit code 1 on any FAIL.
//
// Checks are cited by their catalogue row (M1, X2, D15, …).

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { loadConfig, readRef, listingField } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (f) => { const i = args.indexOf(f); return i === -1 ? undefined : args[i + 1]; };
const OFFLINE = args.includes('--offline');
const SUBMIT = opt('--stage') === 'submit';

const cfg = loadConfig(opt('--config'));
const ROOT = resolve(cfg._dir, cfg.repoRoot || '..');
const APP = resolve(ROOT, cfg.app.appDir || '.');
const results = [];
const add = (level, row, msg) => results.push({ level, row, msg });
const pass = (row, msg) => add('PASS', row, msg);
const warn = (row, msg) => add('WARN', row, msg);
const fail = (row, msg) => add('FAIL', row, msg);
const liveGate = (row, msg) => (SUBMIT ? fail : warn)(row, msg);

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const walk = (dir, re, out = []) => {
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    if (f.startsWith('.') || ['node_modules', 'Pods', 'build', 'DerivedData', '.gradle'].includes(f)) continue;
    const p = join(dir, f);
    let st;
    try { st = statSync(p); } catch { continue; } // broken symlink (CocoaPods leaves plenty)
    if (st.isDirectory()) walk(p, re, out); else if (re.test(f)) out.push(p);
  }
  return out;
};

// ── PNG header: size + alpha (colour type 4/6, or a tRNS chunk) ─────────────
function png(file) {
  const b = readFileSync(file);
  if (b.readUInt32BE(12) !== 0x49484452) throw new Error(`${basename(file)} is not a PNG`);
  const type = b[25];
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), alpha: type === 4 || type === 6 || b.includes(Buffer.from('tRNS')), bytes: b.length };
}

// ── TrueType/OpenType name table: PostScript name (nameID 6) ─────────────────
function postscriptName(file) {
  const b = readFileSync(file);
  const numTables = b.readUInt16BE(4);
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    if (b.toString('latin1', rec, rec + 4) !== 'name') continue;
    const off = b.readUInt32BE(rec + 8);
    const count = b.readUInt16BE(off + 2); const strings = off + b.readUInt16BE(off + 4);
    for (let j = 0; j < count; j++) {
      const r = off + 6 + j * 12;
      const [platform, , , nameId, len, sOff] = [0, 2, 4, 6, 8, 10].map((k) => b.readUInt16BE(r + k));
      if (nameId !== 6) continue;
      const raw = b.subarray(strings + sOff, strings + sOff + len);
      return platform === 3 || platform === 0 ? Buffer.from(raw).swap16().toString('utf16le') : raw.toString('latin1');
    }
  }
  return null;
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. Listing text (M7, M15, M17, lengths)
const LIMITS = {
  apple: { Name: 30, Subtitle: 30, 'Promotional text': 170, Description: 4000, Keywords: 100 },
  play: { 'Short description': 80, 'Full description': 4000 },
};
const listings = {};
for (const [store, file] of [['apple', cfg.apple?.listingFile], ['play', cfg.play?.listingFile]]) {
  if (!file) continue;
  const md = readRef(cfg, file);
  listings[store] = md;
  for (const [field, max] of Object.entries(LIMITS[store])) {
    const v = listingField(md, field);
    if (!v) { fail('lengths', `${store}: "${field}" block missing in ${file}`); continue; }
    const n = [...v].length;
    if (n > max) fail('lengths', `${store} ${field}: ${n}/${max} chars`);
  }
  const kw = store === 'apple' && listingField(md, 'Keywords');
  if (kw && /,\s/.test(kw)) warn('lengths', 'apple Keywords: spaces after commas waste characters');
}
pass('lengths', 'listing field limits checked');
if (listings.apple && listingField(listings.apple, 'Name') && listingField(listings.apple, 'Name') !== cfg.app.name)
  fail('M17', `Apple name "${listingField(listings.apple, 'Name')}" ≠ app.name "${cfg.app.name}"`);
else pass('M17', `store title = "${cfg.app.name}" (Play title is set from app.name by play-fill)`);

const texts = { ...listings };
if (cfg.reviewer?.notesFile) texts.notes = readRef(cfg, cfg.reviewer.notesFile);
for (const [name, text] of Object.entries(texts)) {
  for (const n of cfg.forbiddenNames || []) if (text.toLowerCase().includes(n.toLowerCase())) fail('M15', `"${n}" appears in the ${name} text`);
  if (/coming soon/i.test(text)) fail('M5', `"coming soon" in the ${name} text — describe only what ships`);
  if (name !== 'notes' && /\b(best|#1|number one|top-rated)\b/i.test(text)) warn('metadata', `superlative in the ${name} text`);
}
pass('M15', `no forbidden names in listings or notes (${(cfg.forbiddenNames || []).length} checked)`);

// ═════════════════════════════════════════════════════════════════════════════
// 2. App config (identity, version, export compliance, API URL, EAS)
const appJsonPath = join(APP, 'app.json');
let expo = {};
if (existsSync(appJsonPath)) {
  expo = readJson(appJsonPath).expo || {};
  if (expo.ios?.bundleIdentifier !== cfg.app.bundleId) fail('identity', `ios.bundleIdentifier ${expo.ios?.bundleIdentifier} ≠ ${cfg.app.bundleId}`);
  if (expo.android?.package !== cfg.app.bundleId) fail('identity', `android.package ${expo.android?.package} ≠ ${cfg.app.bundleId}`);
  if (expo.name !== cfg.app.name) warn('identity', `expo.name "${expo.name}" ≠ store name "${cfg.app.name}" (home-screen label differs from the listing)`);
  if (expo.version !== cfg.app.version) fail('D14', `expo.version ${expo.version} ≠ store version ${cfg.app.version}`);
  else pass('D14', `version ${expo.version} (asc-fill sets the ASC version string to match)`);
  const encryption = expo.ios?.config?.usesNonExemptEncryption ?? expo.ios?.infoPlist?.ITSAppUsesNonExemptEncryption;
  if (encryption === false) pass('D12', 'export compliance declared in app.json');
  else warn('D12', 'no usesNonExemptEncryption:false — every upload will ask the export-compliance question');
  if (/localhost|10\.0\.2\.2|^http:/.test(expo.extra?.apiBaseUrl || '')) warn('L8', `app.json extra.apiBaseUrl is "${expo.extra.apiBaseUrl}" — make sure the store build overrides it`);
} else warn('identity', `no ${appJsonPath} (dynamic app.config.js? check identifiers by hand)`);

const easPath = join(APP, 'eas.json');
if (existsSync(easPath)) {
  const eas = readJson(easPath);
  const prod = eas.build?.production || {};
  const env = { ...(eas.build?.[prod.extends]?.env || {}), ...(prod.env || {}) };
  const api = env.EXPO_PUBLIC_API_URL;
  if (!api) warn('L8', 'eas.json production sets no EXPO_PUBLIC_API_URL');
  else if (!/^https:\/\//.test(api) || /localhost/.test(api)) fail('L8', `production API URL "${api}" is not a public HTTPS URL`);
  else if (cfg.urls.api && api !== cfg.urls.api) fail('L8', `eas.json API ${api} ≠ store-config urls.api ${cfg.urls.api}`);
  else pass('L8', `production build talks to ${api}`);
  const ascId = eas.submit?.production?.ios?.ascAppId;
  if (cfg.apple?.appId && ascId && ascId !== cfg.apple.appId) fail('D10', `eas.json ascAppId ${ascId} ≠ store-config apple.appId ${cfg.apple.appId} — builds can never be deleted from the wrong record`);
  else if (ascId) pass('D10', `eas submit targets ASC app ${ascId}`);
  if ((prod.ios?.image || eas.build?.[prod.extends]?.ios?.image) !== 'latest') warn('D1', 'production ios.image is not "latest" — ERROR 90725 if the default image\'s SDK is below Apple\'s minimum');
  if (prod.autoIncrement !== true) warn('D13', 'production autoIncrement is off — bump build numbers by hand');
} else warn('D10', `no ${easPath}`);

// ═════════════════════════════════════════════════════════════════════════════
// 3. Permissions (X1–X3, X10, P14) — read the generated native projects when present
const plist = walk(join(APP, 'ios'), /^Info\.plist$/).find((p) => !/Pods|build|Tests/.test(p));
if (plist) {
  const xml = readFileSync(plist, 'utf8');
  const strings = [...xml.matchAll(/<key>(NS\w+UsageDescription)<\/key>\s*<string>([^<]*)<\/string>/g)];
  if (!strings.length) pass('X2', 'no iOS permission purpose strings in the built Info.plist');
  for (const [, key, text] of strings) {
    if (/\$\(PRODUCT_NAME\)|^Allow .* to access/i.test(text) || text.length < 40) fail('X2', `${key}: "${text}" reads like a library default — write purpose + a concrete example`);
    else warn('X1', `${key}: "${text}" — confirm a registered screen calls it (X1)`);
  }
} else warn('X2', 'no generated ios/…/Info.plist — run `npx expo prebuild -p ios` and re-run; purpose strings are checked on the built file');

const manifest = join(APP, 'android/app/src/main/AndroidManifest.xml');
if (existsSync(manifest)) {
  const xml = readFileSync(manifest, 'utf8');
  const perms = [...xml.matchAll(/<uses-permission[^>]*android:name="([^"]+)"([^>]*)>/g)].filter(([, , rest]) => !/tools:node="remove"/.test(rest)).map(([, p]) => p);
  const risky = perms.filter((p) => /SYSTEM_ALERT_WINDOW|EXTERNAL_STORAGE|READ_MEDIA|LOCATION|CAMERA|RECORD_AUDIO|CONTACTS|READ_PHONE|SMS|CALL_LOG|QUERY_ALL_PACKAGES|REQUEST_INSTALL_PACKAGES/.test(p));
  if (risky.length) fail('X10', `sensitive Android permissions in the manifest: ${risky.join(', ')} — block them in app.json android.blockedPermissions or justify each (X1)`);
  else pass('X10', `Android permissions: ${perms.map((p) => p.replace('android.permission.', '')).join(', ') || 'none'}`);
  if (perms.some((p) => /AD_ID/.test(p)) && cfg.declarations?.advertisingId === false) fail('P14', 'AD_ID permission present but Advertising ID declared No');
} else warn('X10', 'no generated android manifest — run `npx expo prebuild -p android` and re-run (merged-manifest check)');

// ═════════════════════════════════════════════════════════════════════════════
// 4. SDKs vs declarations (P4), duplicate React (D4), paywall strings (B1)
const pkgPath = join(APP, 'package.json');
if (existsSync(pkgPath)) {
  const pkg = readJson(pkgPath);
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  const trackers = deps.filter((d) => /firebase|analytics|sentry|segment|amplitude|appsflyer|facebook|bugsnag|datadog|posthog|mixpanel|admob|google-mobile-ads|branch/i.test(d));
  if (trackers.length && cfg.declarations?.tracking === false && cfg.declarations?.ads === false)
    warn('P4', `analytics/ads SDKs present (${trackers.join(', ')}) — declare Usage/Diagnostics data and re-check tracking`);
  else pass('P4', trackers.length ? `SDKs: ${trackers.join(', ')}` : 'no analytics / ads / crash SDKs');
}
// D4: more than one React copy crashes at the first hook. Read the lockfile, not node_modules —
// a pnpm store keeps orphaned folders from earlier installs that nothing resolves to.
const lock = ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock'].map((f) => join(APP, f)).find(existsSync)
  || ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock'].map((f) => join(ROOT, f)).find(existsSync);
if (lock) {
  const text = readFileSync(lock, 'utf8');
  const versions = (name) => new Set([...text.matchAll(new RegExp(`(?:^|[\\s("'])${name}@(\\d+\\.\\d+\\.\\d+)`, 'gm'))].map((m) => m[1]));
  for (const name of ['react', 'react-native']) {
    const v = versions(name);
    if (v.size > 1) fail('D4', `${basename(lock)} resolves ${v.size} ${name} versions (${[...v].join(', ')}) — pin one (pnpm overrides / npm overrides)`);
    else pass('D4', `one ${name} version in ${basename(lock)}${v.size ? ` (${[...v][0]})` : ''}`);
  }
}
const src = [...walk(join(APP, 'app'), /\.(tsx?|jsx?)$/), ...walk(join(APP, 'src'), /\.(tsx?|jsx?)$/)];
// Only user-visible text: string literals and JSX text — not identifiers like queue.subscribe().
const BUY = /\b(subscribe now|subscribe to|upgrade to|buy now|per month|\/month|pricing plan|in-app purchase|unlock premium)\b/i;
const visible = (code) => [...code.matchAll(/(['"`])((?:(?!\1)[^\n\\]|\\.)*)\1|>([^<>{}\n]+)</g)].map((m) => m[2] ?? m[3] ?? '');
const paywall = src.filter((f) => visible(readFileSync(f, 'utf8')).some((t) => BUY.test(t)));
if (paywall.length && cfg.money !== 'iap') fail('B1', `purchase-like UI strings in: ${paywall.map((f) => f.replace(APP + '/', '')).join(', ')}`);
else pass('B1', 'no purchase / subscription UI strings in the app source');

// ═════════════════════════════════════════════════════════════════════════════
// 5. Fonts (D15): every bundled font file needs its own PostScript name
const fonts = walk(APP, /\.(ttf|otf)$/i).filter((f) => !/node_modules|\/ios\/|\/android\//.test(f));
const psNames = new Map();
for (const f of fonts) {
  const ps = postscriptName(f);
  if (psNames.has(ps)) fail('D15', `${basename(f)} and ${basename(psNames.get(ps))} share PostScript name "${ps}" — iOS will render them as one weight`);
  else psNames.set(ps, f);
}
if (fonts.length && results.every((r) => r.row !== 'D15')) pass('D15', `${fonts.length} bundled fonts, unique PostScript names`);

// ═════════════════════════════════════════════════════════════════════════════
// 6. Icons, feature graphic, screenshots (D2, S1, S4–S6)
const shotRules = {
  APP_IPHONE_67: [[1260, 2736], [1290, 2796], [1320, 2868]],
  APP_IPHONE_65: [[1284, 2778], [1242, 2688]],
  APP_IPAD_PRO_3GEN_129: [[2064, 2752], [2048, 2732]],
};
const check = (row, file, fn) => { try { fn(png(file)); } catch (e) { fail(row, e.message); } };
const iconPath = resolve(APP, expo.icon || 'assets/icon.png');
if (existsSync(iconPath)) check('D2', iconPath, (p) => (p.alpha || p.w !== 1024 || p.h !== 1024)
  ? fail('D2', `app icon ${p.w}×${p.h}${p.alpha ? ' has alpha' : ''} — Apple needs 1024² with no alpha`) : pass('D2', 'app icon 1024², no alpha'));
if (cfg.play?.icon) check('S5', resolve(cfg._dir, cfg.play.icon), (p) => (p.w !== 512 || p.h !== 512 || p.bytes > 1024 * 1024)
  ? fail('S5', `Play icon ${p.w}×${p.h}, ${(p.bytes / 1024).toFixed(0)} KB — needs 512², ≤1 MB`) : pass('S5', 'Play icon 512²'));
if (cfg.play?.featureGraphic) check('S5', resolve(cfg._dir, cfg.play.featureGraphic), (p) => (p.w !== 1024 || p.h !== 500 || p.alpha)
  ? fail('S5', `feature graphic ${p.w}×${p.h}${p.alpha ? ' with alpha' : ''} — needs 1024×500, no alpha`) : pass('S5', 'feature graphic 1024×500, no alpha'));

for (const [type, folder] of Object.entries(cfg.apple?.screenshots || {})) {
  const dir = resolve(cfg._dir, folder);
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => /\.png$/i.test(f) && !f.startsWith('._')) : [];
  if (!files.length) { fail('S6', `${type}: no screenshots in ${folder}`); continue; }
  if (files.length > 10) fail('S6', `${type}: ${files.length} shots (max 10)`);
  for (const f of files) check('S6', join(dir, f), (p) => {
    if (!shotRules[type]?.some(([w, h]) => (p.w === w && p.h === h) || (p.w === h && p.h === w))) fail('S6', `${folder}/${f}: ${p.w}×${p.h} is not a ${type} size`);
    if (p.alpha) fail('S6', `${folder}/${f}: has alpha`);
  });
}
for (const [type, folder] of Object.entries(cfg.play?.screenshots || {})) {
  const dir = resolve(cfg._dir, folder);
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => /\.png$/i.test(f) && !f.startsWith('._')) : [];
  const min = /Inch/.test(type) ? 4 : 2;
  if (files.length < min || files.length > 8) fail('S4', `${type}: ${files.length} shots (needs ${min}–8)`);
  for (const f of files) check('S5', join(dir, f), (p) => {
    const long = Math.max(p.w, p.h); const short = Math.min(p.w, p.h);
    if (Math.abs(long / short - 16 / 9) > 0.01) fail('S5', `${folder}/${f}: ${p.w}×${p.h} is not 9:16 / 16:9`);
    if (short < 1080 && /Inch/.test(type)) warn('S5', `${folder}/${f}: tablet shot under 1080 px`);
    if (p.alpha) fail('S5', `${folder}/${f}: has alpha (screencap writes RGBA — flatten)`);
    if (p.bytes > 8e6) fail('S5', `${folder}/${f}: over 8 MB`);
  });
}
if (!results.some((r) => /S[456]/.test(r.row) && r.level === 'FAIL')) pass('S4-S6', 'screenshot sets: sizes, counts, alpha, aspect');

// ═════════════════════════════════════════════════════════════════════════════
// 7. Live URLs (M1–M4, A2) and the production API (L8)
async function get(url) {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
  return { status: res.status, body: await res.text(), url: res.url };
}
if (!OFFLINE) {
  for (const [key, url] of Object.entries(cfg.urls || {})) {
    if (!url || key === 'api') continue;
    try {
      const r = await get(url);
      const text = r.body.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ');
      if (r.status >= 400) { liveGate('M1', `${key} ${url} → HTTP ${r.status}`); continue; }
      if (text.trim().length < 400) liveGate('M3', `${key} ${url} renders almost no text without JavaScript (SPA shell?)`);
      else if (key === 'privacy' && !/\bapp\b/i.test(text)) liveGate('M2', `privacy page never mentions the app`);
      else if ((key === 'accountDeletion' || key === 'privacyChoices') && !/delet/i.test(text)) liveGate('A2', `${key} page never says "delete"`);
      else pass('M1', `${key} live and server-rendered`);
      if (key === 'privacy' && !url.endsWith('/') && !/\.html?$/.test(url)) warn('M3', 'privacy URL without trailing slash may redirect — give stores the final URL');
    } catch (e) { liveGate('M1', `${key} ${url} unreachable (${e.cause?.code || e.message})`); }
  }
  if (cfg.urls?.api) {
    try { const r = await get(cfg.urls.api); pass('L8', `API ${cfg.urls.api} answers (HTTP ${r.status})`); }
    catch (e) { liveGate('L8', `production API ${cfg.urls.api} unreachable (${e.cause?.code || e.message})`); }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
const order = { FAIL: 0, WARN: 1, PASS: 2 };
results.sort((a, b) => order[a.level] - order[b.level]);
const icon = { FAIL: '✗', WARN: '!', PASS: '✓' };
for (const r of results) console.log(`${icon[r.level]} ${r.level.padEnd(4)} ${r.row.padEnd(6)} ${r.msg}`);
const n = (l) => results.filter((r) => r.level === l).length;
console.log(`\n${n('FAIL')} fail · ${n('WARN')} warn · ${n('PASS')} pass  (stage: ${SUBMIT ? 'submit' : 'setup'})`);
console.log('Manual rows still to confirm (rejection-catalogue.md): P1–P3 declarations match code, X1 reachability, L2 reviewer login on production, E1/E2 reviewer notes, S7 contact-sheet review.');
process.exit(n('FAIL') ? 1 : 0);
