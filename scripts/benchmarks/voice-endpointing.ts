/** Deterministic gate experiment; supplied voice labels are not an acoustic accuracy test. */
import { VoiceActivityGate } from "../../src/discord/voice-activity";
for (const silenceMs of [700, 500, 360]) {
  for (const pauseMs of [0, 300, 450, 600]) {
    const emittedAt: number[] = [];
    let at = 0;
    const gate = new VoiceActivityGate({
      maxUtteranceBytes: 1_000_000,
      getTiming: () => ({ silenceMs, speechStartMs: 100 }),
      onSpeechStart() {},
      onUtterance() {
        emittedAt.push(at);
      },
    });
    const push = (ms: number, voice: boolean) => {
      for (let n = 0; n < Math.ceil(ms / 20); n++) {
        at += 20;
        gate.push(Buffer.alloc(960), voice);
      }
    };
    push(400, true);
    if (pauseMs) {
      push(pauseMs, false);
      push(400, true);
    }
    const speechEndedAt = at;
    push(800, false);
    console.log(
      JSON.stringify({
        silenceMs,
        pauseMs,
        utterances: emittedAt.length,
        finalEndpointDelayMs: emittedAt.at(-1)! - speechEndedAt,
      }),
    );
  }
}
