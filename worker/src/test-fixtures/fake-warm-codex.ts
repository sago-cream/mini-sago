export {};
const send = (value: unknown) =>
  process.stdout.write(`${JSON.stringify(value)}\n`);
let sequence = 0;
let current: Record<string, unknown> | undefined;
let released = 0;
const reader = Bun.stdin.stream().getReader();
let buffer = "";
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  buffer += new TextDecoder().decode(value);
  let index: number;
  while ((index = buffer.indexOf("\n")) >= 0) {
    const message = JSON.parse(buffer.slice(0, index));
    buffer = buffer.slice(index + 1);
    const { id, method, params } = message;
    if (method === "initialize") send({ id, result: {} });
    if (method === "thread/start") {
      if (params.cwd === "fail") {
        send({ id, error: { message: "Simulated configuration failure" } });
        continue;
      }
      current = { ...params, id: `fresh-${++sequence}`, released };
      send({ id, result: { thread: { id: current!.id } } });
    }
    if (method === "thread/delete") {
      current = undefined;
      released++;
      send({ id, result: {} });
    }
    if (method === "turn/start") {
      const thread = current!;
      send({ id, result: { turn: { id: "turn" } } });
      setTimeout(() => {
        send({
          method: "item/completed",
          params: {
            threadId: "unrelated",
            item: {
              type: "agentMessage",
              phase: "final_answer",
              text: "wrong thread",
            },
          },
        });
        send({
          method: "item/completed",
          params: {
            threadId: thread.id,
            item: {
              type: "agentMessage",
              phase: "final_answer",
              text: JSON.stringify(thread),
            },
          },
        });
        send({
          method: "turn/completed",
          params: {
            threadId: thread.id,
            turn: { id: "turn", status: "completed" },
          },
        });
      }, 20);
    }
  }
}
