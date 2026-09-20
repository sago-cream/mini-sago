# Owner routing benchmark

Compare the existing Codex owner router with Jev on three synthetic messages:
a reminder, a Mac file request, and repository analysis. Both receive the current
routing policy, the same 19-capability owner catalog, one advertised repository,
and no nearby conversation. Only routing runs; the requested actions never run.

Install root and worker dependencies with `bun install --frozen-lockfile` in each
directory if needed.

## Save the TypeSafe key

Run this directly in your terminal:

```sh
python3 scripts/set-typesafe-key.py
```

Paste the key at the hidden prompt and press Enter. It is stored at
`~/.config/minisago/typesafe-api-key` with mode 600, inside a directory with mode 700. The key is not a command argument, printed, or written into the repository.
Running setup again replaces the saved key. The benchmark also accepts an
existing `TYPESAFE_API_KEY` environment variable.

## Run

```sh
bun scripts/benchmarks/owner-routing.ts --provider jev
bun scripts/benchmarks/owner-routing.ts --provider codex
```

Each command makes three sequential live requests, without retries or an explicit
warmup. The Codex command uses the Mac worker's authentication and bundled binary;
`MINISAGO_CODEX_HOME` and `MINISAGO_CODEX_PATH` can override their locations.
Reports go to ignored `.data/benchmarks/owner-routing-{provider}.json`. Use
`--output /absolute/path.json` to choose another destination. `--dry-run` writes
the requests without loading credentials or calling either provider.

Jev uses the documented [HTTP API](https://docs.typesafe.ai/api) with two parallel
Choice questions in one request: route and repository. Reports retain confidence,
option probabilities, the returned model identifier, and token usage. No confidence
threshold changes application behavior; this script does not modify live routing.

Times include local setup, network, inference, and result validation. Codex also
includes a fresh CLI process and temporary-file cleanup. Discord, bridge queueing,
and subsequent answer generation are excluded. Codex generates a title and reason;
Jev only selects route and repository. Three single samples are a quick latency
comparison, not a routing-quality or percentile benchmark.
