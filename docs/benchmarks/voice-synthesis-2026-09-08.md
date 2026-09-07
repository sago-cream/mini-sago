# VOICEVOX synthesis concurrency — 2026-09-08

Two concurrent requests to the current single VOICEVOX engine do not improve completion latency. Keep sentence synthesis sequential on this engine.

| Reply                    | Concurrency | First audio ready | All audio ready | Projected inter-sentence gaps | Projected playback complete |
| ------------------------ | ----------: | ----------------: | --------------: | ----------------------------: | --------------------------: |
| 2 short sentences        |           1 |             2.93s |           7.83s |                         4.03s |                       9.62s |
| 2 short sentences        |           2 |             3.18s |           7.94s |                         3.88s |                       9.73s |
| 3 mixed-length sentences |           1 |             5.66s |          20.57s |                         8.06s |                      22.55s |
| 3 mixed-length sentences |           2 |             5.36s |          24.48s |                        12.37s |                      26.46s |

## Method

- Oracle ARM Neoverse-N1: two CPU cores, approximately 12 GB RAM; no NVIDIA GPU.
- Existing VOICEVOX cpu-arm64 0.25.2 container: 2-CPU / 2-GiB cap. Benchmark executed inside the existing bot container with its 1-CPU / 1-GiB cap.
- Uses the actual `synthesizeSpeech` function: audio query, VOICEVOX synthesis, normalization, resampling, and stereo PCM conversion.
- Three rounds per fixture and concurrency level, alternating order; one warm-up before comparisons. Twelve trials, thirty synthesized sentences. Table reports medians.
- Both/all sentence texts are available at time zero, giving concurrency a favorable scenario. Output order is preserved when projecting playback. Every fixture produced identical PCM byte counts and audio durations across runs; this does not assert sample-level waveform equality.
- Playback completion and gap values are projections from measured readiness and audio lengths. They exclude Discord transport/player overhead, Whisper, and Codex generation; they are not measured end-to-end Discord latency.
- Runs used the shared live host, not an isolated machine. Three repeats characterize this small workload, not a broad performance distribution. Production concurrency was not changed.

## Interpretation

Two concurrent requests made the short reply’s total synthesis 1.4% slower and the mixed reply’s 19.0% slower. Short first-audio readiness regressed about 8.5%; mixed first-audio readiness improved about 5.3%, but later sentence gaps outweighed that improvement.

The deployed version’s [CoreAdapter](https://github.com/VOICEVOX/voicevox_engine/blob/0.25.2/voicevox_engine/core/core_adapter.py#L166-L184) holds a mutex during waveform decoding. Sending more requests to one engine does not create parallel decoding. A sampled engine CPU load was approximately one core; the container’s two-core limit does not guarantee both cores are busy.

The next distinct experiment would be two independent VOICEVOX processes with explicit CPU/thread budgets, then measure first-audio readiness and ordered playback completion under Discord-like load. This benchmark does not test that architecture.

## Reproduction

Run `bun scripts/benchmarks/voice-synthesis.ts 3` from a checkout with the same VOICEVOX URL, speaker settings, ffmpeg, and CPU limits. For this live-container run, a temporary copy changed only the import path to `/app/src/discord/local-speech.ts` and ran via `docker exec` as the normal bot user. No audio was sent into Discord.

Raw measurements: [voice-synthesis-2026-09-08.jsonl](voice-synthesis-2026-09-08.jsonl).
