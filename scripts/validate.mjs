#!/usr/bin/env node
/**
 * Validate every app manifest in apps/.
 *
 * Usage:
 *   node scripts/validate.mjs            # errors fail, warnings are reported
 *   node scripts/validate.mjs --strict   # warnings fail too
 *   node scripts/validate.mjs --json     # machine-readable output
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPS_DIR = path.join(ROOT, 'apps');
const PUBLIC_DIR = path.join(ROOT, 'public');
const SCHEMA_PATH = path.join(ROOT, 'schemas', 'app.schema.json');

const args = new Set(process.argv.slice(2));
const STRICT = args.has('--strict');
const JSON_OUT = args.has('--json');

const color = process.stdout.isTTY && !JSON_OUT;
const c = {
  red: (s) => (color ? `\x1b[31m${s}\x1b[0m` : s),
  yellow: (s) => (color ? `\x1b[33m${s}\x1b[0m` : s),
  green: (s) => (color ? `\x1b[32m${s}\x1b[0m` : s),
  dim: (s) => (color ? `\x1b[2m${s}\x1b[0m` : s),
  bold: (s) => (color ? `\x1b[1m${s}\x1b[0m` : s),
};

const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
// Ajv's default instance does not register the draft-07 meta-schema; dropping
// $schema here still validates the schema's keywords themselves.
delete schema.$schema;
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

/** @type {{file: string, errors: string[], warnings: string[], manifest?: any}[]} */
const results = [];

if (!fs.existsSync(APPS_DIR)) {
  console.error(c.red(`apps/ directory not found at ${APPS_DIR}`));
  process.exit(1);
}

const files = fs
  .readdirSync(APPS_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort();

if (files.length === 0) {
  results.push({
    file: 'apps/',
    errors: [],
    warnings: ['No app manifests found. Add apps/<id>.json to publish an app.'],
  });
}

const seenIds = new Map();

for (const file of files) {
  const rel = `apps/${file}`;
  const full = path.join(APPS_DIR, file);
  const errors = [];
  const warnings = [];
  let manifest;

  try {
    manifest = JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (err) {
    results.push({ file: rel, errors: [`Invalid JSON: ${err.message}`], warnings });
    continue;
  }

  if (!validateSchema(manifest)) {
    for (const e of validateSchema.errors ?? []) {
      const at = e.instancePath || '/';
      errors.push(`schema ${at}: ${e.message}${e.params ? ` ${JSON.stringify(e.params)}` : ''}`);
    }
  }

  const expectedId = file.replace(/\.json$/, '');
  if (manifest.id && manifest.id !== expectedId) {
    errors.push(`id "${manifest.id}" must match the file name "${expectedId}"`);
  }
  if (seenIds.has(manifest.id)) {
    errors.push(`duplicate id "${manifest.id}" (also in ${seenIds.get(manifest.id)})`);
  } else if (manifest.id) {
    seenIds.set(manifest.id, rel);
  }

  if (!Array.isArray(manifest.releases) || manifest.releases.length === 0) {
    errors.push('a published manifest needs at least one release');
  }

  if (Array.isArray(manifest.releases)) {
    const releaseKeys = new Set();
    let previousDate = null;
    manifest.releases.forEach((release, ri) => {
      const where = `releases[${ri}]`;
      const key = `${release.version}@${release.channel ?? 'stable'}`;
      if (releaseKeys.has(key)) errors.push(`${where}: duplicate release ${key}`);
      releaseKeys.add(key);

      if (release.date) {
        const time = Date.parse(`${release.date}T00:00:00Z`);
        if (Number.isNaN(time)) errors.push(`${where}: invalid date "${release.date}"`);
        else if (previousDate !== null && time > previousDate) {
          warnings.push(`${where}: releases are not newest-first (${release.version})`);
        }
        if (!Number.isNaN(time)) previousDate = time;
      }

      const names = new Set();
      (release.assets ?? []).forEach((asset, ai) => {
        const awhere = `${where}.assets[${ai}]`;
        if (names.has(asset.name)) errors.push(`${awhere}: duplicate asset name "${asset.name}"`);
        names.add(asset.name);
        if (asset.url && !asset.url.startsWith('https://')) {
          warnings.push(`${awhere}: URL is not https`);
        }
        if (asset.size === undefined) warnings.push(`${awhere}: missing size`);
        if (asset.sha256 === undefined) warnings.push(`${awhere}: missing sha256`);
        if (asset.sha256 && !/^[a-f0-9]{64}$/.test(asset.sha256)) {
          errors.push(`${awhere}: sha256 must be 64 lowercase hex characters`);
        }
      });

      if (ri === 0 && release.assets?.length) {
        const oses = release.assets.map((a) => a.os);
        if (!oses.some((os) => os === 'windows')) {
          warnings.push(`${where}: latest release has no Windows asset`);
        }
      }
    });

    if (manifest.releases.length > 0) {
      const newest = manifest.releases[0];
      const today = Date.now() + 24 * 60 * 60 * 1000;
      if (Date.parse(`${newest.date}T00:00:00Z`) > today) {
        warnings.push(`releases[0].date (${newest.date}) is in the future`);
      }
    }
  }

  if (typeof manifest.icon === 'string' && !/^https?:\/\//.test(manifest.icon)) {
    const iconPath = path.join(PUBLIC_DIR, manifest.icon.replace(/^\//, ''));
    if (!fs.existsSync(iconPath)) {
      errors.push(`icon "${manifest.icon}" does not exist under public/`);
    }
  }

  if (manifest.links?.repo?.startsWith('http://')) {
    warnings.push('links.repo uses http://');
  }

  results.push({ file: rel, errors, warnings, manifest });
}

if (JSON_OUT) {
  const payload = results.map(({ file, errors, warnings, manifest }) => ({
    file,
    id: manifest?.id,
    name: manifest?.name,
    errors,
    warnings,
  }));
  console.log(JSON.stringify({ ok: results.every((r) => r.errors.length === 0), results: payload }, null, 2));
} else {
  console.log('');
  for (const r of results) {
    const label = r.manifest ? `${r.manifest.name} ${c.dim(`(${r.file})`)}` : c.dim(r.file);
    if (r.errors.length === 0 && r.warnings.length === 0) {
      console.log(`  ${c.green('✓')} ${label}`);
    } else {
      console.log(`  ${r.errors.length ? c.red('✗') : c.yellow('!')} ${label}`);
      for (const err of r.errors) console.log(`      ${c.red('error')} ${err}`);
      for (const warn of r.warnings) console.log(`      ${c.yellow('warn')}  ${warn}`);
    }
  }

  const appCount = files.length;
  const errorCount = results.reduce((n, r) => n + r.errors.length, 0);
  const warningCount = results.reduce((n, r) => n + r.warnings.length, 0);
  console.log('');
  console.log(
    `  ${c.bold(`${appCount} app${appCount === 1 ? '' : 's'}`)} checked — ` +
      `${errorCount ? c.red(`${errorCount} error${errorCount === 1 ? '' : 's'}`) : c.green('0 errors')}, ` +
      `${warningCount ? c.yellow(`${warningCount} warning${warningCount === 1 ? '' : 's'}`) : '0 warnings'}`,
  );
  console.log('');
}

const failed = results.some((r) => r.errors.length > 0 || (STRICT && r.warnings.length > 0));
process.exit(failed ? 1 : 0);
