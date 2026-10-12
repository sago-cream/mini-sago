import { afterEach, expect, test } from "bun:test";
import {
  BotManagement,
  registerBotManagement,
  updateCustomStatus,
} from "./bot-management";

const managers: BotManagement[] = [];
afterEach(() => {
  for (const manager of managers.splice(0)) manager.dispose();
  registerBotManagement(null);
});
function fixture() {
  const sent: unknown[] = [];
  let connected = true,
    time = 0;
  const socket = {
    send: (data: string) => {
      sent.push(JSON.parse(data));
    },
  };
  const manager = new BotManagement(
    () => (connected ? socket : null),
    "mini.sagocream.com",
    () => time,
  );
  managers.push(manager);
  return {
    manager,
    socket,
    sent,
    disconnect: () => {
      connected = false;
    },
    advance: (ms: number) => {
      time += ms;
    },
  };
}

test("status updates send opcode 3 immediately and survive a resumed connection", () => {
  const { manager, sent } = fixture();
  expect(
    manager.updateCustomStatus({ text: "  Working  ", presence: "idle" }),
  ).toEqual({ status: "updated", text: "Working", presence: "idle" });
  expect(sent).toEqual([
    {
      op: 3,
      d: {
        since: null,
        activities: [{ name: "Custom Status", type: 4, state: "Working" }],
        status: "idle",
        afk: false,
      },
    },
  ]);
  manager.reapplyPresence();
  expect(sent[1]).toEqual(sent[0]);
  expect(manager.getPresence()).toEqual(
    (sent[0] as { d: ReturnType<BotManagement["getPresence"]> }).d,
  );
});

test("clearing custom status preserves online presence when omitted", () => {
  const { manager, sent } = fixture();
  manager.updateCustomStatus({ text: "busy", presence: "dnd" });
  expect(manager.updateCustomStatus({ text: "  " })).toEqual({
    status: "updated",
    text: "",
    presence: "dnd",
  });
  expect(sent[1]).toMatchObject({
    op: 3,
    d: { activities: [], status: "dnd" },
  });
});

test("unavailable Gateway never changes current status or claims success", () => {
  const { manager, sent, disconnect } = fixture();
  disconnect();
  expect(manager.updateCustomStatus({ text: "new" })).toEqual({
    status: "gateway_unavailable",
  });
  expect(manager.getPresence().activities[0]?.state).toBe("mini.sagocream.com");
  expect(sent).toEqual([]);
  expect(updateCustomStatus({ text: "new" })).toEqual({
    status: "gateway_unavailable",
  });
});

test("failed sends retain previous presence and do not consume rate budget", () => {
  const { manager, socket, sent } = fixture();
  const send = socket.send;
  socket.send = () => {
    throw new Error("closed");
  };
  expect(() =>
    manager.updateCustomStatus({ text: "failed", presence: "invisible" }),
  ).toThrow("closed");
  expect(manager.getPresence().status).toBe("online");
  expect(manager.getPresence().activities[0]?.state).toBe("mini.sagocream.com");
  socket.send = send;
  for (let i = 0; i < 5; i++)
    expect(manager.updateCustomStatus({ text: String(i) }).status).toBe(
      "updated",
    );
  expect(sent).toHaveLength(5);
});

test("presence sends share Discord's rolling budget including resume replay", () => {
  const { manager, sent, advance } = fixture();
  manager.reapplyPresence();
  for (let i = 0; i < 4; i++) manager.updateCustomStatus({ text: String(i) });
  expect(manager.updateCustomStatus({ text: "blocked" })).toEqual({
    status: "rate_limited",
    retryAfterMs: 20_000,
  });
  manager.reapplyPresence();
  expect(sent).toHaveLength(5);
  manager.dispose();
  advance(20_000);
  expect(manager.updateCustomStatus({ text: "allowed" }).status).toBe(
    "updated",
  );
  expect(sent).toHaveLength(6);
});

test("validates status inputs and respects a configured empty initial status", () => {
  const { manager } = fixture();
  expect(() => manager.updateCustomStatus({ text: "x".repeat(129) })).toThrow(
    "128",
  );
  expect(() =>
    manager.updateCustomStatus({ text: "ok", presence: "invalid" as never }),
  ).toThrow("Invalid presence");
  expect(new BotManagement(() => null, "").getPresence().activities).toEqual(
    [],
  );
});
