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

| Feature              | Supported scopes |
| -------------------- | ---------------- |
| `chatbot`            | Guild, channel   |
| `ambient_reactions`  | Guild, channel   |
| `trip_planner`       | Guild, channel   |
| `ccxp_meetings`      | Guild            |
| `calendar`           | Guild            |
| `developer_steering` | Guild            |
| `mail`               | Guild, channel   |
| `drive`              | Guild            |

Channel rules override guild rules, which override a feature's default. A
nonempty `allowRoleIds` requires any matching role; `denyRoleIds` always wins.
Unknown roles fail closed when a filter exists. Each enable replaces the previous
filters. Omit filters or send empty arrays to clear them; inherit removes the rule.

Calendar, CCXP, developer steering, Mail, and Drive require explicit registration
with a disabled global default. The owner's chatbot and developer steering access
continues everywhere. Mail also permits the owner's private text DM and excludes
voice. Calendar, CCXP, and Drive exclude DMs.

Mail replies can be seen by everyone who can view the requesting conversation.
Registration grants access to configured connected mailboxes; each mailbox still
needs its owner's read-only OAuth grant. Drive still requires the dedicated
service account, approved drives, Google file ACLs, and mapped Discord roles.
Calendar mutations still require confirmation.

## Persistent state and upgrades

`MINISAGO_FEATURE_AVAILABILITY_FILE` selects the existing version-1 JSON policy.
Its production default is `/app/state/feature-availability.json`. Saved policies,
including revocations and role filters, remain authoritative. An older policy
without Drive gains its previous guild `1514899496797212683` once. Mail gains no
initial registrations. The next owner change persists the migrated snapshot.

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
