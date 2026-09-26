# Development tasks in Discord

A coding thread owns one durable task and repository checkout. Replies continue
that task on its original worker and Codex session. `status` updates the task's
status card; `stop` pauses it. These commands apply to development threads only.
Only the original requester, who must still be the configured owner, can steer
or resume the task. After a merge, address the bot explicitly to resume it.

## Controller and runner

The core stores tasks, owner directions, incoming message IDs, worker leases,
state transitions, and undelivered results in SQLite. Configure
`MINISAGO_DEV_TASK_DATABASE_PATH` on persistent storage. The core image defaults
to `/app/state/developer-tasks.sqlite`; local runs use `.data/developer-tasks.sqlite`.
Back up the database with SQLite's backup API, or stop the core before copying
it and its WAL files. The database contains private task context and pending
review artifacts and is created with mode 0600.

`MINISAGO_DEV_CONCURRENCY` defaults to one. Extra development turns wait in the
controller, leaving additional worker slots available for chat. Keep
`MINISAGO_MAX_CONCURRENT_JOBS` greater than the dev limit when sharing a worker.
The queue accepts at most 20 pending directions per task and deduplicates
Discord message IDs. An unavailable original worker leaves a task queued; the
controller never silently gives its local checkout to another worker.

The task root under `MINISAGO_GITHUB_WORKTREE_ROOT/<task-id>` contains:

- `<owner>/<repository>/`: branch and working tree, including uncommitted files;
- `tmp/`: stable shell temporary storage;
- `attachments/`: retained inputs for successive turns;
- `artifacts/`: requested review outputs;
- `checkpoints/`: head, branch, session, workspace, and dirty-state records.

A checkpoint describes the retained checkout; it is not a portable backup.
There is no automatic workspace deletion or migration. Operators must preserve
working files, attachments, artifacts, and the worker's Codex session volume
before moving or retiring a task. Old threads created before durable task
storage was deployed cannot be recovered automatically from the new database.

Each turn launches a fresh app-server process and resumes the stored Codex
thread with current filesystem configuration. Before invoking the model, the
worker checks directory access, Git metadata writes, temporary-file creation,
and GitHub repository read access through the actual Codex shell sandbox, as
the worker service user. A failed preflight is an environment block. Dev turns
explicitly disable account connectors, plugins, and unrelated MCP servers;
the ordinary account-wide skill catalog is not advertised.

A controller restart marks in-flight work as interrupted and retains its
workspace. It does not replay a turn that might have published changes. A new
owner reply resumes after the previous 16-minute lease expires. Generation
checks reject stale results. Worker disconnection cancels that worker's active
jobs. Final outcomes and Discord results commit together; the outbox retries
failed deliveries with a stable nonce. Discord nonce deduplication is bounded
by Discord's retention window, so this is at-least-once delivery, not a promise
of exactly-once delivery across arbitrarily long outages.

## Outcomes and review

Finishing a model turn is recorded as `turn_complete`, not completion of the
whole coding task. A reported block or required decision remains visible.
The worker reads the task branch's PR back from GitHub and matches its repository
and exact head before recording `awaiting_checks`, `ready_for_review`, or
`merged`. Failed checks require follow-up. No checks means `checks: none`, not
a claim that tests passed. The final answer reports local verification.

The status card links the PR, current head, check result, and blocker. The agent
can return one requested review artifact of up to 8 MB from the task's artifacts
directory; it is uploaded to Discord and retained for retries. HTML previews
can be shared as attachments; this service does not publish a public preview URL.

Subscribe the existing signed GitHub webhook to `check_run`, `check_suite`,
`pull_request`, `pull_request_review`, and `pull_request_review_comment`.
Matching events refresh the task's GitHub status on its owning worker without
starting a model turn. Stale heads and duplicate deliveries are ignored.
Feedback and failing checks remain available for the owner's next reply;
webhook text does not become an instruction or grant merge/deploy authority.

## GitHub and deployment authority

The current dedicated GitHub login and repository rulesets remain the authority
boundary. The wrappers allow issue work, prepared-branch publication, draft PR
creation, PR edits/comments/reviews/ready, and Actions reruns. Marking ready,
merging, or deployment must follow the owner's authorization in the task;
previous owner directions survive restart. Administrative merge bypass and
protected/force pushes remain disallowed. Wrappers are convenience guardrails,
not a security boundary against arbitrary shell code.

For the configured MiniSago repository, a separate stdio MCP process provides
`deploy_minisago(commit)`. The server fixes the deployment socket and Discord
destination; the tool accepts only a full commit SHA. The raw socket is not a
shell writable root. Acceptance is distinct from deployment completion, which
the existing deployment notification service reports.

Repository-scoped GitHub App credentials, a trusted branch-publication service,
per-task containers, and checkpoint transfer between workers remain a separate
infrastructure phase. This implementation retains the existing dedicated-login
model and keeps tasks pinned until their files can be transferred explicitly.

## Runtime checks

Run `bash scripts/test-dev-sandbox.sh` to test the pinned production Codex version
in a Linux container without a model call or credentials. The compose worker
allows namespace syscalls with `seccomp=unconfined` so Bubblewrap can create its
inner sandbox; this removes Docker's outer syscall filter, not Codex's filesystem
sandbox. The worker runs as `bun`, never receives the Docker socket, and is
bounded to 512 processes. CPU and memory limits default to 2 CPUs and 4 GB and
can be changed with `MINISAGO_WORKER_CPU_LIMIT` and `MINISAGO_WORKER_MEMORY_LIMIT`.
The production host must permit unprivileged user namespaces. Deploy core and
workers together for bridge protocol 37. Publishing a PR does not update the
separate production compose configuration.
