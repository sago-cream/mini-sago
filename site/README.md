# MiniSago website

A Next.js feature guide, scaffolded with `npm create rail`. The homepage walks
through tasks with example requests. `/features/` offers a compact catalogue
with search, category and access filters, and links to GitHub guides.

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

The hero and avatar use the original `public/images/minisago3.png` artwork.
Keep the asset unchanged.
