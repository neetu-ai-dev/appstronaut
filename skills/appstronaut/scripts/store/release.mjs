#!/usr/bin/env node
// One command: preflight → fill both stores → upload builds → submit for review.
//
//   node release.mjs --ipa path/app.ipa --aab path/app.aab [--config …] [--submit] [--ios-only|--android-only]
//
// Without --submit (or store-config "autoSubmit": true) it stops after uploading and prints
// what the submit would do. Submission is refused unless `preflight.mjs --stage submit` passes —
// an automatic submit into a guaranteed rejection is worse than no submit.
//
// Google rules this cannot bypass (brand-new app only, once): the very first AAB must be uploaded
// in Play Console, and the first release rolled out there. After that, --submit sends Play
// releases for review automatically. Apple has no such rule.
//
// Env: ASC_KEY_ID, ASC_ISSUER_ID, [ASC_KEY_FILE], PLAY_KEY_FILE, [REVIEW_DEMO_PASSWORD]

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { asc, play, playApi, playUpload, withPlayEdit, loadConfig, log } from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (f) => { const i = args.indexOf(f); return i === -1 ? undefined : args[i + 1]; };
const configPath = opt('--config') || 'store-assets/store-config.json';
const cfg = loadConfig(configPath);
const SUBMIT = args.includes('--submit') || cfg.autoSubmit === true;
const DO_IOS = !args.includes('--android-only');
const DO_ANDROID = !args.includes('--ios-only');
const IPA = opt('--ipa'); const AAB = opt('--aab');
const node = (script, extra = []) => spawnSync(process.execPath, [join(HERE, script), '--config', configPath, ...extra], { stdio: 'inherit' }).status;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 1. Preflight gate ───────────────────────────────────────────────────────
log(`\n═══ 1. preflight (${SUBMIT ? 'submit' : 'setup'} stage)`);
if (node('preflight.mjs', ['--stage', SUBMIT ? 'submit' : 'setup']) !== 0) {
  log(SUBMIT ? '\n✗ Preflight failed — nothing uploaded, nothing submitted. Fix the FAIL rows and re-run.'
             : '\n✗ Preflight failed — fix the FAIL rows first.');
  process.exit(1);
}

// ── 2. Apple ────────────────────────────────────────────────────────────────
if (DO_IOS) {
  log('\n═══ 2. Apple');
  if (!IPA || !existsSync(IPA)) throw new Error('--ipa <path> required for iOS');
  const plist = execFileSync('/bin/sh', ['-c', `unzip -p "${IPA}" 'Payload/*.app/Info.plist' | plutil -convert json -o - -`]).toString();
  const { CFBundleShortVersionString: version, CFBundleVersion: buildNumber, CFBundleIdentifier: bundle } = JSON.parse(plist);
  if (bundle !== cfg.app.bundleId) throw new Error(`ipa bundle ${bundle} ≠ ${cfg.app.bundleId}`);
  if (version !== cfg.app.version) throw new Error(`ipa version ${version} ≠ store version ${cfg.app.version}`);
  log(`  ipa: ${bundle} ${version} (${buildNumber})`);

  const auth = ['--apiKey', process.env.ASC_KEY_ID, '--apiIssuer', process.env.ASC_ISSUER_ID];
  // altool only looks for AuthKey_<id>.p8 in ./private_keys, ~/private_keys, ~/.private_keys and
  // ~/.appstoreconnect/private_keys unless API_PRIVATE_KEYS_DIR points at the key's folder.
  const keyFile = process.env.ASC_KEY_PATH || process.env.ASC_KEY_FILE;
  if (!process.env.API_PRIVATE_KEYS_DIR && keyFile) process.env.API_PRIVATE_KEYS_DIR = dirname(keyFile);
  const appId = cfg.apple.appId;
  const existing = await asc('GET', `/v1/builds?filter[app]=${appId}&filter[version]=${buildNumber}&filter[preReleaseVersion.version]=${version}&limit=1`);
  if (!existing.data.length) {
    // Only before the first upload: once the build number is used, altool refuses it as a duplicate.
    log('  validating with altool (catches SDK / signing refusals eas submit hides)…');
    execFileSync('xcrun', ['altool', '--validate-app', '-f', IPA, '-t', 'ios', ...auth], { stdio: 'inherit' });
    log('  uploading…');
    execFileSync('xcrun', ['altool', '--upload-app', '-f', IPA, '-t', 'ios', ...auth], { stdio: 'inherit' });
  } else log('  build already uploaded');

  log('  waiting for Apple to process the build (usually 5–30 min)…');
  let build;
  for (let i = 0; i < 90; i++) {
    build = (await asc('GET', `/v1/builds?filter[app]=${appId}&filter[version]=${buildNumber}&filter[preReleaseVersion.version]=${version}&limit=1`)).data[0];
    const state = build?.attributes.processingState;
    if (state === 'VALID') break;
    if (state === 'INVALID' || state === 'FAILED') throw new Error(`build ${buildNumber} processing ${state} — check App Store Connect email`);
    await sleep(60_000);
  }
  if (build?.attributes.processingState !== 'VALID') throw new Error('build not processed after 90 min');
  log(`  ✓ build ${buildNumber} processed`);

  log('  filling App Store Connect (listing, review details, screenshots)…');
  if (node('asc-fill.mjs', ['--apply', '--screenshots']) !== 0) throw new Error('asc-fill failed — not submitting');

  const version_ = (await asc('GET', `/v1/apps/${appId}/appStoreVersions?filter[versionString]=${version}&filter[platform]=IOS&limit=1`)).data[0];
  await asc('PATCH', `/v1/appStoreVersions/${version_.id}/relationships/build`, { data: { type: 'builds', id: build.id } });
  log(`  ✓ build ${buildNumber} attached to ${version}`);

  if (!SUBMIT) log('  (not submitted — pass --submit or set store-config "autoSubmit": true)');
  else {
    const sub = (await asc('POST', '/v1/reviewSubmissions', { data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' },
      relationships: { app: { data: { type: 'apps', id: appId } } } } })).data;
    await asc('POST', '/v1/reviewSubmissionItems', { data: { type: 'reviewSubmissionItems', relationships: {
      reviewSubmission: { data: { type: 'reviewSubmissions', id: sub.id } },
      appStoreVersion: { data: { type: 'appStoreVersions', id: version_.id } } } } });
    await asc('PATCH', `/v1/reviewSubmissions/${sub.id}`, { data: { type: 'reviewSubmissions', id: sub.id, attributes: { submitted: true } } });
    log(`  ✅ SUBMITTED iOS ${version} (${buildNumber}) for review — submission ${sub.id}`);
  }
}

// ── 3. Google Play ──────────────────────────────────────────────────────────
if (DO_ANDROID) {
  log('\n═══ 3. Google Play');
  if (!AAB || !existsSync(AAB)) throw new Error('--aab <path> required for Android');
  log('  filling Play (listing, graphics)…');
  if (node('play-fill.mjs', ['--apply', '--images']) !== 0) throw new Error('play-fill failed — not submitting');

  const PKG = cfg.app.bundleId;
  const notesFile = cfg.play.releaseNotesFile && resolve(cfg._dir, cfg.play.releaseNotesFile);
  const notes = notesFile && existsSync(notesFile) ? readFileSync(notesFile, 'utf8').trim() : null;
  const releaseStatus = SUBMIT ? 'completed' : 'draft';
  try {
    await withPlayEdit(PKG, async (edit) => {
      const bundle = await play('POST', `${playUpload(PKG)}/edits/${edit}/bundles?uploadType=media`, readFileSync(AAB), 'application/octet-stream');
      log(`  uploaded versionCode ${bundle.versionCode}`);
      await play('PUT', `${playApi(PKG)}/edits/${edit}/tracks/production`, { track: 'production', releases: [{
        name: cfg.app.version, status: releaseStatus, versionCodes: [String(bundle.versionCode)],
        ...(notes ? { releaseNotes: [{ language: cfg.play.defaultLanguage, text: notes }] } : {}) }] });
    }, { commit: true });
    log(SUBMIT ? `  ✅ Play production release ${cfg.app.version} committed — sent for review`
               : `  ✓ Play production release ${cfg.app.version} saved as a draft`);
  } catch (e) {
    if (/draft app|Only releases with status draft/i.test(String(e)) || /first|manual/i.test(String(e))) {
      log('  ⚠ Play refuses API releases for a never-published app. One-time, by hand: Play Console → Production →');
      log('    Create release → upload the AAB → Review → Start rollout. Every later release is automatic.');
      process.exitCode = 2;
    } else throw e;
  }
}

log('\nDone.');
