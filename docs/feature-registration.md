# Feature access and registration

All request capabilities declare an access mode in
`src/discord/features.ts`. The owner can inspect the modes and requirements
with `list_feature_availability`. Only registered features accept policy changes;
owner-only actions stay owner-only, and request features inherit the host's
request authorization and their existing resource permissions.

| Mode         | Meaning                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------- |
| `registered` | The owner chooses approved guilds/channels and optional role filters.                                   |
| `owner`      | Only the bot owner may use the feature. Some also require a registered guild, such as CCXP maintenance. |
| `request`    | Available within an authorized request when its resources or worker are available.                      |

## Configure coverage

Ask Sago to list registrations first, then use
`configure_feature_availability` with a feature, scope, exact Discord ID, and
`enable`, `disable`, or `inherit`. The host verifies the target and any role IDs
against Discord. Changes apply immediately and persist across restarts.

| Feature               | Supported scopes |
| --------------------- | ---------------- |
| `chatbot`             | Guild, channel   |
| `automatic_followups` | Guild            |
| `ambient_reactions`   | Guild, channel   |
| `trip_planner`        | Guild, channel   |
| `ccxp_meetings`       | Guild            |
| `calendar`            | Guild            |
| `developer_steering`  | Guild            |
| `mail`                | Guild, channel   |
| `drive`               | Guild            |

Channel rules override guild rules, which override a feature's default. A
nonempty `allowRoleIds` requires any matching role; `denyRoleIds` always wins.
Unknown roles fail closed when a filter exists. Each enable replaces the previous
filters. Omit filters or send empty arrays to clear them; inherit removes the rule.

Automatic follow-ups, Calendar, CCXP, developer steering, Mail, and Drive require
explicit registration with a disabled global default. The owner's chatbot and developer steering access
continues everywhere. Mail also permits the owner's private text DM and excludes
voice. Automatic follow-ups, Calendar, CCXP, and Drive exclude DMs. Automatic
follow-ups also exclude voice and have no owner bypass.

Mail replies can be seen by everyone who can view the requesting conversation.
Registration grants access to configured connected mailboxes; each mailbox still
needs its owner's read-only OAuth grant. Drive still requires the dedicated
service account, approved drives, Google file ACLs, and mapped Discord roles.
Calendar mutations still require confirmation.

## Automatic follow-ups

`automatic_followups` is disabled in every guild by default, including for the
owner. Mentions, replies that notify the bot, `/ask`, and coding-thread steering
continue independently of this setting. To opt in a guild, the owner can use:

```json
{
  "feature": "automatic_followups",
  "scope": "guild",
  "targetId": "917436845187563610",
  "action": "enable"
}
```

When enabled, the original requester's next unmentioned message in the same
channel, within 90 seconds of an answer, can invoke another answer. The rule does
not determine intent or topic; another person's intervening message or a message
mentioning another user consumes the window. A new answer restarts the window.
Chatbot authorization, role filters, and channel quiet mode still apply. Use
`disable` or `inherit` to turn follow-ups off again.

## Persistent state and upgrades

`MINISAGO_FEATURE_AVAILABILITY_FILE` selects the existing version-1 JSON policy.
Its production default is `/app/state/feature-availability.json`. Saved policies,
including revocations and role filters, remain authoritative. An older policy
without Drive gains its previous guild `1514899496797212683` once. Mail gains no
initial registrations. Automatic follow-ups also gain no initial registrations,
so upgrades disable them in every guild. The next owner change persists the
migrated snapshot.

The shared store holds its current snapshot in memory. Use the owner tools for
live changes; direct external file edits require a restart. Background feed
subscriptions remain in their separate destination store.

## Add a feature

1. Add one typed definition to `FEATURE_DEFINITIONS`: access mode, requirements,
   and capability/tool metadata. Registered entries must also declare supported
   scopes, initial policy, DM/voice behavior, and any owner exception. Initial
   registrations are an access decision; use a disabled default and empty rules
   unless coverage has already been approved.
2. Construct integration clients with `createFeatureAccess` and trusted host
   context. Resolve current membership from Discord for protected guild reads.
   Use `guardFeatureClient` or `withFeatureAccess` to check before execution and
   before releasing read results. Keep credential validation, resource ACLs,
   account identity checks, and mutation confirmation in the integration.
3. Expose the handler through the host MCP registration helper. Every session
   must supply its trusted feature access factory. It requires a
   declared tool mapping, hides denied tools, checks access at execution, and
   rechecks read results. Generate capability descriptions with
   `featureCapability`; schema/tool mapping tests detect missing declarations.
4. Update user docs and test migration, role changes, scope restrictions, and
   revocation. Registration schemas, owner listings, defaults, and capability
   names derive from the definition.

See [Configuration](configuration.md#feature-registrations-and-role-filters)
for filters and [Mail setup](mail.md) for mailbox authorization.

## Bot management

`bot_status` (`update_custom_status`) is an owner-only capability, alongside
`channel_messaging`, `developer_thread_control` (`end_developer_thread`), and
`feature_availability`. These are not guild registrations:
enabling a community feature never grants bot management access. Identity is
bound by the host and checked again on every MCP call. See
[bot management](bot-management.md).
