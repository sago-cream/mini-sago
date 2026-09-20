# Discord roundtrip A/B replay

`roundtrip-ab.ts` compares the default handler with opt-in Jev routing, non-blocking
typing, lazy previous traces, and cached reply placement. It runs three concurrent
pairs with alternating dispatch order, then one sequential control pair. Answers
keep the same Luna/high profile. The gateway enables these optimizations; the harness explicitly selects each comparison arm.

Run it in an isolated checkout on the worker host with the worker's Codex runtime
and dependencies. Supply `BENCH_CORE_ENV_FILE` as an owner-only JSON file containing
the Discord bot token and chatbot access settings, `BENCH_MEMORY_DIRECTORY` as a
copy of the guild-memory directory, and `BENCH_OUTPUT` as the report destination.
The worker's existing runtime environment supplies Codex paths and its trace DB.
Pass `{apiKey, channelId, messageId, pairs: 3}` as JSON on stdin from a secure key
reader; never put the key in command arguments, source, or shell history.

The target must be the owner's existing `yo` request with a recorded route trace.
The replay sends eight real bot replies to that channel. It makes real history and
permission reads, but excludes messages newer than the original request to keep
context constant. MCP mutations are rejected. Trace writes go to a separate
benchmark database; the production trace database is read-only. Clean up the
credential file after running.

The measured boundary is handler invocation through the Discord POST acknowledgement.
It excludes user upload, gateway delivery, channel-queue wait, and client rendering.
Host and worker communicate over a real loopback WebSocket, rather than the deployed
cross-container connection. Optional host integrations need equivalent configuration
for an exact production-prompt replay. The latest-message cache is seeded outside
timing; the gateway observes messages before queuing work and invalidates state on reconnect. This is not a deployment script.

The `onTiming` callbacks emit names and timestamps only. HTTP children overlap their
parent requests. Codex turn-start and completed-answer events bound service/turn
work; they do not separately reveal provider queue, inference, and network latency.

Render the resulting JSON as a standalone HTML file:

```sh
python3 scripts/benchmarks/render-roundtrip.py path/to/report.json path/to/output.html
```

The renderer strips channel/message identifiers, credentials, and local paths. It
checks successful replies, identical answer profiles, empty nearby context, matched
timing boundaries, and contiguous stage totals before creating the visualization.

Pass `warm: true` to compare optimized cold execution with one retained Codex App
Server. Each answer gets a new conversation, deleted immediately after completion
to release its MCP processes. The first pair includes initial runtime startup.
The harness measures the retained process tree over 30 idle seconds after settling
for 15 seconds, reporting aggregate RSS and CPU as a percentage of one core.
Supply the warm report as the renderer's optional third argument to include both
experiments in one page. The benchmark is specific to the captured request; it
does not establish search latency or a reliable tail-latency estimate.
