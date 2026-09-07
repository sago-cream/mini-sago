# Voice latency follow-up

Changes deployed: bounded 16 MiB completed-PCM reply cache, plus separate Codex process-startup and thread-setup timings in the expandable Codex timeline. Cache entries distinguish exact text and speech speed; cancelled synthesis is not cached, and in-flight jobs do not share cancellation. Cached synthesis is labelled in the timeline. Both Discord and browser tests use this reply path.

## Independent VOICEVOX engines

Three alternating rounds per fixture on the existing two-core Oracle host. Production engine retains its two-CPU limit; the temporary second identical engine has a one-CPU limit and 2 GiB memory. Both share the host's two physical cores. Both warmed before measurements. Same production synthesis and PCM conversion, speaker, text and speed. All sentences available at time zero; these are synthesis benchmarks, not measurements of Discord delivery or concurrent conversations.

Median seconds:

| Reply | Engines | First PCM | All PCM | Projected gaps | Projected playback end |
| ----- | ------: | --------: | ------: | -------------: | ---------------------: |
| Short |       1 |     2.939 |   7.489 |          3.671 |                  9.281 |
| Short |       2 |     3.153 |   4.637 |          0.602 |                  6.429 |
| Mixed |       1 |     5.247 |  19.504 |          7.441 |                 21.477 |
| Mixed |       2 |     5.525 |  10.637 |          2.256 |                 16.571 |

Independent engines reduce all-PCM latency by 38% / 45%, but first PCM is 214 / 278 ms slower. This is different from concurrent calls to one engine, which serialize internally. The temporary engine was stopped after the experiment. Production remains sequential pending a Discord workload test; bounded dual-engine synthesis with ordered playback is the next larger optimization. Benchmark: `BENCH_SECOND_VOICEVOX_URL=http://second-engine:50021 bun scripts/benchmarks/voice-synthesis.ts 3`.

## Codex and reply-cache checks

Two live isolated dashboard requests using the same saved 1.44-second greeting and the production worker. No Discord messages or playback were sent. Both requests start fresh Codex processes; “warm” in the raw filename means the PCM cache is populated, not a persistent Codex process.

| Measurement                     | First request |    Repeated request |
| ------------------------------- | ------------: | ------------------: |
| Process startup                 |        236 ms |              234 ms |
| Thread setup                    |      1,274 ms |              874 ms |
| First reply delta from dispatch |      4,402 ms |            4,987 ms |
| First sentence PCM              |      2,965 ms | 0.040 ms, cache hit |
| Second sentence PCM             |      4,518 ms | 0.038 ms, cache hit |

These are two observations, not a latency distribution. Process-only prewarming could remove approximately 235 ms in these runs; it would not eliminate thread setup or generation. The current process gets per-job MCP credentials, a temporary working directory and temporary environment. Do not reuse it by changing `ephemeral` to false. Any future warm transport needs fresh isolated threads, per-thread credentials/configuration and cleanup tests. Startup stages have worker-measured durations, positioned at receipt on the bot timeline; transport delay can shift their displayed positions.

The repeated greeting produced identical sentences, allowing both cache hits. This does not predict cache hit rate for natural conversations. Cache is memory-only and resets on restart. New replies retain their synthesis cost.

## Endpointing and Whisper

The real VoiceActivityGate was exercised with deterministic voiced/unvoiced frames at 700, 500 and 360 ms silence thresholds. 500 ms saves exactly 200 ms, but splits a phrase containing a 600 ms pause. 360 ms also splits a 450 ms pause (rounded to 460 ms by 20 ms frames). These are control-flow fixtures, not acoustic accuracy tests. Retain the 700 ms default until conversational recordings establish an acceptable false-cut rate.

The live greeting took 2.42 seconds to recognize: encoder 2.31 seconds, VAD 6.3 ms, audio conversion 54 ms. Whisper already stays loaded. Encoder compute, rather than further VAD/service warming, is its remaining bottleneck.

Validation: both TypeScript builds and 364 tests passed. Raw results accompany this report. Browser delivery timing is not presented as Discord end-to-end latency.
