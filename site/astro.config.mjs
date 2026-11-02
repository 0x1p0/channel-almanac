// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The site runs the extension's own lib.js (typed dates, the lookup search) instead of a copy.
// lib.js is a classic script that defines `CDF`; this exposes it as `virtual:almanac-lib`.
const LIB = fileURLToPath(new URL('../lib.js', import.meta.url));
const almanacLib = () => ({
  name: 'almanac-lib',
  resolveId: (id) => (id === 'virtual:almanac-lib' ? '\0almanac-lib' : null),
  load(id) {
    if (id !== '\0almanac-lib') return null;
    this.addWatchFile(LIB);
    return `${readFileSync(LIB, 'utf8').replace(/^if \(typeof module.*$/m, '')}\nexport default CDF;\n`;
  },
});

// Set `site` to the production URL before deploying: canonical, OG and sitemap depend on it.
export default defineConfig({
  site: 'https://channel-almanac.vercel.app',
  integrations: [sitemap({ filter: (page) => !page.includes('/404') })],
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  build: { inlineStylesheets: 'auto' },
  vite: { plugins: [almanacLib()] },
});
