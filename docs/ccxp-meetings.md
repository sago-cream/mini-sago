# CCXP meeting retrieval

MiniSago searches the login-protected NTHU meeting archive in owner-registered
guilds. Initial registrations are `1394943277836402779`
(115學年度學生議會暨學代議題討論群) and `1000249491494019092`. Unregistered guilds
and DMs never receive these tools, including requests from the bot owner.
Related policy, governance, budget, curriculum, and campus-planning questions
instruct the answer worker to search automatically, read matching pages, and
cite the meeting title, page, and CCXP category link. This is retrieval during
an answer, not an unsolicited background posting service.

## Guild registration

CCXP uses the existing persistent feature policy (`ccxp_meetings`). The bot
owner can ask MiniSago to register a guild, revoke its access, or list registered
guilds. For example: “Enable CCXP meeting access in guild 1000249491494019092.”
The owner-only `configure_feature_availability` tool uses:

```json
{
  "feature": "ccxp_meetings",
  "scope": "guild",
  "targetId": "1000249491494019092",
  "action": "enable"
}
```

Use `disable` or `inherit` to revoke access; the feature default is always
disabled. Channel registrations are rejected. Guild members cannot register
their own guild. The host verifies that the bot can access the requested guild
before changing the policy. Registration requires no deployment or restart;
new requests use the updated policy, and revoked guilds lose access even through
existing MCP sessions. Normal chatbot access is configured separately.

Registrations are stored in `MINISAGO_FEATURE_AVAILABILITY_FILE` (normally
`/app/state/feature-availability.json` in production). Existing feature files
without CCXP receive the two initial registrations on upgrade. Once a CCXP
policy exists, its saved decisions, including an empty list, take precedence.
The collector and configured index are still required before retrieval works.

## Architecture

A separate collector runs on Oracle ARM64, authenticates through headless
Chromium with the checksum-pinned ccxpLite 1.11.0 release, and reuses its private
browser profile and CCXP session token. The extension's background analytics
worker is disabled; captcha inference uses its bundled local model. Chromium
is Playwright's bundled browser, which supports headless extensions with a
persistent context. The bot core and Codex jobs never receive the password,
browser profile, session token, or document-key URLs.

The collector follows only the eleven observed meeting categories under
`/ccxp/INQUIRE/OT/SCRT/2/`. Authenticated attachment requests preserve cookies
and validate redirects inside that subtree. The academic-affairs and curriculum
categories also allow their listed PDFs under
`https://academic.site.nthu.edu.tw/var/file/7/1007/img/`, without CCXP cookies.
PDF text is extracted by page;
older HTML records use numbered text sections. Non-text PDFs and unsupported
formats are counted explicitly; OCR and Word extraction are not included.
Downloads are bounded to 30 MiB, 1,000 PDF pages, and three million characters
per document. Documents are fetched sequentially with a 500 ms gap.

The collector publishes a SQLite snapshot by atomic rename. The core opens
it read-only for each MCP call. Chinese bigrams make two-character keywords
searchable; whitespace-separated keywords must all appear on the same page
or in its title. Search returns at most ten snippets, and reads return at most
12,000 characters at a time. There is no caller-supplied URL or filesystem path.

Each pass attempts at most 100 downloads, interleaving categories newest-first.
Initial backfill continues every
15 minutes until complete, then sync runs every six hours. The ten newest
records in each category are refreshed daily; older records every 30 days.
Every successful listing refresh removes withdrawn records from that category.
Listing/authentication failures preserve the previous snapshot. Failed
downloads retain old text and increase the pending count. Results report the
listing check time, per-document fetch time, pending/unsupported/empty counts,
and whether the listing check is over 48 hours old. Empty results must never
be described as proof that a topic was not discussed.

## Install on Oracle

The collector is optional and independent of the chat worker. It has no public
port. `compose.ccxp.yaml` sets a one-CPU, 2 GiB limit and persistent volumes.

1. Create a dedicated secret directory containing **only** `ccxp.env`:

   ```dotenv
   CCXP_ACCOUNT=your-account
   CCXP_PASSWORD='your-password'
   ```

   Quote the password according to dotenv syntax. Make the directory `0700`
   and the file `0600`, owned by the container's `bun` user (UID 1000).
   This directory is mounted read-only; replacing the file atomically works
   without recreating the container. Do not mount the general production
   secret directory into the collector.

2. After the PR is merged and the collector image is published, copy
   `compose.ccxp.yaml` to the operations checkout and start it:

   ```bash
   CCXP_SECRETS_DIR=/srv/sago-cloud/secrets/ccxp \
     docker compose -f compose.ccxp.yaml up -d --no-build --pull always
   ```

3. In the bot-core deployment, mount external volume `minisago-ccxp-index`
   read-only at `/ccxp-index`. Set
   `MINISAGO_CCXP_INDEX_PATH=/ccxp-index/meetings.sqlite` and restart the core
   through its normal release workflow. The reader runs as UID 1000; preserve
   matching volume ownership. Do not mount the session volume into the core
   or a Codex worker.

   The `main` workflow publishes `ghcr.io/sago-cream/minisago-ccxp` with both
   `main` and `sha-<commit>` tags. Pin the image to the reviewed commit tag in
   production. A local build is also available with `--build` from this repo.

4. Verify collector logs report `ccxp_sync` counts, then ask about a known
   meeting topic in the authorized guild. Confirm the answer includes a title,
   page, and sign-in link. Source links intentionally omit `ACIXSTORE` and `l`;
   readers sign into CCXP themselves and find the cited title in its category.
   The two academic categories can instead cite their public PDF URLs.

The collector reads `CCXP_CREDENTIALS_FILE` (default `/run/secrets/ccxp.env`),
`CCXP_STATE_DIR` (`/state`), `CCXP_INDEX_PATH` (`/index/meetings.sqlite`), and
`CCXP_EXTENSION_PATH` (`/opt/ccxplite`). `CCXP_FORCE_SYNC=true` is a diagnostic
override; do not leave it enabled on the recurring process. Only one collector
may write a given index/session volume.

## Password rotation and owner notices

When CCXP rejects the login or requires a password change, the collector
records `auth_required` and stops resubmitting the unchanged credential file.
The core checks this status every five minutes and DMs the configured
`MINISAGO_CHATBOT_OWNER_USER_ID` once per incident. A durable checkpoint in
`/app/state/ccxp-auth-notification` suppresses repeats across restarts; failed
DM delivery is retried. The notice contains a login link and recovery steps,
never the credential or protected records. No notice is sent during ordinary
healthy syncs. `DISCORD_GATEWAY_DISABLED=true` also disables this notifier.

Complete CCXP's required password change yourself, then replace `ccxp.env` with
the new password. The collector notices the file change within one minute and
tries again. It never changes your password. The last successful index remains
searchable during an outage with its original data timestamps. A valid cached
session may continue to work until CCXP actually requires reauthentication;
the integration does not guess the school's expiry date.

The index contains protected records. Keep the volume private and out of Git,
public backups, and artifacts. The profile/credential volume is a separate
secret boundary. Protected meeting text must not be saved in guild memory.

## Verification

```bash
bun install --cwd ccxp --frozen-lockfile
bun run --cwd ccxp build
bun test src/chatbot/ccxp-meetings.test.ts src/chatbot/mcp.test.ts \
  src/discord/jobs/ccxp-auth-notifications.test.ts ccxp/src/sync.test.ts
docker build -f Dockerfile.ccxp -t minisago-ccxp:test .
docker run --rm --init --shm-size=256m \
  -e CCXP_TEST_EXTENSION=/opt/ccxplite minisago-ccxp:test bun test
```

The browser test uses an intercepted login fixture and the released extension;
it does not submit production credentials. CI runs the collector image and
browser test on ARM64. Live verification requires separately provisioned CCXP
credentials; never add them to CI or fixture files.

An operator can run `bun src/live-smoke.ts` in the collector image with
`CCXP_LIVE_SMOKE=true` and **separate disposable state/index mounts**. It checks
all eleven listings, downloads the newest record in each, and verifies indexed
text and Chinese search. It outputs counts, not document bodies or sessions;
it does not provision production or contact Discord.

References: [NTHU meeting archive access](https://secretary.site.nthu.edu.tw/p/412-1070-3550.php),
[Playwright headless extensions](https://playwright.dev/docs/chrome-extensions),
[ccxpLite release](https://github.com/sago-cream/ccxp-lite/releases/tag/v1.11.0).
