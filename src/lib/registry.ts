import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { marked } from 'marked';
import type { App, Asset, Category, Os, Release } from './types';

const ROOT = process.cwd();
const APPS_DIR = path.join(ROOT, 'apps');
const SCHEMA_PATH = path.join(ROOT, 'schemas', 'app.schema.json');

const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
delete schema.$schema;
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

function loadApps(): App[] {
  if (!fs.existsSync(APPS_DIR)) return [];

  const apps: App[] = [];
  for (const file of fs.readdirSync(APPS_DIR).filter((f) => f.endsWith('.json')).sort()) {
    const full = path.join(APPS_DIR, file);
    let manifest: unknown;
    try {
      manifest = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch (err) {
      throw new Error(`${file}: invalid JSON — ${(err as Error).message}`);
    }

    if (!validate(manifest)) {
      const details = (validate.errors ?? [])
        .map((e) => `${e.instancePath || '/'} ${e.message}`)
        .join('; ');
      throw new Error(`${file}: manifest failed validation — ${details}`);
    }

    const app = manifest as App;
    if (`${app.id}.json` !== file) {
      throw new Error(`${file}: id "${app.id}" must match the file name`);
    }
    if (!app.releases?.length) {
      throw new Error(`${file}: a published manifest needs at least one release`);
    }
    apps.push(app);
  }

  return apps.sort((a, b) => {
    if (!!a.featured !== !!b.featured) return a.featured ? -1 : 1;
    const ad = a.releases[0]?.date ?? '';
    const bd = b.releases[0]?.date ?? '';
    if (ad !== bd) return bd.localeCompare(ad);
    return a.name.localeCompare(b.name);
  });
}

export const apps: App[] = loadApps();

export function getApp(id: string): App | undefined {
  return apps.find((app) => app.id === id);
}

/** The newest release, newest first in the manifest. */
export function latestRelease(app: App): Release {
  return app.releases[0];
}

/** Newest stable release, falling back to the newest release of any channel. */
export function latestStable(app: App): Release {
  return app.releases.find((r) => (r.channel ?? 'stable') === 'stable') ?? app.releases[0];
}

const PLATFORM_ORDER: Os[] = ['windows', 'macos', 'linux', 'android', 'ios', 'web', 'any'];

export function appPlatforms(app: App): Os[] {
  let list: Os[];
  if (app.platforms?.length) {
    list = app.platforms;
  } else {
    const seen = new Set<Os>();
    for (const release of app.releases) {
      for (const asset of release.assets) seen.add(asset.os);
    }
    list = [...seen];
  }

  const unique = [...new Set(list)].sort(
    (a, b) => PLATFORM_ORDER.indexOf(a) - PLATFORM_ORDER.indexOf(b),
  );

  // "Any platform" is redundant when concrete desktop platforms are known.
  if (unique.some((os) => ['windows', 'macos', 'linux'].includes(os))) {
    return unique.filter((os) => os !== 'any');
  }
  return unique;
}

export function appTags(app: App): string[] {
  return app.tags ?? [];
}

export function totalReleases(): number {
  return apps.reduce((n, app) => n + app.releases.length, 0);
}

export function totalAssets(): number {
  return apps.reduce(
    (n, app) => n + app.releases.reduce((m, release) => m + release.assets.length, 0),
    0,
  );
}

const OS_LABELS: Record<Os, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  android: 'Android',
  ios: 'iOS',
  web: 'Web',
  any: 'Any platform',
};

const ARCH_LABELS: Record<string, string> = {
  x64: 'x64',
  arm64: 'ARM64',
  x86: 'x86',
  universal: 'Universal',
  any: 'Any',
};

const KIND_LABELS: Record<string, string> = {
  installer: 'Installer',
  portable: 'Portable',
  archive: 'Archive',
  package: 'Package',
  script: 'Script',
  dmg: 'Disk image',
  msi: 'MSI package',
  deb: 'Debian package',
  rpm: 'RPM package',
  appimage: 'AppImage',
  binary: 'Binary',
  other: 'File',
};

const CATEGORY_LABELS: Record<Category, string> = {
  'developer-tools': 'Developer tools',
  productivity: 'Productivity',
  media: 'Media',
  security: 'Security',
  networking: 'Networking',
  utilities: 'Utilities',
  education: 'Education',
  games: 'Games',
  other: 'Other',
};

export const osLabel = (os: Os): string => OS_LABELS[os] ?? os;
export const archLabel = (arch?: string): string => ARCH_LABELS[arch ?? 'any'] ?? arch ?? '';
export const kindLabel = (kind: string): string => KIND_LABELS[kind] ?? kind;
export const categoryLabel = (category: Category): string => CATEGORY_LABELS[category] ?? category;

export function formatDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

/** Prefix a path with the GitHub Pages base path. Absolute URLs pass through. */
export function withBase(target: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//')) return target;
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}/${target.replace(/^\//, '')}`;
}

export function iconUrl(icon?: string): string | undefined {
  if (!icon) return undefined;
  return /^https?:\/\//.test(icon) ? icon : withBase(icon);
}

const ALLOWED_INSTALL_KEYS = new Set([
  'brew',
  'scoop',
  'winget',
  'choco',
  'cargo',
  'npm',
  'pypi',
  'pipx',
  'go',
  'docker',
  'script',
  'powershell',
]);

export function installEntries(app: App): { key: string; label: string; command: string }[] {
  const labels: Record<string, string> = {
    brew: 'Homebrew',
    scoop: 'Scoop',
    winget: 'WinGet',
    choco: 'Chocolatey',
    cargo: 'Cargo',
    npm: 'npm',
    pypi: 'PyPI',
    pipx: 'pipx',
    go: 'Go',
    docker: 'Docker',
    script: 'Shell script',
    powershell: 'PowerShell',
  };
  return Object.entries(app.install ?? {})
    .filter(([key, value]) => ALLOWED_INSTALL_KEYS.has(key) && typeof value === 'string' && value.length > 0)
    .map(([key, command]) => ({ key, label: labels[key] ?? key, command }));
}

const LINK_LABELS: Record<keyof App['links'], string> = {
  repo: 'Source code',
  homepage: 'Homepage',
  docs: 'Documentation',
  changelog: 'Changelog',
  issues: 'Issue tracker',
  discussions: 'Discussions',
  donate: 'Donate',
};

export function linkEntries(app: App): { key: string; label: string; url: string }[] {
  return Object.entries(app.links ?? {})
    .filter(([, url]) => typeof url === 'string')
    .map(([key, url]) => ({
      key,
      label: LINK_LABELS[key as keyof App['links']] ?? key,
      url: url as string,
    }));
}

marked.setOptions({ gfm: true, breaks: false });

/** Render trusted, PR-reviewed Markdown to HTML at build time. */
export function renderMarkdown(markdown?: string): string {
  if (!markdown) return '';
  return marked.parse(markdown, { async: false }) as string;
}

export interface PlatformGroup {
  os: Os;
  label: string;
  assets: Asset[];
}

/** Group a release's assets by OS in a stable display order. */
export function groupAssetsByOs(assets: Asset[]): PlatformGroup[] {
  const order: Os[] = ['windows', 'macos', 'linux', 'android', 'ios', 'web', 'any'];
  const groups = new Map<Os, Asset[]>();
  for (const asset of assets) {
    const list = groups.get(asset.os) ?? [];
    list.push(asset);
    groups.set(asset.os, list);
  }
  return order
    .filter((os) => groups.has(os))
    .map((os) => ({ os, label: osLabel(os), assets: groups.get(os) ?? [] }));
}

export function recommendedAsset(release: Release, os: Os): Asset | undefined {
  const candidates = release.assets.filter((a) => a.os === os);
  return (
    candidates.find((a) => a.recommended) ??
    candidates.find((a) => ['installer', 'dmg', 'msi', 'appimage', 'portable'].includes(a.kind)) ??
    candidates[0]
  );
}
