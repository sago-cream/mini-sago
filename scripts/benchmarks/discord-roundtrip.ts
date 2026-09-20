import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const argument = (name: string) => {
  const index = Bun.argv.indexOf(name);
  return index < 0 ? undefined : Bun.argv[index + 1];
};
const channelId = argument("--channel");
if (!channelId || !/^\d{17,20}$/u.test(channelId)) {
  throw new Error("Pass --channel with the Discord test channel ID.");
}
const output = resolve(
  argument("--output") ?? ".data/benchmarks/discord-roundtrip.json",
);

async function remoteJson(container: string, source: string) {
  const child = Bun.spawn(
    [
      "ssh",
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=10",
      "sago-cloud",
      `docker exec -i ${container} bun -`,
    ],
    { stdin: "pipe", stdout: "pipe", stderr: "pipe" },
  );
  child.stdin.write(source);
  child.stdin.end();
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0)
    throw new Error(`Read-only trace collection failed: ${stderr}`);
  return JSON.parse(stdout);
}

type WorkerRow = {
  job_id: string;
  request_message_id: string;
  purpose: string;
  started_at: number;
  finished_at: number;
  model: string;
  prompt_version: number;
  nearby_count: number;
  prompt_metadata_json: string | null;
  tool_trace_json: string | null;
  reply: string | null;
};
type Message = {
  id: string;
  timestamp: string;
  content: string;
  bot: boolean;
  referenceId: string | null;
};

const [worker, discord] = (await Promise.all([
  remoteJson(
    "sago-cloud-minisago-worker-worker-1",
    `import { Database } from 'bun:sqlite';
const db = new Database(process.env.MINISAGO_TRACE_DATABASE_PATH || '/var/lib/minisago/traces.sqlite', { readonly: true });
const rows = db.query("SELECT job_id, request_message_id, purpose, started_at, finished_at, model, prompt_version, json_array_length(json_extract(input_json, '$.messages')) AS nearby_count, prompt_metadata_json, tool_trace_json, CASE WHEN purpose = 'answer' AND json_valid(output) THEN json_extract(output, '$.reply') ELSE NULL END AS reply FROM chatbot_trace_jobs WHERE channel_id = ? AND lower(trim(json_extract(input_json, '$.request'))) = 'yo' AND status = 'complete' AND json_extract(input_json, '$.requesterUserId') = ? ORDER BY started_at DESC LIMIT 20").all(${JSON.stringify(channelId)}, process.env.MINISAGO_CHATBOT_OWNER_USER_ID);
db.close();
console.log(JSON.stringify({ collectedAt: Date.now(), rows }));`,
  ),
  remoteJson(
    "sago-cloud-bot-core-bot-core-1",
    `const headers = { Authorization: 'Bot ' + process.env.DISCORD_BOT_TOKEN };
async function read(path) {
 const response = await fetch('https://discord.com/api/v10' + path, { headers, signal: AbortSignal.timeout(15000) });
 if (!response.ok) throw new Error('Discord read returned HTTP ' + response.status);
 return response.json();
}
const [self, channel, messages] = await Promise.all([read('/users/@me'), read('/channels/' + ${JSON.stringify(channelId)}), read('/channels/' + ${JSON.stringify(channelId)} + '/messages?limit=100')]);
console.log(JSON.stringify({ collectedAt: Date.now(), channelType: channel.type, messages: messages.filter(message => message.author.id === self.id || message.author.id === process.env.MINISAGO_CHATBOT_OWNER_USER_ID).map(message => ({ id: message.id, timestamp: message.timestamp, content: message.content, bot: message.author.id === self.id, referenceId: message.message_reference?.message_id ?? null })) }));`,
  ),
])) as [
  { collectedAt: number; rows: WorkerRow[] },
  { collectedAt: number; channelType: number; messages: Message[] },
];

const messages = discord.messages.sort((left, right) =>
  left.timestamp.localeCompare(right.timestamp),
);
const requestIds = [
  ...new Set(worker.rows.map((row) => row.request_message_id)),
];
const runs = [];
for (const requestId of requestIds) {
  const route = worker.rows.find(
    (row) =>
      row.request_message_id === requestId && row.purpose === "execution_route",
  );
  const answer = worker.rows.find(
    (row) => row.request_message_id === requestId && row.purpose === "answer",
  );
  const request = messages.find(
    (message) => message.id === requestId && !message.bot,
  );
  if (!route || !answer || !request) continue;
  const requestMs = Date.parse(request.timestamp);
  const nextRequest = messages.find(
    (message) => !message.bot && Date.parse(message.timestamp) > requestMs,
  );
  const candidates = messages.filter(
    (message) =>
      message.bot &&
      Date.parse(message.timestamp) >= answer.finished_at &&
      (!nextRequest ||
        Date.parse(message.timestamp) < Date.parse(nextRequest.timestamp)) &&
      (message.referenceId === requestId ||
        message.content.trim() === answer.reply?.trim()),
  );
  if (candidates.length !== 1) {
    console.warn(
      `Skipping a request with ${candidates.length} unambiguous matching replies.`,
    );
    continue;
  }
  const reply = candidates[0]!;
  const replyMs = Date.parse(reply.timestamp);
  const boundaries = [
    requestMs,
    route.started_at,
    route.finished_at,
    answer.started_at,
    answer.finished_at,
    replyMs,
  ];
  if (
    boundaries.some(
      (value, index) => index > 0 && value < boundaries[index - 1]!,
    )
  ) {
    throw new Error(
      "Non-monotonic timestamps: check host/Discord clock synchronization.",
    );
  }
  const labels = [
    "Discord delivery + host preparation",
    "Owner routing job",
    "Worker handoff + previous-trace lookup",
    "Answer job",
    "Host delivery + Discord message creation",
  ];
  const phases = labels.map((label, index) => ({
    label,
    startMs: boundaries[index]! - requestMs,
    endMs: boundaries[index + 1]! - requestMs,
    durationMs: boundaries[index + 1]! - boundaries[index]!,
  }));
  const tools = JSON.parse(answer.tool_trace_json || "[]") as Array<{
    name: string;
  }>;
  runs.push({
    requestId,
    replyId: reply.id,
    startedAt: request.timestamp,
    completedAt: reply.timestamp,
    totalMs: replyMs - requestMs,
    nearbyMessageCount: answer.nearby_count,
    routeModel: route.model,
    answerModel: answer.model,
    promptVersion: answer.prompt_version,
    routePrompt: JSON.parse(route.prompt_metadata_json || "null"),
    answerPrompt: JSON.parse(answer.prompt_metadata_json || "null"),
    recordedTools: tools.map((tool) => tool.name),
    phases,
  });
}
runs.sort((left, right) => left.startedAt.localeCompare(right.startedAt));
const report = {
  measuredAt: new Date().toISOString(),
  channelId,
  scope:
    "Live production owner yo requests, paired with actual Discord bot replies. Discord server creation timestamps bound the roundtrip; worker SQLite timestamps bound routing and answer jobs.",
  limitations: [
    "Client upload before Discord creates the request and client rendering after Discord creates the reply are not captured.",
    "Preparation and delivery combine multiple operations; their internal substeps are not separately timed.",
    "Worker jobs include process startup, MCP startup, model inference, validation, and cleanup; this trace cannot attribute those internal portions.",
    "Recorded tool calls cover selected MiniSago MCP tools; the trace omits built-in web search and campus tool events.",
  ],
  runs,
};
await mkdir(dirname(output), { recursive: true });
await Bun.write(output, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      output,
      runs: runs.map(
        ({ totalMs, nearbyMessageCount, phases, recordedTools }) => ({
          totalMs,
          nearbyMessageCount,
          phases,
          recordedTools,
        }),
      ),
    },
    null,
    2,
  ),
);
if (!runs.length) process.exitCode = 2;
