import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

class Node {
  children: Node[] = [];
  style = {};
  dataset = {};
  textContent = "";
  append(...nodes: Node[]) {
    this.children.push(...nodes);
  }
  prepend(...nodes: Node[]) {
    this.children.unshift(...nodes);
  }
}
const window: any = {};
runInNewContext(
  readFileSync(new URL("./timeline.js", import.meta.url), "utf8"),
  {
    window,
    document: { createElement: () => new Node() },
  },
);
const text = (node: Node): string =>
  [node.textContent, ...node.children.map(text)].join(" ").replace(/\s+/g, " ");

test("pipeline separates playback queue from synthesis and elapsed playback", () => {
  const events = [
    { type: "utterance.queued", at: 1000 },
    { type: "whisper.start", at: 1200, durationMs: 200 },
    { type: "whisper.finish", at: 2000 },
    { type: "turn.start", at: 2050, durationMs: 50 },
    { type: "tts.start", at: 2500 },
    { type: "tts.finish", at: 3000 },
    { type: "audio.queued", at: 3000, kind: "reply" },
    { type: "audio.start", at: 3400, kind: "reply" },
    { type: "audio.finish", at: 4400, kind: "reply" },
    { type: "turn.finish", at: 4400 },
  ];
  const output = text(window.voiceTimeline.pipeline(events, 9000));
  expect(output).toContain("Recognition queue wait 200 ms");
  expect(output).toContain("Prior answer wait 50 ms");
  expect(output).toContain("Playback queue wait 400 ms");
  expect(output).toContain("Playback 1.00 s");
  expect(output).toContain("Time to first reply audio: 2.40 s");
});

test("cancellation closes unfinished spans instead of letting them grow", () => {
  const output = text(
    window.voiceTimeline.pipeline(
      [
        { type: "utterance.queued", at: 1000 },
        { type: "codex.start", at: 1100 },
        { type: "turn.cancel", at: 1300 },
      ],
      9000,
    ),
  );
  expect(output).toContain("Codex 200 ms");
  expect(output).not.toContain("…");
});

test("old recordings show missing instrumentation instead of zero VAD", () => {
  const output = text(window.voiceTimeline.recognition({ text: "こんにちは" }));
  expect(output).toContain("Rerun");
  expect(output).not.toContain("VAD 0");
});

test("recognition nests VAD under inference under request without duplicate summaries", () => {
  const result = window.voiceTimeline.recognition({
    durationMs: 100,
    timings: {
      conversionMs: 5,
      requestMs: 95,
      responseParseMs: 0,
      server: {
        totalMs: 94,
        spans: [
          { name: "Model queue wait", startMs: 0, durationMs: 4, depth: 0 },
          { name: "Server processing", startMs: 4, durationMs: 90, depth: 0 },
          { name: "Inference", startMs: 4, durationMs: 90, depth: 1 },
          { name: "VAD", startMs: 4, durationMs: 20, depth: 2 },
        ],
      },
    },
  });
  const output = text(result);
  expect(output.match(/VAD/g)?.length).toBe(1);
  expect(output).not.toContain("Server processing");
  const chart = result.children[0];
  const request = chart.children[1];
  const inference = request.children[1].children[1];
  expect(text(inference.children[0])).toContain("Inference");
  expect(text(inference.children[1])).toContain("VAD");
});
