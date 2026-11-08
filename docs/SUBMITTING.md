# Submitting an app

There are two ways to get an app listed: let your release pipeline open the pull request, or edit
the manifest by hand. Both end with a reviewed PR that changes a single file:
`apps/<id>.json`.

Read the [manifest reference](MANIFEST.md) for every field.

## What you need

- A GitHub Release with the files users should download (installers, archives, packages, scripts).
  Draft releases are ignored.
- A stable `id` slug: lowercase letters, digits, and dashes. It becomes the app's URL, so choose
  carefully and never change it.
- A license label and a repository or homepage link.
- Public download URLs. If your repository is private, use `mirror-assets: true` (see below).

## Automated submission (recommended)

### 1. Create the `HUB_TOKEN` secret

Create a **fine-grained personal access token**:

- **Resource owner:** the account/org that owns the hub repository.
- **Repository access:** only the hub repository.
- **Permissions:** `Contents: Read and write`, `Pull requests: Read and write`.

In your app repository, add it as an Actions secret named `HUB_TOKEN`
(**Settings → Secrets and variables → Actions → New repository secret**).

The workflow also uses your repository's `GITHUB_TOKEN` to read the release and its assets. If your
organization restricts token permissions, grant `Contents: Read` to the workflow (see the snippet
below).

### 2. Add a manifest template

Commit `.github/app-hub.json` to your app repository. The workflow fills in `releases` from the
GitHub release, so the template only needs the slow-changing metadata:

```json
{
  "$schema": "https://raw.githubusercontent.com/OWNER/static-app-hub/main/schemas/app.schema.json",
  "id": "my-app",
  "name": "My App",
  "tagline": "One sentence about what it does.",
  "description": "Optional longer **Markdown** description.",
  "category": "developer-tools",
  "tags": ["cli", "cross-platform"],
  "icon": "https://raw.githubusercontent.com/you/my-app/main/icon.png",
  "accent": "#7cf29c",
  "license": "MIT",
  "author": { "name": "Your Name" },
  "links": {
    "repo": "https://github.com/you/my-app",
    "docs": "https://github.com/you/my-app#readme"
  },
  "install": {
    "brew": "brew install you/tap/my-app",
    "script": "curl -fsSL https://example.com/install.sh | sh"
  },
  "releases": []
}
```

Replace `OWNER` in `$schema` with the hub's owner so your editor can provide completions. The
template is not validated on its own; the merged manifest is.

### 3. Add the workflow

```yaml
name: Publish to Static App Hub

on:
  release:
    types: [published]

jobs:
  submit:
    permissions:
      contents: read
    uses: YOUR-NAME/static-app-hub/.github/workflows/submit-app.yml@main
    with:
      hub-repo: YOUR-NAME/static-app-hub
      app-id: my-app
      manifest: .github/app-hub.json
      release-tag: ${{ github.event.release.tag_name }}
      mirror-assets: false
    secrets:
      HUB_TOKEN: ${{ secrets.HUB_TOKEN }}
```

Set `mirror-assets: true` when the source repository is private. The hub will copy the release
assets to its own public Releases and use those URLs in the manifest.

### 4. Publish a release

Publish a GitHub Release as usual. The workflow:

1. reads the release and its uploaded assets;
2. infers `os`, `arch`, and `kind` from each file name;
3. downloads each asset to compute its size and SHA-256 (disable with `checksums: false`);
4. optionally mirrors the assets into the hub's Releases (tag `app-<id>-v<version>`);
5. merges the new release into the existing manifest, keeping older releases;
6. validates the result and opens a pull request here.

The PR body links back to your release and lists every asset for review.

### Workflow inputs

| Input | Default | Description |
| --- | --- | --- |
| `app-id` | required | Manifest id. |
| `manifest` | required | Path to the template in your repository. |
| `release-tag` | release event tag | Tag to publish. Pass explicitly when not triggered by `release`. |
| `version` | tag without `v` | Override the display version. |
| `channel` | `stable` | `stable`, `beta`, or `nightly`. |
| `notes` | release body | Override release notes (Markdown). |
| `mirror-assets` | `false` | Copy assets to the hub's Releases. Required for private repos. |
| `checksums` | `true` | Download assets to compute size and SHA-256. |
| `dry-run` | `false` | Build and validate without pushing or opening a PR. |
| `hub-repo` | required | The hub's `owner/repo`. |
| `base-branch` | `main` | Branch that manifest PRs target. |

## Private repositories

GitHub Pages can only serve public files, so a private release URL is useless to visitors. With
`mirror-assets: true`:

- every uploaded asset is downloaded with your workflow token and uploaded to the hub's public
  Releases under `app-<id>-v<version>`;
- the manifest gets public `https://github.com/<hub>/releases/download/...` URLs instead;
- re-running the workflow replaces same-named files on that hub release;
- only release assets are copied — your repository, history, and source stay private.

The hub repository must be public for mirrored downloads to work.

## Manual pull request

```sh
cp apps/termboard.json apps/my-app.json
$EDITOR apps/my-app.json
npm run validate
npm run dev          # preview at http://localhost:4321
```

Then commit `apps/my-app.json` (and any icon under `public/icons/`) and open a PR.

You can also merge a manifest into an existing entry:

```sh
npm run submit:local -- path/to/manifest.json
```

This validates the merged result and writes `apps/<id>.json`. Use `--replace` to overwrite instead
of merging.

## Updating metadata without a release

Call the workflow without `release-tag` (or with the same release tag but updated template) to
refresh links, install commands, descriptions, or icons. Metadata from the template wins; releases
are preserved.

You can also edit `apps/<id>.json` directly in a PR.

## Channels and versions

- Use `channel: beta` or `channel: nightly` for pre-releases. The app page promotes the newest
  `stable` release as the primary download and links to the history for pre-releases.
- `version` is a display string. Tags like `v1.2.0`, `1.2.0`, or `release-2026-11-02` all work; the
  leading `v` is only stripped for `v<digit>`.
- Keep at most 30 releases per app (the workflow trims to the 30 newest).

## Overriding inferred asset metadata

Automatic inference understands common names (`win-x64`, `arm64`, `.dmg`, `.AppImage`, `.msi`,
`.tar.gz`, `portable`, and so on). If a file is misclassified, add a release stub with the same
version and asset names to the template:

```json
"releases": [
  {
    "version": "1.2.0",
    "date": "2026-11-02",
    "assets": [
      {
        "name": "my-app-windows.exe",
        "os": "windows",
        "arch": "x64",
        "kind": "portable",
        "label": "Portable (no install)",
        "recommended": true
      }
    ]
  }
]
```

Only the listed fields override the generated asset. This is also how to supply a `sha256` when
`checksums: false`.

## Removing an app

Open a PR that deletes `apps/<id>.json`. The deployed site updates on merge. Mirrored files remain
in the hub's Releases; delete the `app-<id>-*` releases manually if you also want those gone.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `The source repository is private. Set mirror-assets: true` | Enable mirroring, or make the release assets public. |
| `GitHub API … failed (403)` while opening the PR | `HUB_TOKEN` is missing or lacks `Contents` / `Pull requests` write access to the hub. |
| `No manifest changes to submit` | The generated manifest matches what is already published. |
| `Manifest validation failed` | Read the field path in the error; check against the [manifest reference](MANIFEST.md). |
| Downloads 404 | Use public URLs, or enable `mirror-assets`. |
| Workflow is slow | It downloads assets for checksums. Use `checksums: false` for huge releases. |
| Assets are misclassified | Add the override stub shown above. |
| No PR after a successful run | Check `dry-run` and the workflow log for the `Open a pull request` step. |

Validate locally at any time:

```sh
npm run validate
npm run validate -- --strict   # treat warnings as errors
```
