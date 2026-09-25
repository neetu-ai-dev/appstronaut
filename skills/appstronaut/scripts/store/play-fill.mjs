#!/usr/bin/env node
// Fill the Google Play forms the Publishing API reaches, from store-config.json.
//
//   node play-fill.mjs [--config store-assets/store-config.json] [--apply] [--only a,b] [--images]
//
// Dry run by default: stages the changes in a Play edit, validates it, then discards it.
// --apply commits (never "sends for review" on a draft app). Steps: details, listing, images
// (images also need --images — they replace every image of each type), datasafety.
//
// Console-only (browser, see console-browser.md): creating the app, category, privacy policy URL,
// Ads, content rating (IARC), target audience, App access, Advertising ID, government / financial /
// health, countries. Data safety goes through the API only when a CSV exported from the console
// exists (play.dataSafetyCsv).
//
// Env: PLAY_KEY_FILE (service-account JSON, invited under Users and permissions)

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { play, playApi, playUpload, withPlayEdit, loadConfig, readRef, listingField, log, plan } from './lib.mjs';

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f) => { const i = args.indexOf(f); return i === -1 ? undefined : args[i + 1]; };
const APPLY = flag('--apply');
const ONLY = opt('--only')?.split(',');
const want = (step) => !ONLY || ONLY.includes(step);

const cfg = loadConfig(opt('--config'));
const P = cfg.play;
const PKG = cfg.app.bundleId;
const API = playApi(PKG);
const UPLOAD = playUpload(PKG);
const LANG = P.defaultLanguage;
const failures = [];

const pngs = (folder) => {
  const dir = resolve(cfg._dir, folder);
  return readdirSync(dir).filter((f) => /\.(png|jpe?g)$/i.test(f) && !f.startsWith('._')).sort().map((f) => join(dir, f));
};

await withPlayEdit(PKG, async (edit) => {
  const E = `${API}/edits/${edit}`;

  if (want('details')) {
    log('\n▸ details');
    try {
      const cur = await play('GET', `${E}/details`);
      const desired = { defaultLanguage: LANG, contactEmail: cfg.contact.email, contactWebsite: cfg.urls.marketing, ...(cfg.contact.phone ? { contactPhone: cfg.contact.phone } : {}) };
      const changed = Object.keys(desired).filter((k) => cur[k] !== desired[k]);
      if (!changed.length) log('  ✓ contact details already match');
      else { plan(!APPLY, `details: ${changed.join(', ')}`); await play('PATCH', `${E}/details`, desired); }
    } catch (e) { failures.push('details'); log(`  ✗ ${e.message}`); }
  }

  if (want('listing')) {
    log(`\n▸ listing (${LANG})`);
    try {
      const md = readRef(cfg, P.listingFile);
      const desired = {
        language: LANG,
        title: cfg.app.name,
        shortDescription: listingField(md, 'Short description'),
        fullDescription: listingField(md, 'Full description'),
      };
      for (const [k, v] of Object.entries(desired)) if (!v) throw new Error(`"${k}" missing from ${P.listingFile}`);
      if ([...desired.title].length > 30) throw new Error(`title is ${[...desired.title].length} chars (max 30)`);
      if ([...desired.shortDescription].length > 80) throw new Error('short description > 80 chars');
      if ([...desired.fullDescription].length > 4000) throw new Error('full description > 4000 chars');
      let cur = {};
      try { cur = await play('GET', `${E}/listings/${LANG}`); } catch { /* no listing yet */ }
      const changed = ['title', 'shortDescription', 'fullDescription'].filter((k) => cur[k] !== desired[k]);
      if (!changed.length) log('  ✓ listing already matches');
      else { plan(!APPLY, `listing: ${changed.join(', ')} (title "${desired.title}")`); await play('PUT', `${E}/listings/${LANG}`, desired); }
    } catch (e) { failures.push('listing'); log(`  ✗ ${e.message}`); }
  }

  if (want('images')) {
    log('\n▸ images');
    if (!flag('--images')) log('  (skipped — pass --images to replace icon, feature graphic and screenshots)');
    else {
      const jobs = [
        ['icon', [resolve(cfg._dir, P.icon)]],
        ['featureGraphic', [resolve(cfg._dir, P.featureGraphic)]],
        ...Object.entries(P.screenshots || {}).map(([type, folder]) => [type, pngs(folder)]),
      ];
      for (const [type, files] of jobs) {
        try {
          if (!files.length || !files.every(existsSync)) throw new Error(`files missing for ${type}`);
          if (/Screenshots$/.test(type) && files.length > 8) throw new Error(`${type}: ${files.length} shots (max 8)`);
          plan(!APPLY, `${type}: replace with ${files.length} file(s)`);
          if (!APPLY) continue; // a dry run checks the files; uploading into a discarded edit is wasted bandwidth
          await play('DELETE', `${E}/listings/${LANG}/${type}`).catch(() => {});
          for (const f of files) {
            const mime = /\.png$/i.test(f) ? 'image/png' : 'image/jpeg';
            await play('POST', `${UPLOAD}/edits/${edit}/listings/${LANG}/${type}?uploadType=media`, readFileSync(f), mime);
          }
        } catch (e) { failures.push(`images:${type}`); log(`  ✗ ${e.message}`); }
      }
    }
  }
}, { commit: APPLY });

// Data safety is outside edits: it posts a CSV in the exact format the console exports
// (Policy → App content → Data safety → Export to CSV). Fill the answers in that file once.
if (want('datasafety')) {
  log('\n▸ data safety');
  if (!P.dataSafetyCsv) log('  (no play.dataSafetyCsv — fill Data safety in the browser, console-browser.md → Play 7)');
  else {
    try {
      const csv = readRef(cfg, P.dataSafetyCsv);
      plan(!APPLY, `data safety ← ${P.dataSafetyCsv} (${csv.split('\n').length} rows)`);
      if (APPLY) await play('POST', `${API}/dataSafety`, { safetyLabels: csv });
    } catch (e) { failures.push('datasafety'); log(`  ✗ ${e.message}`); }
  }
}

log(`\n${APPLY ? 'Committed (not sent for review).' : 'Dry run — edit validated and discarded. Re-run with --apply.'}${failures.length ? `  Failed: ${failures.join(', ')}` : ''}`);
log('Console-only (console-browser.md): category, privacy URL, Ads, IARC, target audience, App access, Advertising ID, gov/financial/health, countries.');
process.exit(failures.length ? 1 : 0);
