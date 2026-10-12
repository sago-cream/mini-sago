# Bot management

The website groups three owner controls under **Bot 管理**: custom status,
channel messaging, and feature access. Only the configured
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
