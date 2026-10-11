# MiniSago website

A Next.js feature guide, scaffolded with `npm create rail`. Browse capabilities,
filter or search them, expand example requests, and follow the setup guides.

From the repository root:

```sh
npm --prefix site ci
npm --prefix site run dev
npm --prefix site run check
```

`check` runs TypeScript, ESLint, Prettier, and a production build. The build
exports a static site to `site/out/`; serve that directory with any static host.
No bot credentials or backend connection are needed.

Update `src/features.ts` when capabilities or access requirements change, and
keep its guide links aligned with `../docs/`.

The site uses the original Sago 3 artwork: `public/images/sago3.png` for the hero
and `public/images/minisago3.png` for the avatar. Keep these assets unchanged.
