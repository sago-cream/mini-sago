/** Run inside the bot container to use the same VOICEVOX settings and PCM conversion as Discord. */
import { synthesizeSpeech } from "../../src/discord/local-speech";

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
        Array.from({ length: concurrency }, async () => {
          while (next < fixture.sentences.length) {
            const index = next++;
            const startedMs = performance.now() - start;
            const audio = await synthesizeSpeech(fixture.sentences[index]!);
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
