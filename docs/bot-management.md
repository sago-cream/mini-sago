# Bot management

The website groups three owner controls under **Bot management**: custom status,
channel messaging, and feature access. Only the configured
`MINISAGO_CHATBOT_OWNER_USER_ID` receives these host-bound MCP tools through Sago.

## Custom status

Ask Sago to update her custom status, for example:

> 把自訂狀態改成「mini.sagocream.com」，保持在線。

`update_custom_status` accepts `text` (up to 128 characters; an empty or
whitespace-only string clears it) and optional `presence`: `online`, `idle`,
`dnd`, or `invisible`. Leaving `presence` out preserves the current presence.
It sends Discord Gateway Update Presence immediately and returns `updated`
after sending, rather than waiting for a Discord confirmation event. The host
limits updates to five per 20 seconds, following the
[Discord Gateway limit](https://docs.discord.com/developers/events/gateway-events#activity-object).

The tool returns `gateway_unavailable` if there is no ready Gateway connection;
it does not claim success or change the current in-memory status in that case.
A `rate_limited` result includes `retryAfterMs`.

Status updates take effect immediately, without reconnecting. Status changes
survive automatic Gateway reconnects within the current process, including
resumed sessions. Process restarts restore `DISCORD_CUSTOM_STATUS` (default
`mini.sagocream.com`) and `online` presence. Configure an empty environment value to start with no custom
status. These tools do not modify Discord's application bio or deploy the bot.

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
