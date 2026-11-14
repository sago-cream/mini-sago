# Discord coding with T3

Discord is another frontend to a normal T3 coding session. Only the configured
MiniSago owner may start, steer, stop, or end coding sessions. Other participants'
messages, bot messages, and webhooks never control the agent.

## Setup

1. Run a T3 environment independently of the Discord bot, with a working coding
   provider and the GitHub credentials and tools that you normally use in T3.
2. Register the projects you want to use. The Discord router uses the GitHub
   repositories of active T3 projects, rather than the chat worker's GitHub login.
   Keep one active project per repository. Configure its model, permissions,
   setup scripts, skills, MCP servers, and repository instructions in T3.
3. Copy the environment's MCP URL from T3 Settings → Environments. Set
   `MINISAGO_T3_URL` on the bot host and run `bun run t3:login` with the same
   environment variables. The login prints a browser authorization link and
   listens on `127.0.0.1:38471`. On a remote host, forward that port over SSH
   before opening the link. Approve MiniSago with the permission ceiling you want
   coding sessions to use. A read-only grant cannot start work.
4. Keep the resulting OAuth file private and persistent. Its default production
   location is `/app/state/t3/oauth.json`; override it with
   `MINISAGO_T3_CREDENTIALS_PATH`. Use a grant issued specifically for MiniSago,
   rather than copying an agent session token or browser credential.
5. Set `MINISAGO_CHATBOT_REPOSITORY` on the bot host to identify Sago's own
   registered project, then restart the bot.

Use HTTPS for a remote environment or HTTP on localhost/container-local hosts.
For a private Docker MCP URL, set `MINISAGO_T3_WEB_URL` to the HTTPS origin you
use to open the UI, so Discord links work from your computer. The bot host must be
able to reach the endpoint. The T3 UI and provider processes stay on the machine
that owns the environment; bot deployment does not replace them. Tokens refresh
through the standard MCP OAuth client when the server supports refresh. If the
grant expires or is revoked, run the login again; never send credentials through
Discord.

The core image includes the login script. For a container deployment, run that
script in an ephemeral container with host networking and the same persistent
state volume and environment as the bot. Forward the loopback callback port from
your browser's computer to the host. Keep the login container off the Discord
Gateway; the script only performs T3 authorization.

## Use

Ask Sago to change a registered project, optionally replying to a message,
forwarding context, or attaching screenshots. Sago creates a Discord thread
(or reuses the current thread or owner DM), starts an ordinary T3 thread in a
fresh worktree, and posts its model, permission mode, branch, and **Open in T3**
link. Model and permission defaults come from the T3 project.

To start separate work from an existing thread, ask, for example, "open another
t3 linked dev thread to work on next.js version update" or "另開開發討論串更新
Next.js". Sago creates a sibling thread in the same parent channel, links its own
T3 session and worktree, starts the requested work, and posts the new Discord
thread link in the original conversation. The current project is supplied to the
router when the new task leaves it implicit; name another registered project to
switch repositories. Private threads create private siblings and add the owner.
Forum and media channels receive a new post with a link to the source request.

Replies go straight to that same session. Text follow-ups use T3's automatic
start/steer/queue behavior. Files use T3's native attachment delivery, which queues
a new message according to its own semantics. Up to eight files, 20 MB each and
40 MB combined, can be sent per message. Referenced Discord attachments are
included and expired CDN links are refreshed through Discord.

Assistant messages and plans stay visible in Discord. Streaming updates edit the
same message. Longer text is split across messages. Detailed commands, diffs,
artifacts, and approvals remain available in T3. Single native task questions
can be answered by replying in Discord. Multi-question forms and tool approvals
link to T3; a Discord reply never grants an outstanding tool approval. Ordinary image-generation requests still use the
chat worker and return Discord attachments.

- `status` refreshes the session's status message without running the agent.
- `stop` or `pause` uses T3's Stop operation, including its queued work and
  delegated-task behavior. It preserves the session and files.
- Reply again to continue. T3 owns the execution lifecycle and agent history.
- `end dev thread` stops work and detaches Discord. The T3 session and workspace
  remain available. If T3 cannot confirm the stop, the association stays intact.

Existing PR links and GitHub review notifications remain available. T3 manages
its own PR associations; there is no additional PR state machine in the bot.

## Recovery and trust

The bot persists its T3 thread/project association, environment URL, Discord
message receipts, and output delivery position in
`MINISAGO_DEVELOPER_THREADS_PATH`. Restarting reconnects and catches up on T3
output, including work started from the T3 UI. It never restarts a coding task.
Associations remain until explicitly ended. Undelivered output is retried;
ambiguous outbound messages are reported for inspection rather than replayed.
A different environment URL never starts a replacement task automatically.

The Discord relay schedules the next due refresh: active sessions every three
seconds, idle or finished sessions every 15 seconds, and failed reads after 30
seconds. With no connected sessions, it checks storage every 30 seconds. New
Discord requests wake the relay immediately.

A T3 worktree avoids checkout conflicts; it is not a filesystem or credential
sandbox. The agent runs with the T3 account's access and selected permission
mode. Keep Discord bot credentials and unrelated production secrets outside
that environment, and enforce protected branches at GitHub. Merge and deployment
authorization follows the owner's instructions and repository guidance.

For MiniSago deployment, keep the existing bounded deployment socket and configure
its MCP adapter in the T3 environment if that machine has access to the socket.
Other environments can use the repository's documented deployment command.
The first T3 message includes the source Discord conversation. For the bounded
socket command, set `MINISAGO_DISCORD_CHANNEL_ID` to that conversation's channel
ID so the bot can deliver the deployment result there.

Saved tasks from the previous worker runtime remain identifiable, and their files
are preserved. Their Codex session IDs are never interpreted as T3 thread IDs.
End the old association and start a new T3 task; preserve or transfer unfinished
work before retiring the old worker workspace.
