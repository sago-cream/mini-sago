# MiniSago website

A one-page Next.js feature guide, scaffolded with `npm create rail`. Capabilities
are grouped by audience and familiar activities, such as chatting or processing
files. Each activity has one short description and one example. Setup and access
information is stated at the audience level. The page also
introduces her strengths and links to the public bot's Discord server invitation.

From the repository root:

```sh
npm --prefix site ci
npm --prefix site run dev
npm --prefix site run check
```

`check` runs TypeScript, ESLint, Prettier, and a production build. The build
exports a static site to `site/out/`; serve that directory with any static host.
No bot credentials or backend connection are needed.

Update `src/features.ts` when capabilities or access requirements change.
Keep `INVITE_URL` aligned with the public application ID and the permissions in
`../scripts/sync-install-settings.mjs`.

The hero and avatar use the original `public/images/minisago3.png` artwork.
Keep the asset unchanged.

The GitHub logo is from [SVGL](https://svgl.app/); its license is in
`public/logos/SVGL-LICENSE.txt`.
