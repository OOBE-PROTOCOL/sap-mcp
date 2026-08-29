/**
 * Regenerate the vendored Adrena IDL TypeScript module from the canonical
 * @adrena/abi JSON (Anchor 0.31, program v2.1.5).
 *
 * Usage: node scripts/gen-adrena-idl.mjs
 * Source: /tmp/adrena-abi/idl/adrena.json (shallow clone of main).
 * Re-clone adrena-abi and re-run to bump; verify sha against
 * configs/artifact_manifest.json first.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const src = '/tmp/adrena-abi/idl/adrena.json';
const dest = 'packages/perps/src/adrena/adrena-idl.ts';

const raw = readFileSync(src, 'utf8');
const parsed = JSON.parse(raw);

// Integrity gate: artifact manifest pins the canonical IDL sha256.
const manifest = JSON.parse(readFileSync('/tmp/adrena-abi/configs/artifact_manifest.json', 'utf8'));
const expected = manifest.idl_sha256;
const actual = createHash('sha256').update(raw).digest('hex');
if (expected && expected !== actual) {
  console.error(`IDL sha mismatch!\n  expected: ${expected}\n  actual:   ${actual}`);
  process.exit(1);
}
console.log(`IDL sha256 verified: ${actual.slice(0, 16)}...`);
console.log(`program: ${manifest.adrena_program_id} v${manifest.adrena_program_version} (${manifest.adrena_release})`);
console.log(`instructions: ${parsed.instructions.length}, accounts: ${parsed.accounts?.length ?? 0}, types: ${parsed.types?.length ?? 0}`);

const header = `/**
 * @name perps/adrena/adrena-idl
 * @description Vendored Adrena Anchor IDL (Anchor 0.31, program
 * v${manifest.adrena_program_version}, release ${manifest.adrena_release}) embedded as a TypeScript module.
 *
 * Auto-generated from the canonical @adrena/abi JSON
 * (https://github.com/AdrenaFoundation/adrena-abi, idl_sha256
 * ${manifest.idl_sha256.slice(0, 32)}...).
 * Do NOT edit by hand: update the adrena-abi pin and re-run
 * \`node scripts/gen-adrena-idl.mjs\`.
 *
 * @module perps/adrena/adrena-idl
 */

`;

writeFileSync(
  dest,
  `${header}export const ADRENA_IDL = ${JSON.stringify(parsed, null, 1)} as const;\n`,
  'utf8',
);
console.log(`written: ${dest} (${parsed.instructions.length} instructions)`);