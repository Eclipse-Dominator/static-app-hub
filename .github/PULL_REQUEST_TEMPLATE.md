<!--
Adding or updating an app? Keep the manifest JSON in this PR and fill in the
relevant section. General site changes can ignore the app checklist.
-->

## What changed

<!-- A sentence or two. Link the upstream release if this is an app submission. -->

## App submission checklist

- [ ] `apps/<id>.json` is the only app file changed (plus an icon, if needed)
- [ ] The app has a stable `id`; it matches the file name
- [ ] Download URLs are public, or assets were mirrored with `mirror-assets: true`
- [ ] `npm run validate` passes
- [ ] File sizes and SHA-256 checksums are present
- [ ] The metadata (name, tagline, links, license) is accurate
- [ ] Release notes and channels are correct

## Site change checklist

- [ ] `npm run build` succeeds
- [ ] Checked both light and dark themes
- [ ] Checked at a narrow viewport
