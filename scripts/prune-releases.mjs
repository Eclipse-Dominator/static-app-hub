#!/usr/bin/env node
/**
 * Delete mirrored app releases that are no longer referenced by the latest
 * two manifest entries.
 *
 * Only releases whose tags start with `app-<id>-v` are considered. Assets in
 * the original app repositories are never touched.
 *
 * Usage:
 *   node scripts/prune-releases.mjs              # dry run
 *   DRY_RUN=false HUB_REPO=owner/repo \
 *     GITHUB_TOKEN=... node scripts/prune-releases.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, releaseTagFor } from './lib/manifest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPS_DIR = path.join(ROOT, 'apps');
const API_URL = (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '');
const HUB_REPO = process.env.HUB_REPO?.trim() || '';
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const DRY_RUN = process.env.DRY_RUN !== 'false';

if (!HUB_REPO) {
  console.error('HUB_REPO is required (for example: owner/static-app-hub).');
  process.exit(1);
}
if (!TOKEN) {
  console.error('GITHUB_TOKEN or GH_TOKEN is required.');
  process.exit(1);
}

async function api(urlPath, init = {}) {
  const res = await fetch(`${API_URL}${urlPath}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => '');
    throw new Error(`${init.method ?? 'GET'} ${urlPath} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  if (res.status === 404 || res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function listReleases() {
  const releases = [];
  for (let page = 1; ; page += 1) {
    const batch = await api(`/repos/${HUB_REPO}/releases?per_page=100&page=${page}`);
    if (!Array.isArray(batch) || batch.length === 0) break;
    releases.push(...batch);
    if (batch.length < 100) break;
  }
  return releases;
}

const appEntries = fs
  .readdirSync(APPS_DIR)
  .filter((file) => file.endsWith('.json'))
  .map((file) => {
    const app = readJson(path.join(APPS_DIR, file));
    const allowed = new Set((app.releases ?? []).map((release) => releaseTagFor(app.id, release.version)));
    return { id: app.id, prefix: `app-${app.id}-v`, allowed };
  })
  .sort((a, b) => b.prefix.length - a.prefix.length);

if (appEntries.length === 0) {
  console.log('No app manifests found; nothing to prune.');
  process.exit(0);
}

const releases = await listReleases();
for (const app of appEntries) {
  app.onHub = [];
}

for (const release of releases) {
  const tag = release.tag_name ?? '';
  const app = appEntries.find((entry) => tag.startsWith(entry.prefix));
  if (app) app.onHub.push(release);
}

for (const app of appEntries) {
  app.onHub.sort((a, b) =>
    String(b.published_at ?? b.created_at ?? '').localeCompare(
      String(a.published_at ?? a.created_at ?? ''),
    ),
  );
  for (const release of app.onHub.slice(0, 2)) {
    app.allowed.add(release.tag_name);
  }
}

let deleted = 0;
let kept = 0;

for (const release of releases) {
  const tag = release.tag_name ?? '';
  const app = appEntries.find((entry) => tag.startsWith(entry.prefix));
  if (!app) continue;
  if (app.allowed.has(tag)) {
    kept += 1;
    continue;
  }

  console.log(`${DRY_RUN ? 'would delete' : 'deleting'} ${app.id} release ${tag}`);
  if (!DRY_RUN) {
    await api(`/repos/${HUB_REPO}/releases/${release.id}`, { method: 'DELETE' });
    await api(`/repos/${HUB_REPO}/git/refs/tags/${encodeURIComponent(tag)}`, { method: 'DELETE' });
  }
  deleted += 1;
}

console.log(
  `${DRY_RUN ? 'Dry run' : 'Pruned'}: ${deleted} old release${deleted === 1 ? '' : 's'} removed, ${kept} kept.`,
);
