# App Library

A personal app library and landing page for downloadable applications — installers, portable
builds, packages, scripts, and archives. It is built for a collection of first-party or private
projects that each publish their own releases.

The site is generated with [Astro](https://astro.build) and deployed to GitHub Pages. It has no
database and no runtime server: every app is a reviewed JSON manifest in [`apps/`](apps/), and
other repositories submit new releases through a reusable GitHub Actions workflow.

- **Site:** `https://eclipse-dominator.github.io/static-app-hub/`
- **Schema:** [`schemas/app.schema.json`](schemas/app.schema.json)
- **Submission guide:** [`docs/SUBMITTING.md`](docs/SUBMITTING.md)

## Quick start

```sh
npm ci
npm run dev        # http://localhost:4321
npm run validate   # schema + semantic checks for apps/*.json
npm run build      # validate, then build to dist/
```

Node.js 22.23.4+ (see `.nvmrc`).

## How it works

```
app repo release ──▶ reusable workflow ──▶ manifest PR ──▶ review ──▶ merge
                                                                        │
                                                                        ▼
                                                            Pages build + deploy
```

1. An app repository publishes a GitHub Release with downloadable assets.
2. It calls [`submit-app.yml`](.github/workflows/submit-app.yml), passing a manifest template.
   The workflow generates the release entry, detects OS/arch/kind from file names, computes sizes
   and SHA-256 checksums, and — for private repositories — mirrors the assets into this
   repository's public Releases.
3. The workflow opens a pull request here that changes only `apps/<id>.json`.
4. CI validates the manifest and builds the site. After review and merge,
   [`deploy.yml`](.github/workflows/deploy.yml) publishes to GitHub Pages.

Public repositories can also link release URLs directly; no files are copied.

## Repository layout

| Path | Purpose |
| --- | --- |
| `apps/*.json` | The registry — one reviewed manifest per app |
| `schemas/app.schema.json` | JSON Schema for manifests |
| `src/pages/` | Astro pages (`/`, `/apps/<id>/`, `/about/`, `/apps.json`) |
| `src/lib/registry.ts` | Build-time loader, validation, and presentation helpers |
| `scripts/validate.mjs` | CI validation (JSON Schema + semantic checks) |
| `scripts/build-submission.mjs` | Turns a release into a manifest and optionally mirrors assets |
| `scripts/submit-local.mjs` | Merge a manifest into `apps/` locally |
| `hub.config.json` | Site name, owner/repo, description |
| `.github/workflows/` | Deploy, CI, and the reusable submission workflow |

## Adding an app

The short version: copy an example from `apps/`, change the metadata and releases, then open a PR.

```sh
cp apps/termboard.json apps/my-app.json
# edit apps/my-app.json
npm run validate
npm run build
```

For the automated, release-driven path (including private repositories), read
[`docs/SUBMITTING.md`](docs/SUBMITTING.md).

## Configuration

Edit `hub.config.json` before deploying:

```json
{
  "title": "App Library",
  "shortTitle": "App Library",
  "description": "Quick downloads for my apps and tools.",
  "owner": "Eclipse-Dominator",
  "repo": "static-app-hub",
  "url": "https://eclipse-dominator.github.io/static-app-hub"
}
```

Then enable GitHub Pages with **Settings → Pages → Source: GitHub Actions**. No `CNAME` file is
needed unless you use a custom domain.

`SITE_URL` and `BASE_PATH` are supplied to the build by `actions/configure-pages`, so the site works
at any project-page path. Local builds default to `http://localhost:4321` at `/`.

## Removing the sample apps

`termboard`, `pixelforge`, and `hush` are example manifests with placeholder download URLs. Delete
them (and their icons in `public/icons/`) once you add real entries, or keep them while developing
the UI.

## License

The site and tooling are available under the MIT license. App manifests remain the property of
their respective authors; each app lists its own license.
