# Channel Almanac website

The project site, built with [Astro](https://astro.build). It is static HTML with one small
script: the "Type a date" demo runs the extension's own `../lib.js` (imported through a tiny
Vite plugin in `astro.config.mjs`), so the site always shows the real parser and search.

```bash
cd site
npm install
npm run dev      # http://localhost:4321
npm run build    # static output in dist/
```

- All copy lives in `src/data/site.ts`; the example channel used by the demo is generated in
  `src/data/channel.ts` (invented, labelled as an example on the page).
- Before deploying, set the real domain in `astro.config.mjs` (`site`), `src/data/site.ts`
  (`url`) and `public/robots.txt`.
- Design notes and decisions are in `DESIGN.md`.
