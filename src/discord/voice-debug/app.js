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
  for (const name of ["whisper", "codex", "tts", "audio"])
    $(name + "-stages").replaceChildren();
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
    await pollComparisons();
    if (!sessionId || state.mode !== "browser") return;
    const events = state.events.filter((e) => e.sessionId === sessionId);
    const last = (type) => events.findLast((e) => e.type === type);
    const spans = window.voiceTimeline.pipeline(events, state.now, true);
    const recognition = last("whisper.diagnostics")?.payload;
    for (const [name, labels] of [
      ["whisper", ["Recognition queue wait"]],
      ["codex", ["Prior answer wait"]],
      ["tts", ["Synthesis"]],
      ["audio", ["Playback queue wait", "Playback"]],
    ]) {
      const target = $(name + "-stages");
      const open = [...target.querySelectorAll("details[open]")].map(
        (n) => n.dataset.path,
      );
      const stages = spans.filter((s) => labels.includes(s.name));
      target.replaceChildren();
      if (stages.length) target.append(window.voiceTimeline.chart("", stages));
      if (name === "whisper" && recognition)
        target.append(window.voiceTimeline.recognition(recognition));
      if (!target.childNodes.length)
        target.textContent = "No internal stage timings captured yet.";
      for (const node of target.querySelectorAll("details"))
        node.open = open.includes(node.dataset.path);
    }
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
        selectedRecording = "";
        $("recording-select").value = "";
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
let recordings = [],
  profiles = [],
  comparisonRuns = [],
  selectedRecording = "";
function addProfile(settings) {
  const card = document.createElement("div");
  card.className = "profile";
  card.innerHTML = `<label>Model<select data-model><option value="small">small</option><option value="small-q5_1">small · Q5_1</option><option value="base">base</option></select></label><label>Language<select data-language><option value="ja">Japanese</option><option value="auto">Auto detect</option><option value="zh">Chinese</option><option value="en">English</option></select></label><strong>—</strong><output>Not run</output><details><summary>Stage timings</summary><div class="stage-timings"></div></details>`;
  card.querySelector("[data-model]").value = settings.model || "small";
  card.querySelector("[data-language]").value = settings.language;
  const index = profiles.length;
  card.querySelectorAll("select").forEach(
    (select) =>
      (select.onchange = () => {
        comparisonRuns[index] = undefined;
        card.querySelector("strong").textContent = "—";
        card.querySelector("output").textContent =
          "Settings changed · run again";
      }),
  );
  profiles.push({ settings, card });
  $("profiles").append(card);
  $("add-profile").disabled = profiles.length >= 4;
}
function selectRecording() {
  selectedRecording = $("recording-select").value;
  comparisonRuns = [];
  $("comparison-audio").src =
    `/api/voice-debug/recording?id=${selectedRecording}`;
  const saved = recordings.find((r) => r.id === selectedRecording);
  if (saved?.runs.length) {
    $("profiles").replaceChildren();
    profiles = [];
    saved.runs.slice(-3).forEach((run) => addProfile(run.settings));
    comparisonRuns = saved.runs.slice(-3).map((run) => run.id);
  }
}
async function pollComparisons() {
  const data = await api("recordings");
  recordings = data.recordings;
  if (!profiles.length) data.defaults.forEach(addProfile);
  const previous = $("recording-select").value;
  $("recording-select").replaceChildren(
    ...recordings.map((r) => {
      const option = document.createElement("option");
      option.value = r.id;
      option.textContent = `${new Date(r.at).toLocaleString()} · ${duration(r.audioMs)}`;
      return option;
    }),
  );
  if (recordings.some((r) => r.id === previous))
    $("recording-select").value = previous;
  if (!selectedRecording && recordings.length) selectRecording();
  const record = recordings.find((r) => r.id === selectedRecording);
  const runs = comparisonRuns.map((id) =>
    record?.runs.find((r) => r.id === id),
  );
  const active = recordings.some((r) =>
    r.runs.some((run) => ["running", "queued"].includes(run.status)),
  );
  $("compare").disabled = active || !record;
  $("recording-select").disabled = active;
  $("add-profile").disabled = active || profiles.length >= 4;
  profiles.forEach(({ card }, index) => {
    card.querySelectorAll("select").forEach((el) => (el.disabled = active));
    const run = runs[index];
    const target = card.querySelector(".stage-timings");
    if (run?.result && target.dataset.run !== run.id) {
      target.replaceChildren(window.voiceTimeline.recognition(run.result, run));
      target.dataset.run = run.id;
    } else if (!run?.result) {
      target.textContent =
        run?.status === "queued"
          ? "Waiting for earlier variants…"
          : "Stage timings appear when recognition finishes.";
      delete target.dataset.run;
    }
    card.querySelector("strong").textContent = run?.result
      ? duration(run.result.durationMs)
      : run?.status === "running"
        ? duration(Date.now() - run.startedAt) + "…"
        : "—";
    card.querySelector("output").textContent = run?.result
      ? run.result.text || "No speech detected"
      : run?.error || run?.status || "Not run";
  });
  $("comparison-status").textContent = active
    ? "Running sequentially on the same recording…"
    : "Same recording, sequential runs. Times include audio conversion.";
}
$("recording-select").onchange = () => {
  selectRecording();
  void pollComparisons();
};
$("add-profile").onclick = () => addProfile({ ...profiles[0].settings });
$("compare").onclick = async () => {
  $("compare").disabled = true;
  error();
  try {
    const result = await api("comparison", "POST", {
      id: selectedRecording,
      profiles: profiles.map(({ settings, card }) => ({
        ...settings,
        model: card.querySelector("[data-model]").value,
        language: card.querySelector("[data-language]").value,
      })),
    });
    comparisonRuns = result.runs.slice(-profiles.length).map((r) => r.id);
    await pollComparisons();
  } catch (err) {
    error(err.message);
    $("compare").disabled = false;
  }
};
poll();
setInterval(poll, 1000);

for (const button of document.querySelectorAll(".module-toggle")) {
  button.onclick = () => {
    const expanded = button.getAttribute("aria-expanded") !== "true";
    button.setAttribute("aria-expanded", String(expanded));
    $(button.getAttribute("aria-controls")).hidden = !expanded;
  };
}
