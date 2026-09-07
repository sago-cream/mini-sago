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

  function flow(events, now) {
    const origin = events.find((e) => e.type === "utterance.queued")?.at;
    const result = {
      total: 1,
      whisper: [],
      codex: [],
      tts: [],
      audio: [],
      details: { whisper: [], codex: [], tts: [], audio: [] },
    };
    if (origin == null) return result;
    const terminal = events.findLast(
      (e) =>
        ["turn.finish", "turn.cancel", "turn.error"].includes(e.type) ||
        (e.type === "decision" && /^(ignore|stop)/.test(e.detail || "")),
    );
    const until = terminal?.at ?? now;
    const segment = (start, end, waiting = false) => ({
      startMs: Math.max(0, start - origin),
      durationMs: Math.max(0, end - start),
      waiting,
    });
    for (const name of ["whisper", "codex"]) {
      const start = events.find((e) => e.type === name + ".start");
      const end = events.find((e) =>
        [name + ".finish", name + ".error"].includes(e.type),
      );
      if (start)
        result[name].push({
          name: name === "whisper" ? "Recognition" : "Generating",
          segments: [segment(start.at, end?.at ?? until)],
          running: !end && !terminal,
        });
    }
    const ready = events.filter((e) => e.type === "codex.sentence");
    for (const e of ready)
      result.codex.push({
        name: `Sentence ${e.sentenceId} ready`,
        sentenceId: e.sentenceId,
        text: e.text,
        segments: [segment(e.at, e.at)],
        marker: true,
      });
    for (const [group, type] of [
      ["tts", "tts"],
      ["audio", "audio"],
    ]) {
      const starts = events.filter(
        (e) =>
          e.type === type + ".start" &&
          (type !== "audio" || e.kind === "reply"),
      );
      const queued =
        type === "tts"
          ? ready
          : events.filter(
              (e) => e.type === "audio.queued" && e.kind === "reply",
            );
      const ids = [
        ...new Set([...queued, ...starts].map((e, i) => e.sentenceId ?? i + 1)),
      ];
      for (const id of ids) {
        const start = starts.find((e) => e.sentenceId === id);
        const queue = queued.find((e) => e.sentenceId === id);
        const end = events.find(
          (e) =>
            e.sentenceId === id &&
            [type + ".finish", type + ".error"].includes(e.type) &&
            (type !== "audio" || e.kind === "reply"),
        );
        const segments = [];
        if (queue && (start?.at ?? until) > queue.at)
          segments.push(segment(queue.at, start?.at ?? until, true));
        if (start) segments.push(segment(start.at, end?.at ?? until));
        if (segments.length)
          result[group].push({
            name: `Sentence ${id}`,
            sentenceId: id,
            text: queue?.text || ready.find((e) => e.sentenceId === id)?.text,
            segments,
            running: !end && !terminal,
          });
      }
    }
    const whisper = events.find((e) => e.type === "whisper.start");
    const diagnostics = events.find(
      (e) => e.type === "whisper.diagnostics",
    )?.payload;
    const timing = diagnostics?.timings;
    if (whisper && timing) {
      result.details.whisper.push({
        name: "Conversion",
        segments: [segment(whisper.at, whisper.at + timing.conversionMs)],
      });
      const base = whisper.at + timing.conversionMs;
      for (const span of timing.server?.spans || []) {
        if (
          ["Server processing", "Inference"].includes(span.name) ||
          (span.name === "Model queue wait" && span.durationMs < 1)
        )
          continue;
        result.details.whisper.push({
          name: span.name,
          segments: [
            segment(base + span.startMs, base + span.startMs + span.durationMs),
          ],
        });
      }
    }
    const first = events.find((e) => e.type === "codex.first_delta");
    if (first)
      result.details.codex.push({
        name: "First text",
        marker: true,
        segments: [segment(first.at, first.at)],
      });
    for (const [name, type] of [
      ["whisper", "whisper.start"],
      ["codex", "turn.start"],
    ]) {
      const event = events.find((e) => e.type === type);
      if (event?.durationMs >= 10)
        result[name].unshift({
          name: "Queue wait",
          segments: [segment(event.at - event.durationMs, event.at, true)],
        });
    }
    const all = [
      result.whisper,
      result.codex,
      result.tts,
      result.audio,
      ...Object.values(result.details),
    ].flat();
    result.total = Math.max(
      1,
      ...all.flatMap((l) => l.segments.map((s) => s.startMs + s.durationMs)),
    );
    return result;
  }
  function lanes(items, total) {
    const box = el("div", undefined, "flow-lanes");
    if (!items.length) {
      box.append(el("span", "—"));
      return box;
    }
    for (const item of items) {
      const lane = el("div", undefined, "flow-lane");
      const work = item.segments
        .filter((s) => !s.waiting)
        .reduce((n, s) => n + s.durationMs, 0);
      const wait = item.segments
        .filter((s) => s.waiting)
        .reduce((n, s) => n + s.durationMs, 0);
      lane.append(
        el(
          "span",
          `${item.name}${item.marker ? "" : ` · ${time(work || wait)}${item.running ? "…" : ""}`}`,
          "flow-caption",
        ),
      );
      const track = el("div", undefined, "flow-track");
      for (const span of item.segments) {
        const bar = el(
          "button",
          undefined,
          `flow-bar${span.waiting ? " waiting" : ""}${item.marker ? " milestone" : ""}`,
        );
        bar.type = "button";
        if (item.sentenceId) bar.dataset.sentence = String(item.sentenceId);
        bar.style.left = `${(100 * span.startMs) / total}%`;
        bar.style.width = item.marker
          ? "6px"
          : `${Math.max(0.3, (100 * span.durationMs) / total)}%`;
        bar.title = `${item.name}${span.waiting ? " · waiting" : ""}: +${time(span.startMs)} → +${time(span.startMs + span.durationMs)}${item.text ? ` · ${item.text}` : ""}`;
        bar.setAttribute("aria-label", bar.title);
        track.append(bar);
      }
      lane.append(track);
      box.append(lane);
    }
    return box;
  }
  window.voiceTimeline = { chart, recognition, pipeline, flow, lanes };
})();
