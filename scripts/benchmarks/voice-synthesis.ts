/** Run inside the bot container to use the same VOICEVOX settings and PCM conversion as Discord. */
import { AsyncLocalStorage } from "node:async_hooks";
import { synthesizeSpeech } from "../../src/discord/local-speech";

// Optional independent engine; route only this benchmark's requests.
const secondEngine = process.env.BENCH_SECOND_VOICEVOX_URL;
const engine = new AsyncLocalStorage<string>();
const originalFetch = globalThis.fetch;
if (secondEngine) {
  globalThis.fetch = ((
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    const base = engine.getStore();
    if (base && (typeof input === "string" || input instanceof URL)) {
      const url = new URL(input);
      const target = new URL(base);
      url.protocol = target.protocol;
      url.host = target.host;
      return originalFetch(url, init);
    }
    return originalFetch(input, init);
  }) as typeof fetch;
}
const fixtures = [
  { name: "short", sentences: ["こんにちは。", "今日はどうしましたか？"] },
  {
    name: "mixed",
    sentences: [
      "文が途中で切れているようです。",
      "学校内のバスについて、何を知りたいのか教えてください。",
      "一緒に確認しましょう。",
    ],
  },
];
const rounds = Number(process.argv[2] || 3);
if (!Number.isInteger(rounds) || rounds < 1 || rounds > 10)
  throw new Error("Rounds must be an integer from 1 to 10");
await synthesizeSpeech("こんにちは。"); // Warm the shared engine before comparisons.
if (secondEngine)
  await engine.run(secondEngine, () => synthesizeSpeech("こんにちは。"));
for (let round = 0; round < rounds; round++) {
  for (const [fixtureIndex, fixture] of fixtures.entries()) {
    for (const concurrency of (round + fixtureIndex) % 2 ? [2, 1] : [1, 2]) {
      const start = performance.now();
      const results: Array<{
        sentence: number;
        startedMs: number;
        readyMs: number;
        audioMs: number;
        bytes: number;
      }> = [];
      let next = 0;
      await Promise.all(
        Array.from({ length: concurrency }, async (_, workerIndex) => {
          while (next < fixture.sentences.length) {
            const index = next++;
            const startedMs = performance.now() - start;
            const audio = await engine.run(
              secondEngine && workerIndex === 1 ? secondEngine : "",
              () => synthesizeSpeech(fixture.sentences[index]!),
            );
            results[index] = {
              sentence: index + 1,
              startedMs,
              readyMs: performance.now() - start,
              audioMs: audio.length / 192,
              bytes: audio.length,
            };
          }
        }),
      );
      let projectedPlaybackEndMs = 0,
        projectedGapMs = 0;
      for (const [i, item] of results.entries()) {
        if (i)
          projectedGapMs += Math.max(0, item.readyMs - projectedPlaybackEndMs);
        projectedPlaybackEndMs =
          Math.max(projectedPlaybackEndMs, item.readyMs) + item.audioMs;
      }
      console.log(
        JSON.stringify({
          fixture: fixture.name,
          engines: secondEngine && concurrency > 1 ? 2 : 1,
          round: round + 1,
          concurrency,
          firstReadyMs: results[0]!.readyMs,
          allReadyMs: Math.max(...results.map((r) => r.readyMs)),
          projectedGapMs,
          projectedPlaybackEndMs,
          results,
        }),
      );
    }
  }
}
