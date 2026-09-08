import { test, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  RecognitionLab,
  defaultProfiles,
  profilesSchema,
} from "./recognition-lab";

test("recordings survive a new lab instance and profile runs use identical audio sequentially", async () => {
  const dir = await mkdtemp(join(tmpdir(), "voice-lab-test-"));
  try {
    let active = 0,
      maxActive = 0;
    const seen: string[] = [];
    const lab = new RecognitionLab(dir, async (audio, settings) => {
      active++;
      maxActive = Math.max(active, maxActive);
      seen.push(audio.toString());
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return {
        text: "hello",
        model: "small",
        durationMs: 5,
        audioMs: 10,
        timings: {
          conversionMs: 1,
          requestMs: 3,
          responseParseMs: 1,
          server: null,
        },
        settings: settings!,
        diagnostics: { text: "hello", language: "english" },
      };
    });
    const record = await lab.store(Buffer.from("same audio"));
    expect((await new RecognitionLab(dir).audio(record.id)).toString()).toBe(
      "same audio",
    );
    await lab.run(record.id, defaultProfiles, "hello");
    await expect(lab.run(record.id, defaultProfiles, "hello")).rejects.toThrow(
      "already running",
    );
    for (let i = 0; i < 100; i++) {
      if (
        (await lab.get(record.id)).runs.every(
          (run) => run.status === "complete",
        )
      )
        break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(maxActive).toBe(1);
    const timedRuns = (await lab.get(record.id)).runs;
    expect(timedRuns[1]!.startedAt! - timedRuns[1]!.queuedAt!).toBeGreaterThan(
      0,
    );
    expect(timedRuns[0]!.result!.timings.requestMs).toBe(3);
    expect(seen).toEqual(["same audio", "same audio", "same audio"]);
    const stored = (await new RecognitionLab(dir).list())[0]!;
    expect(stored.expected).toBe("hello");
    expect(stored.runs[0]!.startedAt).toBeGreaterThan(0);
    expect(stored.runs).toHaveLength(3);
    expect(stored.runs[1]!.settings.model).toBe("small-q5_1");
    await lab.label(record.id, "こんにちは");
    expect((await new RecognitionLab(dir).get(record.id)).transcript).toBe(
      "こんにちは",
    );
    await lab.remove(record.id);
    expect(await lab.list()).toEqual([]);
    await expect(lab.audio("../../secret")).rejects.toThrow();
    expect(
      profilesSchema.safeParse([{ ...defaultProfiles[0], beamSize: 999 }])
        .success,
    ).toBe(false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
