#!/usr/bin/env node
/**
 * Build an app manifest submission from a release.
 *
 * Used by .github/workflows/submit-app.yml, but also runnable locally.
 * See docs/SUBMITTING.md for the full list of environment variables.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  applyRecommended,
  cleanVersion,
  inferArch,
  inferKind,
  inferOs,
  loadValidator,
  mergeManifest,
  readJson,
  releaseTagFor,
  validateManifest,
  writeJson,
} from './lib/manifest.mjs';

const env = process.env;
const APP_ID = env.APP_ID?.trim();
const MANIFEST_PATH = env.MANIFEST_PATH?.trim();
const HUB_APPS_DIR = path.resolve(env.HUB_APPS_DIR || 'apps');
const SCHEMA_PATH = path.resolve(env.SCHEMA_PATH || 'schemas/app.schema.json');
const RELEASE_REPO = env.RELEASE_REPO?.trim() || '';
const RELEASE_TAG = env.RELEASE_TAG?.trim() || '';
const CHANNEL = env.CHANNEL?.trim() || 'stable';
const VERSION_OVERRIDE = env.VERSION?.trim() || '';
const NOTES_OVERRIDE = env.NOTES ?? '';
const MIRROR = env.MIRROR === 'true';
const CHECKSUMS = env.CHECKSUMS !== 'false';
const DRY_RUN = env.DRY_RUN === 'true';
const HUB_REPO = env.HUB_REPO?.trim() || '';
const SOURCE_TOKEN = env.SOURCE_TOKEN?.trim() || '';
const HUB_TOKEN = env.HUB_TOKEN?.trim() || '';
const API_URL = (env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '');

const CHANNELS = new Set(['stable', 'beta', 'nightly']);
const TEMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'app-hub-submit-'));
const cleanup = () => fs.rmSync(TEMP_DIR, { recursive: true, force: true });

/* ── GitHub API ───────────────────────────────────────────────────────── */

async function api(urlOrPath, { token = SOURCE_TOKEN, method = 'GET', body, headers = {} } = {}) {
  const url = urlOrPath.startsWith('http') ? urlOrPath : `${API_URL}${urlOrPath}`;
  const res = await fetch(url, {
    method,
    body,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub API ${method} ${urlOrPath} failed (${res.status}): ${text.slice(0, 400)}`);
  }
  return res.json();
}

async function apiOrNull(urlOrPath, options) {
  try {
    return await api(urlOrPath, options);
  } catch (error) {
    if (String(error.message).includes('(404)')) return null;
    throw error;
  }
}

/* ── Assets ───────────────────────────────────────────────────────────── */

function safeTempName(index, name) {
  return `${String(index).padStart(2, '0')}-${name.replace(/[^0-9A-Za-z._-]+/g, '_')}`;
}

async function downloadAsset(asset, index) {
  const res = await fetch(asset.url, {
    headers: {
      Accept: 'application/octet-stream',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(SOURCE_TOKEN ? { Authorization: `Bearer ${SOURCE_TOKEN}` } : {}),
    },
  });
  if (!res.ok || !res.body) {
    throw new Error(`Could not download ${asset.name} (${res.status})`);
  }

  const destination = path.join(TEMP_DIR, safeTempName(index, asset.name));
  const hash = crypto.createHash('sha256');
  const hasher = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      callback(null, chunk);
    },
  });

  await pipeline(Readable.fromWeb(res.body), hasher, fs.createWriteStream(destination));

  return {
    path: destination,
    size: fs.statSync(destination).size,
    sha256: hash.digest('hex'),
  };
}

function assetFieldsFromTemplate(templateRelease) {
  const map = new Map();
  for (const asset of templateRelease?.assets ?? []) {
    if (asset?.name) map.set(asset.name, asset);
  }
  return map;
}

const ALLOWED_OVERRIDE_KEYS = ['os', 'arch', 'kind', 'label', 'recommended', 'sha256', 'size', 'url'];

function applyOverrides(autoAsset, override) {
  if (!override) return autoAsset;
  const merged = { ...autoAsset };
  for (const key of ALLOWED_OVERRIDE_KEYS) {
    if (override[key] !== undefined) merged[key] = override[key];
  }
  return merged;
}

/* ── Mirroring ────────────────────────────────────────────────────────── */

async function mirrorRelease({
  appId,
  appName,
  version,
  channel,
  notes,
  sourceRepo,
  sourceTag,
  assets,
  downloads,
}) {
  if (!HUB_REPO) throw new Error('HUB_REPO is required when mirroring assets');
  if (!HUB_TOKEN) throw new Error('HUB_TOKEN is required when mirroring assets');

  const tag = releaseTagFor(appId, version);
  let release = await apiOrNull(`/repos/${HUB_REPO}/releases/tags/${encodeURIComponent(tag)}`, {
    token: HUB_TOKEN,
  });

  if (!release) {
    release = await api(`/repos/${HUB_REPO}/releases`, {
      token: HUB_TOKEN,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tag_name: tag,
        name: `${appName} v${version}`,
        body: `${notes || ''}\n\n---\nMirrored from \`${sourceRepo}\` release \`${sourceTag}\` by Static App Hub.`,
        draft: false,
        prerelease: channel !== 'stable',
      }),
    });
  } else {
    release = await api(`/repos/${HUB_REPO}/releases/${release.id}`, {
      token: HUB_TOKEN,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `${appName} v${version}`,
        body: `${notes || ''}\n\n---\nMirrored from \`${sourceRepo}\` release \`${sourceTag}\` by Static App Hub.`,
        prerelease: channel !== 'stable',
      }),
    });
  }

  const existingAssets = await api(`/repos/${HUB_REPO}/releases/${release.id}/assets?per_page=100`, {
    token: HUB_TOKEN,
  });
  const existing = new Map((existingAssets ?? []).map((asset) => [asset.name, asset]));
  const urls = new Map();

  for (const asset of assets) {
    const conflict = existing.get(asset.name);
    if (conflict) {
      await api(`/repos/${HUB_REPO}/releases/assets/${conflict.id}`, {
        token: HUB_TOKEN,
        method: 'DELETE',
      });
    }

    const downloaded = downloads.get(asset.name);
    if (!downloaded) throw new Error(`Missing downloaded file for ${asset.name}`);

    const stat = fs.statSync(downloaded.path);
    const uploadUrl = `https://uploads.github.com/repos/${HUB_REPO}/releases/${release.id}/assets?name=${encodeURIComponent(asset.name)}`;
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(stat.size),
        Authorization: `Bearer ${HUB_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: fs.createReadStream(downloaded.path),
      duplex: 'half',
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Uploading ${asset.name} failed (${res.status}): ${text.slice(0, 300)}`);
    }

    urls.set(
      asset.name,
      `https://github.com/${HUB_REPO}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(asset.name)}`,
    );
  }

  return { tag, urls, releaseUrl: release.html_url };
}

/* ── Output helpers ───────────────────────────────────────────────────── */

function appendOutput(key, value) {
  if (!env.GITHUB_OUTPUT) return;
  fs.appendFileSync(env.GITHUB_OUTPUT, `${key}<<APP_HUB_EOF\n${value}\nAPP_HUB_EOF\n`);
}

function appendSummary(markdown) {
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}

function truncate(value, max) {
  const text = String(value ?? '').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/* ── Main ─────────────────────────────────────────────────────────────── */

async function main() {
  if (!APP_ID) throw new Error('APP_ID is required');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(APP_ID)) {
    throw new Error(`APP_ID "${APP_ID}" must be a lowercase slug, e.g. "my-app"`);
  }
  if (!MANIFEST_PATH) throw new Error('MANIFEST_PATH is required');
  if (!CHANNELS.has(CHANNEL)) throw new Error(`CHANNEL must be one of ${[...CHANNELS].join(', ')}`);

  const template = readJson(path.resolve(MANIFEST_PATH));
  if (!template || typeof template !== 'object' || Array.isArray(template)) {
    throw new Error('Manifest template must be a JSON object');
  }
  if (template.id && template.id !== APP_ID) {
    throw new Error(`Manifest id "${template.id}" does not match APP_ID "${APP_ID}"`);
  }
  template.id = APP_ID;

  const outputPath = path.join(HUB_APPS_DIR, `${APP_ID}.json`);
  const existing = readJson(outputPath, null);
  const downloads = new Map();

  let candidateRelease = null;
  let mirror = null;
  const releaseMeta = { version: '', notes: '', title: '', date: '' };

  if (RELEASE_REPO && RELEASE_TAG) {
    if (!RELEASE_REPO.includes('/')) {
      throw new Error('RELEASE_REPO must be in "owner/name" form');
    }

    const repoInfo = await api(`/repos/${RELEASE_REPO}`);
    if (repoInfo.private && !MIRROR) {
      throw new Error(
        'The source repository is private. Set mirror-assets: true so the files can be downloaded publicly from this hub.',
      );
    }

    const release = await api(`/repos/${RELEASE_REPO}/releases/tags/${encodeURIComponent(RELEASE_TAG)}`);
    const version = cleanVersion(RELEASE_TAG, VERSION_OVERRIDE);
    releaseMeta.version = version;
    releaseMeta.notes = NOTES_OVERRIDE || release.body || '';
    releaseMeta.title = truncate(release.name && release.name !== RELEASE_TAG ? release.name : '', 120);
    releaseMeta.date = (release.published_at || new Date().toISOString()).slice(0, 10);

    const templateRelease = (template.releases ?? []).find(
      (item) => item.version === version && (item.channel ?? 'stable') === CHANNEL,
    );
    const overrides = assetFieldsFromTemplate(templateRelease);
    const sourceAssets = (release.assets ?? []).filter((asset) => asset.state === 'uploaded' && asset.name);
    if (sourceAssets.length === 0) {
      throw new Error(`Release ${RELEASE_TAG} has no uploaded assets`);
    }

    const assets = [];
    for (const [index, source] of sourceAssets.entries()) {
      const inferred = {
        name: source.name,
        url: source.browser_download_url,
        os: inferOs(source.name),
        arch: inferArch(source.name),
        kind: inferKind(source.name),
      };
      const asset = applyOverrides(inferred, overrides.get(source.name));

      if (CHECKSUMS || (MIRROR && !DRY_RUN)) {
        const download = await downloadAsset(source, index);
        downloads.set(asset.name, download);
        asset.size = asset.size ?? download.size;
        asset.sha256 = asset.sha256 ?? download.sha256;
      }

      assets.push(asset);
    }

    applyRecommended(assets);

    candidateRelease = {
      version,
      date: releaseMeta.date,
      channel: CHANNEL,
      ...(releaseMeta.title ? { title: releaseMeta.title } : {}),
      ...(releaseMeta.notes ? { notes: truncate(releaseMeta.notes, 30000) } : {}),
      assets,
    };
  } else if (RELEASE_TAG && !RELEASE_REPO) {
    throw new Error('RELEASE_REPO is required when RELEASE_TAG is set');
  }

  const incoming = {
    ...template,
    ...(candidateRelease
      ? { releases: [candidateRelease, ...(template.releases ?? [])] }
      : {}),
  };
  incoming.$schema = template.$schema ?? '../../schemas/app.schema.json';

  if (!existing && (!incoming.releases || incoming.releases.length === 0)) {
    throw new Error(
      'No releases yet. Pass release-tag (and release-repo) or include a release in the manifest template.',
    );
  }

  const merged = mergeManifest(existing, incoming);
  merged.id = APP_ID;

  const validate = loadValidator(SCHEMA_PATH);
  let errors = validateManifest(validate, merged);
  if (errors.length > 0) {
    throw new Error(`Manifest validation failed:\n  - ${errors.join('\n  - ')}`);
  }

  if (MIRROR && candidateRelease) {
    const releaseVersion = candidateRelease.version;
    if (DRY_RUN) {
      const tag = releaseTagFor(APP_ID, releaseVersion);
      for (const asset of candidateRelease.assets) {
        asset.url = `https://github.com/${HUB_REPO}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(asset.name)}`;
      }
      console.log(`dry-run: skipped uploading ${candidateRelease.assets.length} assets to ${HUB_REPO}`);
    } else {
      mirror = await mirrorRelease({
        appId: APP_ID,
        appName: merged.name,
        version: releaseVersion,
        channel: CHANNEL,
        notes: releaseMeta.notes,
        sourceRepo: RELEASE_REPO,
        sourceTag: RELEASE_TAG,
        assets: candidateRelease.assets,
        downloads,
      });
      for (const asset of candidateRelease.assets) {
        asset.url = mirror.urls.get(asset.name) ?? asset.url;
      }
    }

    errors = validateManifest(validate, merged);
    if (errors.length > 0) {
      throw new Error(`Manifest validation failed after mirroring:\n  - ${errors.join('\n  - ')}`);
    }
  }

  writeJson(outputPath, merged);

  const version = candidateRelease?.version ?? merged.releases[0]?.version ?? '';
  const assetCount = candidateRelease?.assets.length ?? 0;

  appendOutput('app_id', APP_ID);
  appendOutput('version', version);
  appendOutput('asset_count', String(assetCount));
  appendOutput('mirrored', String(!!mirror));
  appendOutput('release_url', mirror?.releaseUrl ?? '');

  const rows = (candidateRelease?.assets ?? [])
    .map(
      (asset) =>
        `| \`${asset.name}\` | ${asset.os} | ${asset.arch ?? 'any'} | ${asset.kind} | ${
          asset.size ? `${(asset.size / 1024 / 1024).toFixed(1)} MB` : '—'
        } |`,
    )
    .join('\n');

  appendSummary(
    [
      `### Submitted \`${APP_ID}\`${version ? ` v${version}` : ''}`,
      '',
      candidateRelease
        ? `Release [\`${RELEASE_TAG}\`](https://github.com/${RELEASE_REPO}/releases/tag/${encodeURIComponent(RELEASE_TAG)}) · ${assetCount} asset${assetCount === 1 ? '' : 's'}`
        : 'Metadata-only update',
      mirror ? `Mirrored to [hub release](${mirror.releaseUrl})` : '',
      '',
      rows ? '| File | OS | Arch | Kind | Size |\n| --- | --- | --- | --- | --- |\n' + rows : '',
      `Manifest written to \`${path.relative(process.cwd(), outputPath)}\`.`,
    ]
      .filter(Boolean)
      .join('\n'),
  );

  console.log(
    JSON.stringify(
      {
        app: APP_ID,
        version,
        assets: assetCount,
        mirrored: !!mirror,
        output: outputPath,
        dryRun: DRY_RUN,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  })
  .finally(cleanup);
