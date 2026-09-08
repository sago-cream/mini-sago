import { randomUUID } from "node:crypto";
import {
  VoiceConversation,
  type VoicePlayback,
  type VoiceAudioKind,
  type VoiceReplyInput,
  type VoiceChatResponse,
} from "../voice-conversation";
import { VoiceDebugState } from "./state";

export function createBrowserSession(deps: {
  transcribe: (
    audio: Buffer,
    signal?: AbortSignal,
    trace?: import("./state").VoiceTrace,
  ) => Promise<string>;
  onTranscript?: (id: string, text: string) => Promise<void>;
  respond: (
    input: VoiceReplyInput & { guildId: string; channelId: string },
  ) => Promise<VoiceChatResponse | null>;
}) {
  const state = new VoiceDebugState(() => true);
  state.updateSettings(
    { ...state.getSettings(), transcriptionTimeoutMs: 120000 },
    0,
  );
  const session = state.session("browser", "Browser microphone");
  type Clip = {
    id: string;
    audio: Buffer;
    kind: VoiceAudioKind;
    playback?: VoicePlayback;
    started?: number;
  };
  let clips: Clip[] = [];
  let waiters: (() => void)[] = [];
  const settle = () => {
    if (!clips.length) {
      waiters.forEach((resolve) => resolve());
      waiters = [];
    }
  };
  const output = {
    pause() {},
    resume() {},
    clear() {
      clips.forEach((clip) => {
        clip.playback?.finished(true);
        (clip.playback?.trace ?? session.trace)("audio.finish", {
          kind: clip.kind,
          detail: "interrupted",
        });
      });
      clips = [];
      settle();
    },
    write(audio: Buffer, kind: VoiceAudioKind, playback?: VoicePlayback) {
      clips.push({ id: randomUUID(), audio, kind, playback });
      (playback?.trace ?? session.trace)("audio.queued", { kind });
    },
    drain: () =>
      clips.length
        ? new Promise<void>((resolve) => waiters.push(resolve))
        : Promise.resolve(),
  };
  const recordingIds = new WeakMap<Buffer, string>();
  const conversation = new VoiceConversation({
    transcribe: async (audio, signal, trace) => {
      const text = await deps.transcribe(audio, signal, trace);
      const id = recordingIds.get(audio);
      if (id)
        await deps
          .onTranscript?.(id, text)
          .catch((error) =>
            console.warn("Could not save recording label", error),
          );
      return text;
    },
    respond: (input) =>
      deps.respond({ ...input, guildId: "browser", channelId: session.id }),
    pendingAgeMs: 120000,
    output,
    trace: session.trace,
    getSettings: () => state.getSettings(),
  });
  session.setStop(() => conversation.stop());
  session.trace("connection.state", { detail: "ready" });
  return {
    state,
    capture(audio: Buffer, recordingId?: string) {
      if (recordingId) recordingIds.set(audio, recordingId);
      conversation.stop();
      conversation.speechStarted("browser-user");
      void conversation.utterance("browser-user", audio);
      conversation.speechEnded("browser-user");
    },
    clip() {
      const clip = clips[0];
      return clip ? { id: clip.id, pcm: clip.audio.toString("base64") } : null;
    },
    acknowledge(id: string, phase: string, clientElapsedMs?: number) {
      const clip = clips[0];
      if (!clip || clip.id !== id) return;
      if (phase === "start") {
        if (clip.started) return;
        clip.started = Date.now();
        (clip.playback?.trace ?? session.trace)("audio.start", {
          kind: clip.kind,
          clientElapsedMs,
        });
      } else {
        clips.shift();
        clip.playback?.finished(phase !== "end");
        (clip.playback?.trace ?? session.trace)("audio.finish", {
          kind: clip.kind,
          detail: phase === "end" ? "played" : "interrupted",
          durationMs: clip.started ? Date.now() - clip.started : 0,
        });
        settle();
      }
    },
    close() {
      conversation.destroy();
      output.clear();
      state.clear();
      session.trace("session.close");
    },
  };
}
