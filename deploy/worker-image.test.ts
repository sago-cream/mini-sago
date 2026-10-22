import { expect, test } from "bun:test";

const dockerfile = await Bun.file(
  new URL("./Dockerfile.worker", import.meta.url),
).text();
const hostedDockerfile = await Bun.file(
  new URL("./Dockerfile", import.meta.url),
).text();
const workerCompose = await Bun.file(
  new URL("./compose.worker.yaml", import.meta.url),
).text();
test("worker image includes conservative media processing tools", () => {
  for (const packageName of [
    "ffmpeg",
    "file",
    "jpegoptim",
    "jq",
    "libimage-exiftool-perl",
    "optipng",
    "webp",
  ]) {
    expect(dockerfile).toContain(`    ${packageName} \\\n`);
  }
});

test("worker image includes a minimal Python runtime", () => {
  for (const packageName of ["python3", "python3-venv"]) {
    expect(dockerfile).toContain(`    ${packageName} \\\n`);
  }
  expect(dockerfile).toContain("worker/requirements-sandbox.txt");
  expect(dockerfile).toContain("NUMBA_CACHE_DIR=/opt/minisago-numba-cache");
});

test("images copy code from the consolidated source layout", () => {
  expect(dockerfile).toContain(
    "COPY --chown=bun:bun src/chatbot /app/src/chatbot",
  );
  expect(dockerfile).toContain("COPY --chown=bun:bun contracts /app/contracts");
  expect(dockerfile).not.toContain("COPY --chown=bun:bun lib /app/lib");
  expect(hostedDockerfile).toContain(
    "COPY --from=builder --chown=bun:bun /app/src ./src",
  );
  expect(hostedDockerfile).toContain(
    "COPY --from=builder --chown=bun:bun /app/contracts ./contracts",
  );
  expect(hostedDockerfile).not.toContain("/app/lib");
  expect(hostedDockerfile).not.toContain("/app/data");
});

test("hosted image includes Git for local server-memory history", () => {
  expect(hostedDockerfile).toMatch(/RUN apk add[^\n]*\bgit\b/);
});

test("hosted image bundles local speech tools", () => {
  expect(hostedDockerfile).toContain("RUN apk add --no-cache ffmpeg libstdc++");
  expect(hostedDockerfile).toContain("/usr/local/bin/whisper-server");
  expect(hostedDockerfile).toContain("/opt/minisago-models/ggml-small.bin");
  expect(hostedDockerfile).toContain("WHISPER_MODEL_SHA256");
});

test("generic Python runs behind a private container boundary", () => {
  const sandboxOffset = workerCompose.indexOf("\n  sandbox:\n");
  const worker = workerCompose.slice(0, sandboxOffset);
  const sandbox = workerCompose.slice(sandboxOffset);
  expect(worker).not.toContain("/var/run/docker.sock");
  expect(sandbox).toContain("/var/run/docker.sock:/var/run/docker.sock");
  expect(sandbox).toContain("sandbox-internal");
  expect(sandbox).toContain("cap_drop:\n      - ALL");
  expect(sandbox).toContain("no-new-privileges:true");
  expect(workerCompose).toContain("internal: true");
});
