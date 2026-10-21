#!/usr/bin/env node
// Turn on App ID capabilities (push, associated domains, …) and make a fresh App Store
// provisioning profile, which Apple requires after any capability change.
//
//   node apple-capabilities.mjs --bundle in.example.app [--caps PUSH_NOTIFICATIONS,ASSOCIATED_DOMAINS]
//                               [--profile-out mobile/.credentials/appstore.mobileprovision] [--new-profile] [--apply]
//
// Dry run by default: prints the bundle's capabilities, profiles and the certificate the new
// profile would use. --apply turns the capabilities on and creates the profile.
//
// The new profile uses the certificate of the bundle's current App Store profile, so a local
// signing setup (EAS credentialsSource "local", Fastlane match, Xcode manual signing) keeps
// working with its existing .p12. Pass --cert <id> to pick another distribution certificate.
// With --profile-out the old file is kept as <file>.bak-<date> and the new one written in place.
// No profile is made when every capability was already on (an active one exists) unless --new-profile.
//
// Env: ASC_KEY_ID, ASC_ISSUER_ID, [ASC_KEY_FILE]

import { copyFileSync, existsSync, writeFileSync } from 'node:fs';
import { asc, log, plan } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (f) => { const i = args.indexOf(f); return i === -1 ? undefined : args[i + 1]; };
const APPLY = args.includes('--apply');
const BUNDLE = opt('--bundle');
const CAPS = (opt('--caps') || 'PUSH_NOTIFICATIONS,ASSOCIATED_DOMAINS').split(',');
const OUT = opt('--profile-out');
if (!BUNDLE) { log('usage: apple-capabilities.mjs --bundle <bundle id> [--caps A,B] [--profile-out file] [--apply]'); process.exit(2); }

const ids = await asc('GET', `/v1/bundleIds?filter[identifier]=${encodeURIComponent(BUNDLE)}&include=bundleIdCapabilities,profiles`);
const bundle = ids.data.find((b) => b.attributes.identifier === BUNDLE);
if (!bundle) { log(`✗ No App ID for ${BUNDLE} on this team — register it first (asc-fill --only bundle).`); process.exit(1); }
const have = new Set((ids.included || []).filter((x) => x.type === 'bundleIdCapabilities').map((x) => x.attributes.capabilityType));
const profiles = (ids.included || []).filter((x) => x.type === 'profiles');
log(`App ID ${BUNDLE} (${bundle.id}), team ${bundle.attributes.seedId}`);
log(`  capabilities: ${[...have].join(', ') || 'none'}`);
for (const p of profiles) log(`  profile ${p.id} "${p.attributes.name}" ${p.attributes.profileType} ${p.attributes.profileState} until ${p.attributes.expirationDate?.slice(0, 10)}`);

let cert = opt('--cert');
if (!cert) {
  const store = profiles.find((p) => p.attributes.profileType === 'IOS_APP_STORE' && p.attributes.profileState === 'ACTIVE') || profiles.find((p) => p.attributes.profileType === 'IOS_APP_STORE');
  if (store) cert = (await asc('GET', `/v1/profiles/${store.id}/certificates`)).data[0]?.id;
}
if (!cert) { log('✗ No App Store profile to copy a certificate from — pass --cert <distribution certificate id>.'); process.exit(1); }
log(`  new profile will use certificate ${cert}`);

let changed = 0;
for (const cap of CAPS) {
  if (have.has(cap)) { log(`  ✓ ${cap} already on`); continue; }
  changed++;
  plan(!APPLY, `turn on ${cap}`);
  if (APPLY) {
    await asc('POST', '/v1/bundleIdCapabilities', {
      data: { type: 'bundleIdCapabilities', attributes: { capabilityType: cap }, relationships: { bundleId: { data: { type: 'bundleIds', id: bundle.id } } } },
    });
  }
}

const active = profiles.some((p) => p.attributes.profileType === 'IOS_APP_STORE' && p.attributes.profileState === 'ACTIVE');
if (!changed && active && !args.includes('--new-profile')) { log('  nothing to change; the active App Store profile still matches (--new-profile to make one anyway)'); process.exit(0); }

const name = `${BUNDLE} App Store ${new Date().toISOString().slice(0, 10)}`;
plan(!APPLY, `create App Store profile "${name}"${OUT ? ` → ${OUT}` : ''}`);
if (!APPLY) process.exit(0);
const p = await asc('POST', '/v1/profiles', {
  data: {
    type: 'profiles',
    attributes: { name, profileType: 'IOS_APP_STORE' },
    relationships: { bundleId: { data: { type: 'bundleIds', id: bundle.id } }, certificates: { data: [{ type: 'certificates', id: cert }] } },
  },
});
log(`  profile ${p.data.id} valid until ${p.data.attributes.expirationDate.slice(0, 10)}`);
if (OUT) {
  if (existsSync(OUT)) copyFileSync(OUT, `${OUT}.bak-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`);
  writeFileSync(OUT, Buffer.from(p.data.attributes.profileContent, 'base64'));
  log(`  saved ${OUT}`);
} else {
  log('  EAS remote credentials pick the new profile up on the next build; local signing needs --profile-out.');
}
