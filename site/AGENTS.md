<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Sago demo copy

Use sampled replies from the production prompt builder (`worker/src/prompts`) and
model profiles (`worker/src/codex.ts`). Run
`bun scripts/generate-site-replies.ts --conversation memory --output /tmp/replies.json`
from the repo root; its local fixtures perform no real service actions.

Keep reviewed wording in `src/demo-replies.json` and record matching requests,
model settings, prompt hashes and successful tools in `src/demo-copy-provenance.json`. Adapt presentation without inventing a separate personality prompt
or rewriting her voice. Host cards, scheduled notices and T3/Codex updates follow
their own delivery code. Verify the shown facts and tool outcomes before publishing.
