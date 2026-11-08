# Manifest reference

Every published app is one JSON file: `apps/<id>.json`. The authoritative definition is
[`schemas/app.schema.json`](../schemas/app.schema.json); this page explains the fields and the
conventions the site relies on.

A manifest is validated twice:

1. structurally, against the JSON Schema (in CI and during the build);
2. semantically, by [`scripts/validate.mjs`](../scripts/validate.mjs) — id/file-name match, duplicate
   releases and assets, checksum format, icon existence, and so on.

Run `npm run validate` after editing.

## Example

```json
{
  "$schema": "../../schemas/app.schema.json",
  "id": "my-app",
  "name": "My App",
  "tagline": "One sentence about what it does.",
  "description": "Longer **Markdown** description shown on the app page.",
  "category": "developer-tools",
  "tags": ["cli", "cross-platform"],
  "icon": "/icons/my-app.svg",
  "accent": "#7cf29c",
  "featured": false,
  "license": "MIT",
  "author": { "name": "Your Name", "url": "https://example.com" },
  "links": {
    "repo": "https://github.com/you/my-app",
    "docs": "https://example.com/docs",
    "issues": "https://github.com/you/my-app/issues"
  },
  "install": {
    "brew": "brew install you/tap/my-app",
    "scoop": "scoop install my-app",
    "script": "curl -fsSL https://example.com/install.sh | sh",
    "powershell": "irm https://example.com/install.ps1 | iex"
  },
  "releases": [
    {
      "version": "1.2.0",
      "date": "2026-11-02",
      "channel": "stable",
      "title": "Optional release title",
      "notes": "### Changes\n\n- Markdown release notes.",
      "assets": [
        {
          "name": "my-app_1.2.0_linux_x64.tar.gz",
          "url": "https://github.com/you/my-app/releases/download/v1.2.0/my-app_1.2.0_linux_x64.tar.gz",
          "os": "linux",
          "arch": "x64",
          "kind": "archive",
          "recommended": true,
          "size": 8421376,
          "sha256": "9f2c1a4be7d0358c2f1b6a9d4e7c0b3a8d5e2f1c6b9a4d7e0f3c2b5a8d1e4f7c"
        }
      ]
    }
  ]
}
```

## Root fields

| Field | Required | Notes |
| --- | --- | --- |
| `id` | yes | Lowercase slug. Must match the file name and must never change once published — it is the URL (`/apps/<id>/`). |
| `name` | yes | Display name, max 60 characters. |
| `tagline` | yes | One sentence, max 140 characters. Shown on cards and in search. |
| `description` | no | Markdown, max 20,000 characters. Rendered on the app page. |
| `category` | yes | One of `developer-tools`, `productivity`, `media`, `security`, `networking`, `utilities`, `education`, `games`, `other`. |
| `tags` | no | Up to 10 short strings, used by search. |
| `icon` | no | Absolute `https://` URL or a path inside `public/` (e.g. `/icons/my-app.svg`). Square images work best; monochrome SVG is ideal. Falls back to a letter monogram. |
| `accent` | no | Six-digit hex colour, e.g. `#7cf29c`, used for the card glow. |
| `featured` | no | Pin the app to the top of the browse page. Use sparingly. |
| `license` | no | SPDX identifier or short label (`MIT`, `Apache-2.0`, `Proprietary`). |
| `author` | no | `{ "name": "…", "url": "…" }`. |
| `links` | yes | At least `repo` or `homepage`. See below. |
| `platforms` | no | Display override, e.g. `["windows","macos","linux"]`. Derived from assets when omitted. |
| `install` | no | Package-manager / script commands. See below. |
| `releases` | yes for publication | Newest first, 1–30 entries. A submission template may leave this empty; the workflow fills it in. |

## Links

Allowed keys: `repo`, `homepage`, `docs`, `changelog`, `issues`, `discussions`, `donate`. All must be
absolute URLs. At least one of `repo` or `homepage` is required.

## Install commands

Allowed keys and their display labels:

| Key | Label | Typical value |
| --- | --- | --- |
| `brew` | Homebrew | `brew install you/tap/my-app` |
| `scoop` | Scoop | `scoop install my-app` |
| `winget` | WinGet | `winget install You.MyApp` |
| `choco` | Chocolatey | `choco install my-app` |
| `cargo` | Cargo | `cargo install my-app` |
| `npm` | npm | `npm i -g my-app` |
| `pypi` | PyPI | `pip install my-app` |
| `pipx` | pipx | `pipx install my-app` |
| `go` | Go | `go install example.com/my-app@latest` |
| `docker` | Docker | `docker run --rm -it you/my-app` |
| `script` | Shell script | `curl -fsSL https://…/install.sh \| sh` |
| `powershell` | PowerShell | `irm https://…/install.ps1 \| iex` |

Commands are rendered with copy buttons. Only include ones that actually work.

## Releases

| Field | Required | Notes |
| --- | --- | --- |
| `version` | yes | Display string, e.g. `1.2.0` or `2026.11.02`. The site prefixes `v` in the UI. |
| `date` | yes | `YYYY-MM-DD`. Used for sorting and the "newest" filter. |
| `channel` | no | `stable` (default), `beta`, or `nightly`. The app page promotes the newest stable release. |
| `title` | no | Optional heading for the release. |
| `notes` | no | Markdown release notes. |
| `assets` | yes | 1–60 downloadable files. |

Keep entries newest-first. The validation script warns if the dates are out of order.

## Assets

| Field | Required | Notes |
| --- | --- | --- |
| `name` | yes | File name shown to users. Must be unique within a release. |
| `url` | yes | Direct public download URL (`https://` recommended). |
| `os` | yes | `windows`, `macos`, `linux`, `android`, `ios`, `web`, or `any`. |
| `arch` | no | `x64` (default display as "Any" if omitted), `arm64`, `x86`, `universal`, `any`. |
| `kind` | yes | `installer`, `portable`, `archive`, `package`, `script`, `dmg`, `msi`, `deb`, `rpm`, `appimage`, `binary`, `other`. |
| `label` | no | Friendly override, e.g. "Portable (no install)". |
| `recommended` | no | Prefer this file for a given OS when auto-detecting the visitor's platform. |
| `size` | no | Bytes. Shown next to the download. |
| `sha256` | no | 64 lowercase hex characters. Shown truncated with a copy button. |
| `sig` | no | URL of a detached signature or checksum file. |

### Conventions

- Prefer one clear `recommended` asset per OS: usually the installer (`installer`/`msi`/`dmg`) or
  `appimage`; fall back to `portable`, then `archive`.
- `kind: "other"` is never auto-recommended. Use it for checksum and signature files.
- Every asset should have `size` and `sha256`. The submission workflow computes both automatically.
- File names are shown verbatim, so use names users can recognise.

## Notes on hosting

- GitHub Pages is static. Download URLs must be publicly reachable, unless the assets were mirrored
  into this repository's Releases by the submission workflow.
- Remote icons are fetched by the visitor's browser; use small, cache-friendly images.
- Markdown is rendered at build time from reviewed pull requests. Do not paste untrusted HTML.
