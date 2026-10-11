# MiniSago website

A one-page Next.js feature guide, scaffolded with `npm create rail`. Browse
capabilities by audience, copy example requests, or search and filter the same
catalogue. All audience and access labels are visible and can be selected independently.
Examples can be hidden for a compact overview.
The page also introduces Sago's strengths, offers a first-message example beside the catalogue,
and links to the public bot's Discord server invitation.

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
Keep `INVITE_URL` aligned with the public application ID and the permissions in
`../scripts/sync-install-settings.mjs`.

The hero and avatar use the original `public/images/minisago3.png` artwork.
Keep the asset unchanged.

The GitHub logo is from [SVGL](https://svgl.app/); its license is in
`public/logos/SVGL-LICENSE.txt`.
