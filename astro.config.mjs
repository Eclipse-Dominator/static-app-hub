import fs from 'node:fs';
import { defineConfig } from 'astro/config';

// Set by .github/workflows/deploy.yml from actions/configure-pages.
// Locally these fall back to the configured production URL, hosted at the site root.
const hubConfig = JSON.parse(fs.readFileSync(new URL('./hub.config.json', import.meta.url), 'utf8'));
const site = process.env.SITE_URL || hubConfig.url || 'http://localhost:4321';
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  site,
  base,
  output: 'static',
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
  },
  devToolbar: {
    enabled: false,
  },
});
