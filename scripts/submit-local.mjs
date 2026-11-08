#!/usr/bin/env node
/**
 * Add or update a manifest locally (the non-automated path).
 *
 * Usage:
 *   npm run submit:local -- path/to/manifest.json
 *   node scripts/submit-local.mjs path/to/manifest.json --replace
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadValidator,
  mergeManifest,
  readJson,
  validateManifest,
  writeJson,
} from './lib/manifest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const flags = new Set(process.argv.slice(2).filter((arg) => arg.startsWith('--')));
const input = args[0];

if (!input) {
  console.error('Usage: node scripts/submit-local.mjs <manifest.json> [--replace]');
  process.exit(1);
}

const inputPath = path.resolve(input);
if (!fs.existsSync(inputPath)) {
  console.error(`Manifest not found: ${inputPath}`);
  process.exit(1);
}

let manifest;
try {
  manifest = readJson(inputPath);
} catch (error) {
  console.error(`Could not parse ${input}: ${error.message}`);
  process.exit(1);
}

if (!manifest?.id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.id)) {
  console.error('The manifest needs an "id" slug (lowercase letters, digits, and dashes).');
  process.exit(1);
}

const outputPath = path.join(ROOT, 'apps', `${manifest.id}.json`);
const existing = readJson(outputPath, null);
const merged = flags.has('--replace') ? manifest : mergeManifest(existing, manifest);

if (!merged.releases || merged.releases.length === 0) {
  console.error('The manifest must contain at least one release.');
  process.exit(1);
}

const validate = loadValidator(path.join(ROOT, 'schemas', 'app.schema.json'));
const errors = validateManifest(validate, merged);
if (errors.length > 0) {
  console.error(`Manifest validation failed:\n  - ${errors.join('\n  - ')}`);
  process.exit(1);
}

writeJson(outputPath, merged);

const assetCount = merged.releases.reduce((n, release) => n + release.assets.length, 0);
console.log(`Wrote ${path.relative(process.cwd(), outputPath)}`);
console.log(
  `  ${merged.name} · ${merged.releases.length} release${merged.releases.length === 1 ? '' : 's'} · ${assetCount} asset${assetCount === 1 ? '' : 's'}${existing && !flags.has('--replace') ? ' (merged with the published manifest)' : ''}`,
);
console.log('Next: npm run validate && npm run build, then open a pull request.');
