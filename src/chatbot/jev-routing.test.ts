import { expect, test } from "bun:test";
import { routeWithJev } from "./jev-routing";
import type { ExecutionRouteJob } from "../../contracts/worker-contract";
const job: ExecutionRouteJob = {
  id: "route-test",
  purpose: "execution_route",
  requesterUserId: "owner",
  channelId: "channel",
  requestMessageId: "message",
  request: "yo",
  requestMessage: {
    id: "message",
    role: "user",
    author: "Owner",
    timestamp: "2026-09-20T00:00:00Z",
    content: "yo",
    attachments: [],
  },
  messages: [],
  capabilities: [],
  availableRepositories: ["sago-cream/mini-sago"],
  chatbotRepository: "sago-cream/mini-sago",
};
function response(route: string, confidence = 1) {
  return {
    model: "jev",
    usage: { input_tokens: 1, output_tokens: 1 },
    answers: {
      route: {
        type: "choice",
        choice: route,
        confidence,
        probabilities: { chat: 1, mac: 0, oracle: 0 },
      },
      repository: {
        type: "choice",
        choice: "unknown",
        confidence: 1,
        probabilities: { unknown: 1, "sago-cream/mini-sago": 0 },
      },
    },
  };
}
test("Jev accepts confident chat/Mac and falls back for uncertain, repository, malformed, and failed routing", async () => {
  for (const route of ["chat", "mac"]) {
    const result = await routeWithJev(job, {
      apiKey: "test",
      fetch: async () => Response.json(response(route)),
    });
    expect(JSON.parse(result!).route).toBe(route);
  }
  for (const value of [
    response("chat", 0.7),
    response("oracle"),
    response("invalid"),
    {},
  ]) {
    expect(
      await routeWithJev(job, {
        apiKey: "test",
        fetch: async () => Response.json(value),
      }),
    ).toBeUndefined();
  }
  expect(
    await routeWithJev(job, {
      apiKey: "test",
      fetch: async () => {
        throw new Error("timeout");
      },
    }),
  ).toBeUndefined();
  expect(
    await routeWithJev(job, {
      apiKey: "",
      fetch: async () => {
        throw new Error("must not call");
      },
    }),
  ).toBeUndefined();
});
