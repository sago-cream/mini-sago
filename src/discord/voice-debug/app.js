let runStarted = 0,
  flowKey = "";
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
  flowKey = "";
  for (const name of ["whisper", "codex", "tts", "audio"]) {
    $(name + "-time").textContent = "—";
    $(name + "-output").textContent = "—";
  }
  $("first-audio").textContent = "";
  $("time-axis").textContent = "Timeline";
  $("capture-audio").pause();
  $("capture-audio").removeAttribute("src");
  $("capture-audio").load();
  $("capture-audio").hidden = true;
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
    await loadRecordings();
    if (!sessionId || state.mode !== "browser") return;
    const events = state.events.filter((e) => e.sessionId === sessionId);
    const last = (type) => events.findLast((e) => e.type === type);
    for (const [name, type] of [
      ["whisper", "whisper"],
      ["codex", "codex"],
    ]) {
      const end = last(type + ".finish") || last(type + ".error"),
        start = last(type + ".start");
      const text =
        end?.text || (type === "codex" ? last("codex.output")?.text : "");
      $(name + "-output").textContent =
        text ||
        end?.detail ||
        (end ? "No speech detected" : start ? "Processing…" : "—");
    }
    const tts = events.filter((e) => e.type === "tts.start");
    $("tts-output").textContent = tts.map((e) => e.text).join("\n") || "—";
    const playback = events.filter(
      (e) => e.kind === "reply" && e.type.startsWith("audio."),
    );
    $("audio-output").textContent =
      playback.at(-1)?.detail ||
      { "audio.queued": "Waiting to play", "audio.start": "Playing…" }[
        playback.at(-1)?.type
      ] ||
      "—";
    const flow = window.voiceTimeline.flow(events, state.now);
    $("time-axis").textContent =
      `0 → ${duration(flow.total)} · from server receipt`;
    const firstAudio = events.find(
      (e) => e.type === "audio.start" && e.kind === "reply",
    );
    $("first-audio").textContent =
      firstAudio?.clientElapsedMs != null
        ? `First reply audio: ${duration(firstAudio.clientElapsedMs)}`
        : "";
    const nextFlowKey = JSON.stringify(flow);
    if (nextFlowKey !== flowKey) {
      flowKey = nextFlowKey;
      for (const name of ["whisper", "codex", "tts", "audio"]) {
        $(name + "-time").replaceChildren(
          window.voiceTimeline.lanes(flow[name], flow.total),
        );
        $(name + "-stages").replaceChildren(
          window.voiceTimeline.lanes(flow.details[name], flow.total),
        );
        const toggle = document.querySelector(
          `[aria-controls="${name}-details"]`,
        );
        toggle.disabled = !flow.details[name].length;
        if (toggle.disabled) $(name + "-details").hidden = true;
      }
    }
    const failed = events.findLast((e) => e.type.endsWith(".error"));
    if (!busy)
      $("status").textContent = failed
        ? "This turn failed. See its module output."
        : last("turn.finish")
          ? "Done."
          : last("turn.cancel")
            ? "Reply stopped."
            : last("decision")?.detail?.startsWith("ignore")
              ? last("decision").detail
              : events.some((e) => e.type === "utterance.queued")
                ? "Processing your recording…"
                : "";
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
    runStarted = performance.now();
    recorder.stop();
    return;
  }
  if (busy) return;
  busy = true;
  $("record").disabled = true;
  $("rerun").disabled = true;
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
      if (!runStarted) runStarted = performance.now();
      clearTimeout(timer);
      clearInterval(clock);
      stream.getTracks().forEach((t) => t.stop());
      $("record").disabled = true;
      $("record").textContent = "Record new";
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
        selectedRecording = result.recordingId;
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
    runStarted = 0;
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
    source.start();
    await api("playback", "POST", {
      id: clip.id,
      phase: "start",
      clientElapsedMs: performance.now() - runStarted,
    });
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
  selectedRecording = "";
function showRecording() {
  const recording = recordings.find((r) => r.id === selectedRecording);
  if (!recording) return;
  $("capture-audio").src = `/api/voice-debug/recording?id=${recording.id}`;
  $("capture-audio").hidden = false;
}
function recordingLabel(r) {
  const text = (
    r.transcript ??
    r.runs?.findLast((run) => run.result)?.result.text ??
    ""
  )
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 28 ? text.slice(0, 28) + "…" : text;
}
let listKey = "";
function renderRecordings() {
  const query = $("record-search").value.trim().toLocaleLowerCase();
  const key = JSON.stringify([
    query,
    busy,
    selectedRecording,
    recordings.map((r) => [r.id, recordingLabel(r)]),
  ]);
  if (key === listKey) return;
  listKey = key;
  const scroll = $("record-list").scrollTop;
  const items = recordings
    .map((r, index) => ({
      ...r,
      label: recordingLabel(r) || `Untitled ${index + 1}`,
    }))
    .filter((r) => r.label.toLocaleLowerCase().includes(query));
  $("record-list").replaceChildren(
    ...items.map((r) => {
      const row = document.createElement("div");
      row.setAttribute("role", "listitem");
      const button = document.createElement("button");
      button.textContent = r.label;
      button.title =
        r.transcript ??
        r.runs?.findLast((run) => run.result)?.result.text ??
        r.label;
      button.className = "record-item";
      button.disabled = busy;
      button.setAttribute("aria-current", String(r.id === selectedRecording));
      button.onclick = () => void selectRecording(r.id);
      row.append(button);
      return row;
    }),
  );
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "record-empty";
    empty.textContent = query
      ? "No matching recordings"
      : "Record something to start";
    $("record-list").append(empty);
  }
  $("record-list").scrollTop = scroll;
}
$("record-search").oninput = renderRecordings;
async function loadRecordings() {
  const data = await api("recordings");
  const changed =
    JSON.stringify(data.recordings.map((r) => [r.id, recordingLabel(r)])) !==
    JSON.stringify(recordings.map((r) => [r.id, recordingLabel(r)]));
  recordings = data.recordings;
  if (!recordings.some((r) => r.id === selectedRecording))
    selectedRecording = recordings[0]?.id || "";
  if (changed && !sessionId) showRecording();
  renderRecordings();
  $("rerun").disabled = busy || !selectedRecording;
}
async function selectRecording(id) {
  if (busy) return;
  selectedRecording = id;
  renderRecordings();
  // A different input must not remain paired with the previous run's output.
  stopAudio();
  sessionId = "";
  try {
    await api("browser", "DELETE");
    reset();
    showRecording();
  } catch (err) {
    error(err.message);
  }
}
$("rerun").onclick = async () => {
  if (busy || !selectedRecording) return;
  runStarted = performance.now();
  busy = true;
  $("record").disabled = $("rerun").disabled = true;
  error();
  try {
    context ??= new AudioContext();
    await context.resume();
    stopAudio();
    sessionId = "";
    reset();
    showRecording();
    $("status").textContent = "Running saved recording…";
    const result = await api("browser", "POST", {
      recordingId: selectedRecording,
    });
    sessionId = result.sessionId;
  } catch (err) {
    error(err.message);
  } finally {
    busy = false;
    $("record").disabled = false;
    await poll();
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

function highlightSentence(target) {
  const id = target.closest("[data-sentence]")?.dataset.sentence;
  for (const node of document.querySelectorAll("[data-sentence]"))
    node.classList.toggle("linked", !!id && node.dataset.sentence === id);
}
$("test").addEventListener("pointerover", (e) => highlightSentence(e.target));
$("test").addEventListener("focusin", (e) => highlightSentence(e.target));
$("test").addEventListener("pointerleave", () => highlightSentence($("test")));
