const $ = (id) => document.getElementById(id);
let signedIn = false,
  sessionId = "",
  context,
  recorder,
  stream,
  timer,
  clock,
  started = 0,
  busy = false,
  generation = 0,
  source,
  clipId = "",
  polling = false,
  playingPoll = false;
const duration = (ms) =>
  Number.isFinite(ms) ? `${(ms / 1000).toFixed(1)} s` : "—";
function error(message = "") {
  $("error").textContent = message;
  $("error").hidden = !message;
}
async function api(path, method = "GET", body) {
  const response = await fetch(`/api/voice-debug/${path}`, {
    method,
    ...(body !== undefined
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401) {
      signedIn = false;
      $("login").hidden = false;
      $("test").hidden = true;
      $("logout").hidden = true;
    }
    throw new Error(result.error || "Request failed");
  }
  return result;
}
function stopAudio() {
  if (source) {
    source.onended = null;
    source.stop();
    source = null;
  }
  clipId = "";
}
function reset() {
  for (const name of ["capture", "whisper", "codex", "tts", "audio"]) {
    $(name + "-time").textContent = "—";
    $(name + "-output").textContent = "—";
  }
  $("capture-audio").pause();
  $("capture-audio").removeAttribute("src");
  $("capture-audio").load();
  $("capture-audio").hidden = true;
  $("events").textContent = "";
}
async function poll() {
  if (polling) return;
  polling = true;
  try {
    const state = await api("snapshot");
    signedIn = true;
    $("login").hidden = true;
    $("test").hidden = false;
    $("logout").hidden = false;
    if (!sessionId || state.mode !== "browser") return;
    const events = state.events.filter((e) => e.sessionId === sessionId);
    const last = (type) => events.findLast((e) => e.type === type);
    for (const [name, type] of [
      ["whisper", "whisper"],
      ["codex", "codex"],
    ]) {
      const end = last(type + ".finish") || last(type + ".error"),
        start = last(type + ".start");
      $(name + "-time").textContent = end
        ? duration(end.durationMs)
        : start
          ? duration(state.now - start.at) + "…"
          : "—";
      const text =
        end?.text || (type === "codex" ? last("codex.output")?.text : "");
      $(name + "-output").textContent =
        text ||
        end?.detail ||
        (end ? "No speech detected" : start ? "Processing…" : "—");
    }
    const tts = events.filter((e) => e.type === "tts.start");
    $("tts-output").textContent = tts.map((e) => e.text).join("\n") || "—";
    const ttsEnds = events.filter((e) =>
      ["tts.finish", "tts.error"].includes(e.type),
    );
    $("tts-time").textContent = tts.length
      ? duration(ttsEnds.reduce((sum, e) => sum + (e.durationMs || 0), 0)) +
        (ttsEnds.length < tts.length ? "…" : "")
      : "—";
    const playback = events.filter(
      (e) => e.kind === "reply" && e.type.startsWith("audio."),
    );
    const ended = playback.filter((e) => e.type === "audio.finish");
    $("audio-time").textContent = ended.length
      ? duration(ended.reduce((sum, e) => sum + (e.durationMs || 0), 0))
      : "—";
    $("audio-output").textContent =
      playback.at(-1)?.detail ||
      { "audio.queued": "Waiting to play", "audio.start": "Playing…" }[
        playback.at(-1)?.type
      ] ||
      "—";
    $("events").textContent = events
      .map(
        (e) =>
          `${new Date(e.at).toLocaleTimeString()} ${e.type}\n${JSON.stringify(e.payload ?? { text: e.text, detail: e.detail, durationMs: e.durationMs }, null, 2)}`,
      )
      .join("\n\n");
    const failed = events.findLast((e) => e.type.endsWith(".error"));
    if (!busy)
      $("status").textContent = failed
        ? "This turn failed. See its output or event details."
        : last("turn.finish")
          ? "Done. Record again to test another turn."
          : last("turn.cancel")
            ? "Reply stopped."
            : last("decision")?.detail?.startsWith("ignore")
              ? last("decision").detail
              : events.some((e) => e.type === "utterance.queued")
                ? "Processing your recording…"
                : "Say something, then stop recording.";
    if (failed) error(failed.detail || failed.type);
    $("stop").hidden = !state.sessions.some(
      (s) => s.id === sessionId && s.activeTurn,
    );
  } catch (err) {
    if (signedIn) error(err.message);
  } finally {
    polling = false;
  }
}
$("login").onsubmit = async (event) => {
  event.preventDefault();
  try {
    await api("login", "POST", { token: $("token").value });
    $("token").value = "";
    error();
    await poll();
  } catch (err) {
    error(err.message);
  }
};
$("record").onclick = async () => {
  if (recorder?.state === "recording") {
    recorder.stop();
    return;
  }
  if (busy) return;
  busy = true;
  $("record").disabled = true;
  error();
  const turn = ++generation;
  try {
    context ??= new AudioContext();
    await context.resume();
    stopAudio();
    await api("browser", "POST", {});
    const state = await api("snapshot");
    sessionId = state.sessions.at(-1).id;
    reset();
    $("status").textContent = "Opening microphone…";
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    const parts = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (event) => parts.push(event.data);
    recorder.onstop = async () => {
      clearTimeout(timer);
      clearInterval(clock);
      stream.getTracks().forEach((t) => t.stop());
      $("record").disabled = true;
      $("record").textContent = "Record";
      try {
        if (turn !== generation) return;
        $("status").textContent = "Sending recording…";
        const decoded = await context.decodeAudioData(
          await new Blob(parts).arrayBuffer(),
        );
        const offline = new OfflineAudioContext(
            1,
            Math.min(720000, Math.ceil(decoded.duration * 24000)),
            24000,
          ),
          node = offline.createBufferSource();
        node.buffer = decoded;
        node.connect(offline.destination);
        node.start();
        const buffer = await offline.startRendering(),
          samples = buffer.getChannelData(0),
          pcm = new ArrayBuffer(samples.length * 2),
          view = new DataView(pcm);
        samples.forEach((v, i) =>
          view.setInt16(i * 2, Math.max(-1, Math.min(1, v)) * 32767, true),
        );
        if (turn !== generation) return;
        const response = await fetch("/api/voice-debug/capture", {
          method: "POST",
          body: pcm,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        $("capture-time").textContent = duration(decoded.duration * 1000);
        $("capture-output").textContent = "";
        $("capture-audio").src =
          `/api/voice-debug/recording?id=${result.recordingId}`;
        $("capture-audio").hidden = false;
      } catch (err) {
        error(err.message);
      } finally {
        busy = false;
        $("record").disabled = false;
        await poll();
      }
    };
    recorder.start();
    started = Date.now();
    $("record").textContent = "Stop recording";
    $("record").disabled = false;
    clock = setInterval(() => {
      $("status").textContent =
        `Recording · ${duration(Date.now() - started)} / 30 s`;
    }, 200);
    timer = setTimeout(
      () => recorder?.state === "recording" && recorder.stop(),
      30000,
    );
  } catch (err) {
    stream?.getTracks().forEach((t) => t.stop());
    busy = false;
    $("record").disabled = false;
    error(
      err.name === "NotAllowedError"
        ? "Allow microphone access in your browser, then try again."
        : err.message,
    );
  }
};
$("stop").onclick = async () => {
  try {
    stopAudio();
    await api("stop", "POST", { sessionId });
    await poll();
  } catch (err) {
    error(err.message);
  }
};
$("logout").onclick = async () => {
  generation++;
  if (recorder?.state === "recording") recorder.stop();
  stream?.getTracks().forEach((t) => t.stop());
  stopAudio();
  await api("logout", "POST", {});
  location.reload();
};
setInterval(async () => {
  if (!signedIn || !sessionId || busy || playingPoll) return;
  playingPoll = true;
  try {
    const clip = await api("playback");
    if (!clip) {
      stopAudio();
      return;
    }
    if (clip.id === clipId) return;
    stopAudio();
    clipId = clip.id;
    context ??= new AudioContext();
    await context.resume();
    if (context.state !== "running")
      throw new Error("Audio playback is blocked by the browser.");
    const bytes = Uint8Array.from(atob(clip.pcm), (c) => c.charCodeAt(0)),
      view = new DataView(bytes.buffer),
      buffer = context.createBuffer(2, bytes.length / 4, 48000);
    for (let ch = 0; ch < 2; ch++) {
      const samples = buffer.getChannelData(ch);
      for (let i = 0; i < samples.length; i++)
        samples[i] = view.getInt16(i * 4 + ch * 2, true) / 32768;
    }
    source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.onended = () => {
      source = null;
      void api("playback", "POST", { id: clip.id, phase: "end" }).catch((err) =>
        error(err.message),
      );
    };
    await api("playback", "POST", { id: clip.id, phase: "start" });
    source.start();
  } catch (err) {
    error(err.message);
    if (clipId)
      await api("playback", "POST", { id: clipId, phase: "error" }).catch(
        () => {},
      );
    stopAudio();
  } finally {
    playingPoll = false;
  }
}, 500);
poll();
setInterval(poll, 1000);
