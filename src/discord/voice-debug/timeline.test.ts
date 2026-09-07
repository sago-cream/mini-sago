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

test("recognition shows measured stages once without redundant wrappers", () => {
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
  expect(output.match(/Speech detection/g)?.length).toBe(1);
  expect(output).not.toContain("Server processing");
  expect(output).not.toContain("Inference");
  expect(output).not.toContain("Response parsing");
  expect(output).toContain("Speech detection 20 ms");
});

test("shared clock preserves generation, synthesis and playback overlap and sentence waits", () => {
  const events = [
    { type: "utterance.queued", at: 1000 },
    { type: "codex.start", at: 2000 },
    { type: "codex.sentence", at: 3000, sentenceId: 1, text: "one" },
    { type: "tts.start", at: 3100, sentenceId: 1 },
    { type: "tts.finish", at: 4000, sentenceId: 1 },
    { type: "audio.queued", at: 4000, sentenceId: 1, kind: "reply" },
    { type: "audio.start", at: 4200, sentenceId: 1, kind: "reply" },
    { type: "codex.sentence", at: 4500, sentenceId: 2, text: "two" },
    { type: "tts.start", at: 4600, sentenceId: 2 },
    { type: "codex.finish", at: 5000 },
    { type: "tts.finish", at: 5500, sentenceId: 2 },
    { type: "audio.queued", at: 5500, sentenceId: 2, kind: "reply" },
    { type: "audio.finish", at: 6000, sentenceId: 1, kind: "reply" },
    { type: "audio.start", at: 6000, sentenceId: 2, kind: "reply" },
    { type: "audio.finish", at: 7000, sentenceId: 2, kind: "reply" },
    { type: "turn.finish", at: 7000 },
  ];
  const flow = window.voiceTimeline.flow(events, 9000);
  expect(flow.total).toBe(6000);
  expect(flow.codex[0].segments[0]).toEqual({
    startMs: 1000,
    durationMs: 3000,
    waiting: false,
  });
  expect(flow.audio[0].segments[1].startMs).toBe(3200);
  expect(flow.tts[1].segments[1].startMs).toBe(3600);
  expect(flow.audio[1].segments[0]).toEqual({
    startMs: 4500,
    durationMs: 500,
    waiting: true,
  });
  expect(flow.audio[1].sentenceId).toBe(2);
});

test("shared-clock pending synthesis stops growing at cancellation", () => {
  const flow = window.voiceTimeline.flow(
    [
      { type: "utterance.queued", at: 1000 },
      { type: "codex.sentence", at: 1200, sentenceId: 1 },
      { type: "tts.start", at: 1400, sentenceId: 1 },
      { type: "turn.cancel", at: 1700 },
    ],
    9900,
  );
  expect(flow.tts[0].segments[1].durationMs).toBe(300);
  expect(flow.tts[0].running).toBe(false);
});
