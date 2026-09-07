/* Timelines use each process's own clock; nested spans must not be added together. */
(() => {
  const el = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  };
  const time = (ms) =>
    ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
  function chart(title, spans, total) {
    const box = el("section", undefined, "timing-chart");
    if (title) box.append(el("h3", title));
    const end = Math.max(
      1,
      total || 0,
      ...spans.map((s) => s.startMs + s.durationMs),
    );
    for (const [index, span] of spans.slice(0, 300).entries()) {
      const row = el("div", undefined, "timing-row");
      const label = el("span", span.name, "timing-label");
      label.style.paddingLeft = `${Math.min(4, span.depth || 0) * 10}px`;
      const track = el("div", undefined, "timing-track");
      const bar = el(
        "span",
        undefined,
        span.name.toLowerCase().includes("wait") ||
          span.name.toLowerCase().includes("queue")
          ? "timing-bar waiting"
          : "timing-bar",
      );
      bar.style.left = `${Math.max(0, (span.startMs / end) * 100)}%`;
      bar.style.width = `${Math.max(0.2, Math.min(100, (span.durationMs / end) * 100))}%`;
      track.append(bar);
      const value = el(
        "span",
        `${time(span.durationMs)}${span.running ? "…" : ""}`,
        "timing-value",
      );
      row.title = `Starts +${time(span.startMs)}; ends +${time(span.startMs + span.durationMs)}`;
      row.append(label, track, value);
      if (span.children?.length) {
        const details = el("details", undefined, "timing-branch");
        details.dataset.path = span.path || `${span.name}-${index}`;
        const summary = el("summary");
        summary.append(row);
        details.append(summary, chart("", span.children, span.childTotal));
        box.append(details);
      } else box.append(row);
    }
    if (spans.length > 300)
      box.append(
        el(
          "small",
          "First 300 spans shown; full data is retained in diagnostics.",
        ),
      );
    if (!spans.length) box.append(el("small", "Waiting for stage timings."));
    return box;
  }
  function recognition(result, run) {
    const t = result?.timings;
    if (!t)
      return el(
        "small",
        "No stage timings were captured for this older run. Rerun to measure them.",
      );
    const source = t.server?.spans || [];
    const extra = source.find(
      (s) => s.name === "Language diagnostics (extra pass)",
    );
    const spans = [
      { name: "Audio conversion", startMs: 0, durationMs: t.conversionMs },
    ];
    const names = {
      "Model queue wait": "Model wait",
      VAD: "Speech detection",
      "Mel spectrogram": "Audio features",
      Encoder: "Encoding",
      Decoder: "Decoding",
    };
    for (const [name, label] of Object.entries(names)) {
      const matches = source.filter(
        (s) => s.name === name && (!extra || s.startMs < extra.startMs),
      );
      const durationMs = matches.reduce((n, s) => n + s.durationMs, 0);
      if (!matches.length || (name === "Model queue wait" && durationMs < 1))
        continue;
      spans.push({
        name: label,
        startMs: t.conversionMs + matches[0].startMs,
        durationMs,
      });
    }
    if (extra)
      spans.push({
        name: "Language diagnostics",
        startMs: t.conversionMs + extra.startMs,
        durationMs: extra.durationMs,
      });
    const overhead = Math.max(0, t.requestMs - (t.server?.totalMs || 0));
    if (overhead >= 10)
      spans.push({
        name: t.server ? "Request overhead" : "Recognition request",
        startMs: t.conversionMs + (t.server?.totalMs || 0),
        durationMs: overhead,
      });
    const box = chart("", spans, result.durationMs);
    return box;
  }
  function pipeline(events, now, raw = false) {
    const start = events.find((e) => e.type === "utterance.queued")?.at;
    if (!start) return raw ? [] : chart("Conversation pipeline", []);
    const spans = [],
      queues = new Map();
    const pairs = {
      "whisper.start": ["Whisper", "whisper.finish", "whisper.error"],
      "codex.start": ["Codex", "codex.finish", "codex.error"],
      "tts.start": ["Synthesis", "tts.finish", "tts.error"],
      "audio.start": ["Playback", "audio.finish"],
    };
    for (const e of events) {
      if (
        ["whisper.start", "turn.start"].includes(e.type) &&
        Number.isFinite(e.durationMs)
      )
        spans.push({
          name:
            e.type === "whisper.start"
              ? "Recognition queue wait"
              : "Prior answer wait",
          startMs: e.at - start - e.durationMs,
          durationMs: e.durationMs,
        });
      if (e.type === "audio.queued" && e.kind === "reply") {
        const key = "playback-wait";
        const q = queues.get(key) || [];
        q.push(e);
        queues.set(key, q);
      }
      if (e.type === "audio.start" && e.kind === "reply") {
        const queued = queues.get("playback-wait")?.shift();
        if (queued)
          spans.push({
            name: "Playback queue wait",
            startMs: queued.at - start,
            durationMs: e.at - queued.at,
          });
      }
      if (pairs[e.type] && (e.type !== "audio.start" || e.kind === "reply")) {
        const q = queues.get(e.type) || [];
        q.push(e);
        queues.set(e.type, q);
      }
      for (const [type, [name, ...ends]] of Object.entries(pairs)) {
        if (
          !ends.includes(e.type) ||
          (type === "audio.start" && e.kind !== "reply")
        )
          continue;
        const opened = queues.get(type)?.shift();
        if (opened)
          spans.push({
            name,
            startMs: opened.at - start,
            durationMs: Math.max(0, e.at - opened.at),
          });
      }
    }
    const terminal = events.findLast(
      (e) =>
        ["turn.finish", "turn.cancel", "decision"].includes(e.type) &&
        (e.type !== "decision" ||
          e.detail?.startsWith("ignore") ||
          e.detail?.startsWith("stop")),
    );
    for (const [type, pending] of queues)
      for (const opened of pending) {
        const end = terminal?.at >= opened.at ? terminal.at : now;
        spans.push({
          name:
            type === "playback-wait" ? "Playback queue wait" : pairs[type][0],
          startMs: opened.at - start,
          durationMs: Math.max(0, end - opened.at),
          running: !terminal,
        });
      }
    spans.sort((a, b) => a.startMs - b.startMs);
    if (raw) return spans;
    const box = chart("Conversation pipeline · from server receipt", spans);
    const first = events.find(
      (e) => e.type === "audio.start" && e.kind === "reply",
    );
    if (first)
      box.prepend(
        el(
          "p",
          `Time to first reply audio: ${time(first.at - start)}`,
          "timing-summary",
        ),
      );
    return box;
  }
  window.voiceTimeline = { chart, recognition, pipeline };
})();
