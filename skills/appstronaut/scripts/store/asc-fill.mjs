#!/usr/bin/env node
// Fill every App Store Connect form the public API reaches, from store-config.json.
//
//   node asc-fill.mjs [--config store-assets/store-config.json] [--apply] [--only a,b] [--screenshots]
//
// Dry run by default: reads current state and prints what it WOULD change. --apply writes.
// Steps (use --only to run a subset): bundle, app, info, age, version, listing, price,
// availability, review, screenshots (screenshots also need --screenshots — they replace the set).
//
// Not reachable through the public API (browser, see console-browser.md): creating the app
// record, App Privacy. Never done here: submitting for review.
//
// Env: ASC_KEY_ID, ASC_ISSUER_ID, [ASC_KEY_FILE], [REVIEW_DEMO_PASSWORD]

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { asc, loadConfig, readRef, listingField, log, plan } from './lib.mjs';

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f) => { const i = args.indexOf(f); return i === -1 ? undefined : args[i + 1]; };
const APPLY = flag('--apply');
const ONLY = opt('--only')?.split(',');
const want = (step) => !ONLY || ONLY.includes(step);

const cfg = loadConfig(opt('--config'));
const A = cfg.apple;
const failures = [];

async function step(name, fn) {
  if (!want(name)) return;
  log(`\n▸ ${name}`);
  try { await fn(); } catch (e) { failures.push(name); log(`  ✗ ${e.message.split('\n').join('\n    ')}`); }
}

const one = (res) => (Array.isArray(res.data) ? res.data[0] : res.data);
let app, appInfo, version, versionLoc;

// ── bundle ID ───────────────────────────────────────────────────────────────
await step('bundle', async () => {
  const found = one(await asc('GET', `/v1/bundleIds?filter[identifier]=${cfg.app.bundleId}&limit=1`));
  if (found) return log(`  ✓ ${cfg.app.bundleId} registered (${found.id})`);
  plan(!APPLY, `register bundle ID ${cfg.app.bundleId} (explicit, no capabilities) — PERMANENT`);
  if (APPLY) await asc('POST', '/v1/bundleIds', { data: { type: 'bundleIds',
    attributes: { identifier: cfg.app.bundleId, name: cfg.app.name.replace(/[^A-Za-z0-9 ]/g, ''), platform: 'IOS' } } });
});

// ── app record (must already exist — created in the browser) ─────────────────
await step('app', async () => {
  app = one(await asc('GET', `/v1/apps?filter[bundleId]=${cfg.app.bundleId}&limit=1`));
  if (!app) throw new Error(`No App Store Connect app for ${cfg.app.bundleId}. Create the record in the browser (console-browser.md → Apple 1), then re-run.`);
  if (A.appId && A.appId !== app.id) throw new Error(`store-config apple.appId ${A.appId} ≠ app found for the bundle ID (${app.id})`);
  log(`  ✓ ${app.attributes.name} (${app.id})`);
  const rights = A.contentRights || 'DOES_NOT_USE_THIRD_PARTY_CONTENT';
  if (app.attributes.contentRightsDeclaration !== rights) {
    plan(!APPLY, `content rights → ${rights}`);
    if (APPLY) await asc('PATCH', `/v1/apps/${app.id}`, { data: { type: 'apps', id: app.id, attributes: { contentRightsDeclaration: rights } } });
  }
});
if (!app) { log('\nStopping: the app record is required for every later step.'); process.exit(1); }

// ── App Information: categories + localized name / subtitle / privacy URLs ──
await step('info', async () => {
  const infos = (await asc('GET', `/v1/apps/${app.id}/appInfos`)).data;
  appInfo = infos.find((i) => !['READY_FOR_DISTRIBUTION', 'READY_FOR_SALE'].includes(i.attributes.appStoreState || i.attributes.state)) || infos[0];
  const rel = {};
  if (A.primaryCategory) rel.primaryCategory = { data: { type: 'appCategories', id: A.primaryCategory } };
  if (A.secondaryCategory) rel.secondaryCategory = { data: { type: 'appCategories', id: A.secondaryCategory } };
  plan(!APPLY, `categories → ${A.primaryCategory} / ${A.secondaryCategory || '—'}`);
  if (APPLY) await asc('PATCH', `/v1/appInfos/${appInfo.id}`, { data: { type: 'appInfos', id: appInfo.id, relationships: rel } });

  const md = readRef(cfg, A.listingFile);
  const locs = (await asc('GET', `/v1/appInfos/${appInfo.id}/appInfoLocalizations`)).data;
  const loc = locs.find((l) => l.attributes.locale === A.primaryLocale) || locs[0];
  const attrs = {
    name: cfg.app.name,
    subtitle: listingField(md, 'Subtitle'),
    privacyPolicyUrl: cfg.urls.privacy,
    privacyChoicesUrl: cfg.urls.privacyChoices,
  };
  const changed = Object.fromEntries(Object.entries(attrs).filter(([k, v]) => v && loc.attributes[k] !== v));
  if (!Object.keys(changed).length) return log(`  ✓ ${loc.attributes.locale} app info already matches`);
  plan(!APPLY, `app info (${loc.attributes.locale}): ${Object.keys(changed).join(', ')}`);
  if (APPLY) await asc('PATCH', `/v1/appInfoLocalizations/${loc.id}`, { data: { type: 'appInfoLocalizations', id: loc.id, attributes: changed } });
});

// ── Age rating: every question NONE / false unless overridden ───────────────
// Only attributes the API returns are sent, so questions Apple adds or retires never break this.
const AGE_ENUM = new Set(['alcoholTobaccoOrDrugUseOrReferences', 'contests', 'gamblingSimulated', 'gunsOrOtherWeapons',
  'horrorOrFearThemes', 'matureOrSuggestiveThemes', 'medicalOrTreatmentInformation', 'profanityOrCrudeHumor',
  'sexualContentGraphicAndNudity', 'sexualContentOrNudity', 'violenceCartoonOrFantasy', 'violenceRealistic',
  'violenceRealisticProlongedGraphicOrSadistic']);
await step('age', async () => {
  if (!appInfo) appInfo = (await asc('GET', `/v1/apps/${app.id}/appInfos`)).data[0];
  const decl = one(await asc('GET', `/v1/appInfos/${appInfo.id}/ageRatingDeclaration`));
  const desired = {};
  for (const [k, v] of Object.entries(decl.attributes)) {
    if (k in (A.ageRating || {})) desired[k] = A.ageRating[k];
    else if (AGE_ENUM.has(k)) desired[k] = 'NONE';
    else if (typeof v === 'boolean' || (v === null && /^(gambling|lootBox|unrestrictedWebAccess|messagingAndChat|parentalControls|ageAssurance|advertising|userGeneratedContent|healthOrWellnessTopics)$/.test(k))) desired[k] = false;
  }
  const changed = Object.fromEntries(Object.entries(desired).filter(([k, v]) => decl.attributes[k] !== v));
  if (!Object.keys(changed).length) return log('  ✓ age rating answers already set');
  plan(!APPLY, `age rating: ${Object.keys(changed).length} answers → NONE/false${A.ageRating && Object.keys(A.ageRating).length ? ' (+ overrides)' : ''}`);
  if (APPLY) await asc('PATCH', `/v1/ageRatingDeclarations/${decl.id}`, { data: { type: 'ageRatingDeclarations', id: decl.id, attributes: changed } });
});

// ── Version: version string, copyright, manual release ──────────────────────
await step('version', async () => {
  const vers = (await asc('GET', `/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&limit=10`)).data;
  version = vers.find((v) => ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED'].includes(v.attributes.appStoreState));
  if (!version) throw new Error(`No editable iOS version (states: ${vers.map((v) => `${v.attributes.versionString}:${v.attributes.appStoreState}`).join(', ')})`);
  const attrs = { versionString: cfg.app.version, copyright: A.copyright, releaseType: A.releaseType || 'MANUAL' };
  const changed = Object.fromEntries(Object.entries(attrs).filter(([k, v]) => v && version.attributes[k] !== v));
  if (!Object.keys(changed).length) return log(`  ✓ version ${version.attributes.versionString} already matches`);
  plan(!APPLY, `version ${version.attributes.versionString}: ${Object.entries(changed).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  if (APPLY) await asc('PATCH', `/v1/appStoreVersions/${version.id}`, { data: { type: 'appStoreVersions', id: version.id, attributes: changed } });
});

async function loadVersionLoc() {
  if (versionLoc) return versionLoc;
  if (!version) throw new Error('version step did not find an editable version');
  const locs = (await asc('GET', `/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`)).data;
  return (versionLoc = locs.find((l) => l.attributes.locale === A.primaryLocale) || locs[0]);
}

// ── Version listing: description, keywords, promo text, URLs ────────────────
await step('listing', async () => {
  const md = readRef(cfg, A.listingFile);
  const loc = await loadVersionLoc();
  const attrs = {
    description: listingField(md, 'Description'),
    keywords: listingField(md, 'Keywords'),
    promotionalText: listingField(md, 'Promotional text'),
    supportUrl: cfg.urls.support,
    marketingUrl: cfg.urls.marketing,
  };
  for (const [k, v] of Object.entries(attrs)) if (!v) throw new Error(`listing field "${k}" missing from ${A.listingFile}`);
  const changed = Object.fromEntries(Object.entries(attrs).filter(([k, v]) => loc.attributes[k] !== v));
  if (!Object.keys(changed).length) return log(`  ✓ ${loc.attributes.locale} listing already matches`);
  plan(!APPLY, `listing (${loc.attributes.locale}): ${Object.keys(changed).join(', ')}`);
  if (APPLY) await asc('PATCH', `/v1/appStoreVersionLocalizations/${loc.id}`, { data: { type: 'appStoreVersionLocalizations', id: loc.id, attributes: changed } });
});

// ── Price: free ─────────────────────────────────────────────────────────────
await step('price', async () => {
  let existing = null;
  try { existing = one(await asc('GET', `/v1/apps/${app.id}/appPriceSchedule?include=manualPrices`)); } catch (e) { if (e.status !== 404) throw e; }
  if (existing?.relationships?.manualPrices?.data?.length) return log('  ✓ price schedule already set (not changing an existing price)');
  const points = (await asc('GET', `/v1/apps/${app.id}/appPricePoints?filter[territory]=USA&limit=200`)).data;
  const free = points.find((p) => Number(p.attributes.customerPrice) === 0);
  if (!free) throw new Error('No USD 0.00 price point found');
  plan(!APPLY, 'price → Free (USD 0.00 base, all territories follow)');
  if (APPLY) await asc('POST', '/v1/appPriceSchedules', {
    data: { type: 'appPriceSchedules', relationships: {
      app: { data: { type: 'apps', id: app.id } },
      baseTerritory: { data: { type: 'territories', id: 'USA' } },
      manualPrices: { data: [{ type: 'appPrices', id: '${free}' }] } } },
    included: [{ type: 'appPrices', id: '${free}', attributes: { startDate: null },
      relationships: { appPricePoint: { data: { type: 'appPricePoints', id: free.id } } } }],
  });
});

// ── Availability: all countries or a list ───────────────────────────────────
await step('availability', async () => {
  try {
    const cur = one(await asc('GET', `/v1/apps/${app.id}/appAvailabilityV2`));
    if (cur) return log('  ✓ availability already set (change it in the console if the country list must change)');
  } catch (e) { if (e.status !== 404) throw e; }
  let territories = [];
  let url = '/v1/territories?limit=200';
  while (url) { const page = await asc('GET', url); territories.push(...page.data); url = page.links?.next?.replace('https://api.appstoreconnect.apple.com', ''); }
  const list = cfg.availability.countries;
  if (Array.isArray(list)) {
    const iso3 = new Set(list.map((c) => c.toUpperCase())); // ASC territory ids are ISO 3166-1 alpha-3
    territories = territories.filter((t) => iso3.has(t.id));
  }
  plan(!APPLY, `availability → ${territories.length} territories, new territories: ${list === 'all'}`);
  if (APPLY) await asc('POST', '/v2/appAvailabilities', {
    data: { type: 'appAvailabilities', attributes: { availableInNewTerritories: list === 'all' },
      relationships: { app: { data: { type: 'apps', id: app.id } },
        territoryAvailabilities: { data: territories.map((t) => ({ type: 'territoryAvailabilities', id: `\${t-${t.id}}` })) } } },
    included: territories.map((t) => ({ type: 'territoryAvailabilities', id: `\${t-${t.id}}`, attributes: { available: true },
      relationships: { territory: { data: { type: 'territories', id: t.id } } } })),
  });
});

// ── App Review Information: contact, demo login, notes (no build needed via API) ──
function reviewNotes() {
  const md = readRef(cfg, cfg.reviewer.notesFile);
  const at = md.search(/^##\s+Apple\b/mi);
  if (at === -1) throw new Error(`No "## Apple" section in ${cfg.reviewer.notesFile}`);
  const rest = md.slice(at).split('\n').slice(1).join('\n');
  const end = rest.search(/^##\s/m);
  return (end === -1 ? rest : rest.slice(0, end)).replace(/^```[a-z]*\n?|```$/gm, '').trim();
}
await step('review', async () => {
  if (!version) throw new Error('version step did not find an editable version');
  const notes = reviewNotes();
  const placeholders = notes.match(/<[A-Z][A-Z_ —-]*[A-Za-z]*>/g);
  if (placeholders) throw new Error(`reviewer notes still contain placeholders: ${[...new Set(placeholders)].join(', ')} — fill them in ${cfg.reviewer.notesFile}`);
  if (/^Sign-in fields:/m.test(notes)) throw new Error('reviewer notes start with an instruction line meant for the human — remove it');
  if (notes.length > 4000) throw new Error(`reviewer notes are ${notes.length} chars (max 4000)`);
  const login = cfg.reviewer.logins?.[0];
  const password = process.env.REVIEW_DEMO_PASSWORD;
  const attrs = {
    contactFirstName: cfg.contact.firstName, contactLastName: cfg.contact.lastName,
    contactPhone: cfg.contact.phone, contactEmail: cfg.contact.email,
    demoAccountRequired: Boolean(login), demoAccountName: login?.user, notes,
    ...(password ? { demoAccountPassword: password } : {}),
  };
  for (const k of ['contactFirstName', 'contactLastName', 'contactPhone', 'contactEmail']) if (!attrs[k]) throw new Error(`contact.${k.replace('contact', '').replace(/^./, (c) => c.toLowerCase())} missing in store-config`);
  let detail = null;
  try { detail = one(await asc('GET', `/v1/appStoreVersions/${version.id}/appStoreReviewDetail`)); } catch (e) { if (e.status !== 404) throw e; }
  plan(!APPLY, `review details: contact ${attrs.contactEmail}, demo ${attrs.demoAccountName || '—'}, password ${password ? 'from env' : 'NOT SET — human enters it'}, notes ${notes.length} chars`);
  if (!APPLY) return;
  if (detail) await asc('PATCH', `/v1/appStoreReviewDetails/${detail.id}`, { data: { type: 'appStoreReviewDetails', id: detail.id, attributes: attrs } });
  else await asc('POST', '/v1/appStoreReviewDetails', { data: { type: 'appStoreReviewDetails', attributes: attrs,
    relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } } } });
});

// ── Screenshots: replace each display type's set, in file order ─────────────
async function uploadScreenshot(setId, file) {
  const bytes = readFileSync(file);
  const shot = (await asc('POST', '/v1/appScreenshots', { data: { type: 'appScreenshots',
    attributes: { fileName: file.split('/').pop(), fileSize: bytes.length },
    relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: setId } } } } })).data;
  for (const op of shot.attributes.uploadOperations) {
    const headers = Object.fromEntries((op.requestHeaders || []).map((h) => [h.name, h.value]));
    const res = await fetch(op.url, { method: op.method, headers, body: bytes.subarray(op.offset, op.offset + op.length) });
    if (!res.ok) throw new Error(`upload part failed for ${file}: ${res.status}`);
  }
  await asc('PATCH', `/v1/appScreenshots/${shot.id}`, { data: { type: 'appScreenshots', id: shot.id,
    attributes: { uploaded: true, sourceFileChecksum: createHash('md5').update(bytes).digest('hex') } } });
}
await step('screenshots', async () => {
  if (!flag('--screenshots')) return log('  (skipped — pass --screenshots to replace the screenshot sets)');
  const loc = await loadVersionLoc();
  const sets = (await asc('GET', `/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets?include=appScreenshots&limit=50`)).data;
  for (const [displayType, folder] of Object.entries(A.screenshots || {})) {
    const dir = resolve(cfg._dir, folder);
    const files = readdirSync(dir).filter((f) => /\.png$/i.test(f) && !f.startsWith('._')).sort().map((f) => join(dir, f));
    if (!files.length) throw new Error(`no PNGs in ${folder}`);
    if (files.length > 10) throw new Error(`${folder} has ${files.length} shots (max 10)`);
    let set = sets.find((s) => s.attributes.screenshotDisplayType === displayType);
    const existing = set?.relationships?.appScreenshots?.data || [];
    plan(!APPLY, `${displayType}: replace ${existing.length} with ${files.length} from ${folder} (${(files.reduce((n, f) => n + statSync(f).size, 0) / 1e6).toFixed(1)} MB)`);
    if (!APPLY) continue;
    if (!set) set = (await asc('POST', '/v1/appScreenshotSets', { data: { type: 'appScreenshotSets', attributes: { screenshotDisplayType: displayType },
      relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: loc.id } } } } })).data;
    for (const s of existing) await asc('DELETE', `/v1/appScreenshots/${s.id}`);
    for (const f of files) await uploadScreenshot(set.id, f);
  }
});

log(`\n${APPLY ? 'Applied' : 'Dry run — nothing changed. Re-run with --apply to write.'}${failures.length ? `  Failed steps: ${failures.join(', ')}` : ''}`);
log('Browser-only (console-browser.md): App Privacy, and creating the app record. Human-only: final Submit.');
process.exit(failures.length ? 1 : 0);
