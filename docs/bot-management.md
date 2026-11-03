# Bot management

The website groups owner controls under **Bot 管理**: custom status,
channel messaging, feature access, and slash-command diagnostics. Only the configured
`MINISAGO_CHATBOT_OWNER_USER_ID` receives these host-bound MCP tools through Sago.

## Custom status

Ask Sago to update her custom status, for example:

> 把自訂狀態改成「mini.sagocream.com」，保持在線。

`update_custom_status` accepts `text` (up to 128 characters; an empty or
whitespace-only string clears it) and optional `presence`: `online`, `idle`,
`dnd`, or `invisible`. Leaving `presence` out preserves the current presence.
The tool saves the requested status to durable storage before sending Discord
Gateway Update Presence. `updated` means the status was saved and sent; `saved`
means the durable change succeeded but Discord delivery is pending. Neither
result claims Discord has confirmed the visible presence. If there is no
running Gateway client, the tool returns `gateway_unavailable`.

The host limits presence sends to five per 20 seconds, including automatic
replay, following the [Discord Gateway limit](https://docs.discord.com/developers/events/gateway-events#activity-object).
A `rate_limited` result includes `retryAfterMs` and does not change the saved
status. Concurrent tool updates are serialized to preserve their order.

## Persistence and recovery

Status updates take effect without reconnecting. Both the custom text and online
presence survive automatic reconnects, process restarts, and container upgrades
when the core state volume is retained. Saved status is included in Identify and
reapplied on READY or RESUMED; disconnected updates remain saved for that replay.

`MINISAGO_BOT_STATUS_FILE` defaults to `/app/state/bot-status.json` in production
and `.data/bot-status.json` locally. Keep it on the persistent core volume.
The store writes a versioned JSON snapshot to a unique file with mode `0600`,
flushes it to disk, atomically replaces the destination, and flushes the parent
directory. The tool sends nothing if persistence fails. If a Gateway send fails
after saving, the desired status stays durable and the tool reports `saved`.

Only a missing file uses `DISCORD_CUSTOM_STATUS` (default
`mini.sagocream.com`) and `online` presence. An empty initial environment value
starts with no custom text. Saved values, including cleared text, override these
defaults. Malformed or unreadable saved state fails startup visibly rather than
silently resetting the status. Restore a valid snapshot from backup, or stop the
service and move the file aside to deliberately return to the initial default.
See [durable-state recovery](operations.md#durable-state-backup-and-restore).

These controls do not modify Discord's application bio or deploy the bot.

## Channel messages and access settings

The existing `send_channel_message` tool sends an explicitly requested message
(up to 2,000 characters) to an exact channel ID, or an unambiguous exact
case-insensitive server/channel name pair. Sago returns the sent message's link.
The bot must have permission to send in that destination.

`list_feature_availability` and `configure_feature_availability` inspect and
change registered feature coverage and role filters. These changes use the
existing persistent feature policy store. See
[feature registration and access](feature-registration.md) for scope and
inheritance, and [configuration](configuration.md) for initial setup.

## Slash-command diagnostics and repair

Ask Sago to check why `/ask` is missing, or to resync it to a specific server.
Only the configured owner receives `inspect_discord_commands` and
`sync_discord_commands`. Both accept an optional exact `guildId`, defaulting to
the conversation's guild; a DM requires an explicit guild ID. The host binds the
bot credentials and application ID. The tools verify the token's application
identity and bot access to the target guild before operating.

`inspect_discord_commands` reads global and guild registrations, command default
member permissions, guild command permission overrides (including application-wide
entries), install defaults, and whether interactions use Gateway or an HTTP
endpoint. Individual reads can return `unavailable` with an HTTP status; the
result is then `partial`. An unavailable read is unknown, never evidence that
there are no commands or restrictions. API error bodies and application secrets
are not returned.

Use `sync_discord_commands` only after an explicit request to register, sync, or
repair `/ask`. It creates `/ask` in the target guild or patches its existing
name, description, and prompt option from the shared install definition. It
preserves the existing command ID, permission defaults and overrides, unrelated
commands, global registrations, and other guilds. It does not run `sync:install`,
change install grants or interaction delivery, or enable the chatbot feature.
A fresh registration read confirms `synced`; `updated_unverified` means Discord
accepted the write but read-back failed. Neither means the command is visible
in every member's client. Permission inspection failures do not prevent reporting
a successful registration.

When diagnosing visibility, distinguish these separate checks:

- MiniSago's `chatbot` feature policy and its role filters;
- actual global and target-guild `/ask` registration;
- command default permissions and **Server Settings → Integrations** overrides;
- the affected member's **View Channel** and **Use Application Commands** permissions;
- the existing guild's application authorization, client refresh, and interaction delivery.

The tools do not compute effective permissions for a specific member/channel,
modify Discord permissions, or prove the existing installation's OAuth grants.
Install defaults only describe new installations. An HTTP interactions endpoint
routes commands away from MiniSago's Gateway handler; the manual install sync
clears it when that change is intended. See
[Discord's application-command documentation](https://docs.discord.com/developers/interactions/application-commands).
