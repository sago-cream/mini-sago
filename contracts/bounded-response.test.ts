import { expect, test } from "bun:test";
import { readBoundedResponseBytes } from "./bounded-response";

test.each([true, false])(
  "cancels oversized downloads (declared size: %s)",
  async (declared) => {
    let cancelled = false;
    const response = new Response(
      new ReadableStream({
        pull(controller) {
          controller.enqueue(new Uint8Array(6));
        },
        cancel() {
          cancelled = true;
        },
      }),
      { headers: declared ? { "content-length": "6" } : undefined },
    );
    await expect(
      readBoundedResponseBytes(response, 5, "too large"),
    ).rejects.toThrow("too large");
    expect(cancelled).toBe(true);
    expect(response.body!.locked).toBe(false);
  },
);

test("releases the reader after successful and failed body reads", async () => {
  const successful = new Response(new Uint8Array([1, 2, 3]));
  expect(await readBoundedResponseBytes(successful, 3, "too large")).toEqual(
    new Uint8Array([1, 2, 3]),
  );
  expect(successful.body!.locked).toBe(false);
  const failed = new Response(
    new ReadableStream({
      start(controller) {
        controller.error(new Error("connection lost"));
      },
    }),
  );
  await expect(
    readBoundedResponseBytes(failed, 3, "too large"),
  ).rejects.toThrow("connection lost");
  expect(failed.body!.locked).toBe(false);
});
