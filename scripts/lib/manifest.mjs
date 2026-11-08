import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

/* ── JSON helpers ─────────────────────────────────────────────────────── */

export function readJson(filePath, fallback = undefined) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT' && fallback !== undefined) return fallback;
    throw err;
  }
}

export function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

/* ── Validation ───────────────────────────────────────────────────────── */

export function loadValidator(schemaPath) {
  const schema = readJson(schemaPath);
  delete schema.$schema;
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(schema);
}

export function validateManifest(validate, manifest) {
  const errors = [];
  if (!validate(manifest)) {
    for (const error of validate.errors ?? []) {
      errors.push(`${error.instancePath || '/'} ${error.message}`);
    }
  }
  return errors;
}

/* ── Versions and names ───────────────────────────────────────────────── */

export function cleanVersion(tag, override) {
  if (override) return String(override).trim();
  return String(tag ?? '')
    .trim()
    .replace(/^refs\/tags\//, '')
    .replace(/^v(?=\d)/i, '');
}

export function releaseTagFor(appId, version) {
  const safe = String(version).replace(/[^0-9A-Za-z._-]+/g, '-').replace(/^-+|-+$/g, '');
  return `app-${appId}-v${safe || 'release'}`;
}

export function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/* ── Asset inference ──────────────────────────────────────────────────── */

const OS_PATTERNS = [
  ['macos', /macos|mac-os|darwin|osx|\.dmg\b|\.pkg\b|apple/i],
  ['windows', /windows|win32|win64|win-x|\bwin\b|\.exe\b|\.msi\b/i],
  ['android', /android|\.apk\b|\.aab\b/i],
  ['ios', /\bios\b|\.ipa\b/i],
  ['linux', /linux|\.appimage\b|\.deb\b|\.rpm\b|\.snap\b|\.flatpak\b/i],
  ['web', /\.wasm\b|web-?bundle/i],
];

const ARCH_PATTERNS = [
  ['arm64', /arm64|aarch64|armv8/i],
  ['x64', /x64|x86[_-]64|amd64|win64/i],
  ['x86', /\bx86\b|i[3-6]86|win32/i],
  ['universal', /universal/i],
];

export function inferOs(filename) {
  for (const [os, pattern] of OS_PATTERNS) {
    if (pattern.test(filename)) return os;
  }
  return 'any';
}

export function inferArch(filename) {
  for (const [arch, pattern] of ARCH_PATTERNS) {
    if (pattern.test(filename)) return arch;
  }
  return 'any';
}

export function inferKind(filename) {
  const name = filename.toLowerCase();
  if (/\.exe$/.test(name)) {
    if (/setup|installer|install[-_.]/i.test(name)) return 'installer';
    return 'portable';
  }
  if (/\.msi$/.test(name)) return 'msi';
  if (/\.dmg$/.test(name)) return 'dmg';
  if (/\.pkg$/.test(name)) return 'package';
  if (/\.deb$/.test(name)) return 'deb';
  if (/\.rpm$/.test(name)) return 'rpm';
  if (/\.appimage$/.test(name)) return 'appimage';
  if (/\.(apk|aab|ipa|snap|flatpak)$/.test(name)) return 'package';
  if (/\.(zip|tar\.gz|tgz|tar\.xz|tar\.bz2|7z|rar)$/.test(name)) return 'archive';
  if (/\.(sh|ps1|bat|cmd)$/.test(name)) return 'script';
  if (/\.(txt|sha256|sha512|sig|asc|json|md)$/.test(name)) return 'other';
  if (/\.(bin|exe_|run)$/.test(name)) return 'binary';
  // GitHub often hosts bare, extensionless binaries (e.g. "app-linux-amd64").
  if (!path.extname(name)) return 'binary';
  return 'other';
}

const KIND_PRIORITY = {
  installer: 0,
  msi: 1,
  dmg: 2,
  appimage: 3,
  portable: 4,
  deb: 5,
  rpm: 6,
  package: 7,
  binary: 8,
  archive: 9,
  script: 10,
  other: 99,
};

/** Mark the most convenient asset per OS/architecture as recommended. */
export function applyRecommended(assets) {
  const hasExplicit = assets.some((asset) => asset.recommended === true);
  if (hasExplicit) return assets;

  const best = new Map();
  for (const asset of assets) {
    if (asset.kind === 'other') continue;
    const key = `${asset.os}:${asset.arch ?? 'any'}`;
    const current = best.get(key);
    const score = KIND_PRIORITY[asset.kind] ?? 50;
    if (!current || score < current.score) best.set(key, { asset, score });
  }
  for (const { asset } of best.values()) asset.recommended = true;
  return assets;
}

/* ── Merging manifests ────────────────────────────────────────────────── */

function definedEntries(object) {
  return Object.fromEntries(Object.entries(object ?? {}).filter(([, value]) => value !== undefined));
}

/**
 * Merge a submitted manifest into the currently published one.
 * Metadata from `incoming` wins; releases are unioned newest-first and
 * capped at 30 entries.
 */
export function mergeManifest(existing, incoming) {
  if (!existing) return incoming;

  const merged = {
    ...existing,
    ...definedEntries(incoming),
    links: { ...(existing.links ?? {}), ...definedEntries(incoming.links) },
    install: { ...(existing.install ?? {}), ...definedEntries(incoming.install) },
  };

  const byKey = new Map();
  for (const release of [...(incoming.releases ?? []), ...(existing.releases ?? [])]) {
    if (!release || typeof release.version !== 'string') continue;
    const key = `${release.version}@${release.channel ?? 'stable'}`;
    if (!byKey.has(key)) byKey.set(key, release);
  }

  merged.releases = [...byKey.values()]
    .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')))
    .slice(0, 30);

  return merged;
}
