import { afterEach, expect, test } from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MediaProcessor } from "./media";
import { ImageGenerator, nativeImageGeneration } from "./image-generation";
import { latestGeneratedImage } from "./generated-image";
import {
  prepareGeneratedArtifacts,
  prepareDeveloperImages,
} from "./outgoing-files";
import { addGuildEmojiFromMedia } from "../../../src/discord/api/emojis";
import { ChatbotMediaRegistry } from "../../../src/chatbot/media-assets";
import type { DiscordRequest } from "../../../src/discord/api/request";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jivsAAAAASUVORK5CYII=",
  "base64",
);
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "minisago-imagegen-test-"));
  roots.push(root);
  const outputs = join(root, "outputs");
  await mkdir(outputs);
  const registry = new ChatbotMediaRegistry();
  registry.put({
    mediaId: "source-emoji",
    filename: "wave.png",
    contentType: "image/png",
    bytes: png,
  });
  const commands: string[][] = [];
  const processor = await MediaProcessor.create(
    { version: 1, root, outputDirectory: outputs, attachments: [] },
    {
      mediaClient: {
        read: (id) => registry.read(id),
        write: async (media) => {
          registry.put(media);
        },
      },
      runner: async (command, args) => {
        commands.push([command, ...args]);
        if (command.endsWith("ffprobe"))
          return {
            stdout: JSON.stringify({
              streams: [
                {
                  codec_type: "video",
                  codec_name: "png",
                  width: 128,
                  height: 128,
                },
              ],
            }),
            stderr: "",
          };
        await writeFile(args.at(-1)!, png);
        return { stdout: "", stderr: "" };
      },
    },
  );
  return { root, outputs, processor, registry, commands };
}

test.each(["image", "emoji", "sticker"] as const)(
  "generation returns reusable %s media and automatically delivers it once",
  async (purpose) => {
    const f = await fixture();
    let references: string[] = [];
    const generator = new ImageGenerator(
      f.processor,
      f.root,
      f.outputs,
      async (input) => {
        references = input.imagePaths;
        expect(input.transparentBackground).toBe(purpose !== "image");
        expect(await readFile(input.imagePaths[0]!)).toEqual(png);
        return png;
      },
    );
    const result = await generator.generate({
      prompt: "Give this emoji a hat",
      mediaIds: ["source-emoji"],
      purpose,
    });
    expect(result.mediaId).toMatch(/^media-.*\.png$/);
    expect((await f.registry.read(result.mediaId)).bytes).toEqual(png);
    expect(await Bun.file(references[0]!).exists()).toBe(false);
    if (purpose !== "image") {
      const filter = f.commands.find((args) =>
        args.some((value) => value.includes("pad=")),
      )!;
      expect(filter.join(" ")).toContain(
        purpose === "emoji" ? "pad=128:128" : "pad=320:320",
      );
      expect(filter.join(" ")).toContain("color=0x00000000");
    }
    const delivered = await prepareGeneratedArtifacts(
      JSON.stringify({ reply: "Here is the edit", artifacts: [] }),
      f.outputs,
    );
    expect(delivered.files.map((file) => file.filename)).toEqual([
      result.mediaId,
    ]);
    expect(delivered.files[0]!.data).toBe(png.toString("base64"));
    expect(await latestGeneratedImage(f.outputs)).toBeUndefined();
    expect(
      (
        await prepareGeneratedArtifacts(
          JSON.stringify({ artifacts: [] }),
          f.outputs,
        )
      ).files,
    ).toEqual([]);
    if (purpose === "emoji") {
      const uploads: unknown[] = [];
      const uploaded = await addGuildEmojiFromMedia({
        destinationGuild: "guild",
        name: "edited_wave",
        media: await f.registry.read(result.mediaId),
        discordRequest: (async (path, options) => {
          if (path === "/users/@me/guilds")
            return [
              {
                id: "guild",
                name: "Shared",
                permissions: (1n << 43n).toString(),
              },
            ];
          uploads.push(options?.body);
          return { id: "123456789012345679", name: "edited_wave" };
        }) as DiscordRequest,
      });
      expect(uploaded.name).toBe("edited_wave");
      expect(uploads).toHaveLength(1);
      expect(JSON.stringify(uploads)).toContain(
        `data:image/png;base64,${png.toString("base64")}`,
      );
    }
  },
);

test("development responses attach the generated image without requiring Markdown and do not duplicate it", async () => {
  const f = await fixture();
  const generator = new ImageGenerator(
    f.processor,
    f.root,
    f.outputs,
    async () => png,
  );
  const result = await generator.generate({
    prompt: "Draw a mascot",
    mediaIds: [],
    purpose: "image",
  });
  const response = await prepareDeveloperImages(
    `Done.\n![Preview](<${join(f.outputs, result.mediaId)}>)`,
    f.root,
    f.outputs,
  );
  expect(response.files).toHaveLength(1);
  expect(response.files[0]!.filename).toBe(result.mediaId);
  expect(
    (await prepareDeveloperImages("Next turn", f.root, f.outputs)).files,
  ).toHaveLength(0);
});

test("failed generation does not create a receipt or procedural image", async () => {
  const f = await fixture();
  const generator = new ImageGenerator(
    f.processor,
    f.root,
    f.outputs,
    async () => {
      throw new Error("Generation refused");
    },
  );
  await expect(
    generator.generate({ prompt: "Generate", mediaIds: [], purpose: "image" }),
  ).rejects.toThrow("Generation refused");
  expect(await latestGeneratedImage(f.outputs)).toBeUndefined();
  await expect(
    generator.generate({
      prompt: "Generate",
      mediaIds: ["unknown"],
      purpose: "emoji",
    }),
  ).rejects.toThrow("unavailable");
});

async function nativeFixture(body: string) {
  const f = await fixture();
  const codexHome = join(f.root, "codex-home");
  await mkdir(codexHome);
  const codexPath = join(f.root, "codex");
  await writeFile(codexPath, `#!${process.execPath}\n${body}`);
  await chmod(codexPath, 0o700);
  const directory = join(f.root, "invocation");
  await mkdir(directory);
  return { ...f, codexHome, codexPath, directory };
}
const threadId = "12345678-1234-1234-1234-123456789abc";

test("native backend uses ChatGPT auth, a tool-limited process, and only its own generated image", async () => {
  const f = await nativeFixture(`
    const { mkdir, writeFile } = await import('node:fs/promises');
    const dir = process.env.CODEX_HOME + '/generated_images/${threadId}';
    await mkdir(dir, {recursive:true});
    await writeFile(dir + '/result.png', Buffer.from('${png.toString("base64")}','base64'));
    await writeFile(process.env.CODEX_HOME + '/invocation.json', JSON.stringify({args:process.argv.slice(2),env:process.env}));
    console.log(JSON.stringify({type:'thread.started',thread_id:'${threadId}'}));
  `);
  const run = nativeImageGeneration({
    codexHome: f.codexHome,
    codexPath: f.codexPath,
    model: "gpt-6.1-sol",
  });
  expect(
    await run({
      prompt: "Make a happy emoji",
      imagePaths: [],
      directory: f.directory,
      transparentBackground: true,
    }),
  ).toEqual(png);
  const invocation = JSON.parse(
    await readFile(join(f.codexHome, "invocation.json"), "utf8"),
  );
  expect(invocation.args).toContain("--ignore-user-config");
  expect(invocation.args).toContain("features.shell_tool=false");
  expect(invocation.args).toContain("features.view_image=false");
  expect(invocation.args).toContain("features.image_generation=true");
  expect(invocation.args).not.toContain(
    "--dangerously-bypass-approvals-and-sandbox",
  );
  expect(invocation.env).not.toHaveProperty("MINISAGO_MCP_TOKEN");
  expect(invocation.env).not.toHaveProperty("OPENAI_API_KEY");
  expect(
    await Bun.file(
      join(f.codexHome, "generated_images", threadId, "result.png"),
    ).exists(),
  ).toBe(false);
});

test("a native success claim without an image fails accurately", async () => {
  const f = await nativeFixture(
    `console.log(JSON.stringify({type:'thread.started',thread_id:'${threadId}'})); console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Image created!'}}));`,
  );
  await expect(
    nativeImageGeneration({
      codexHome: f.codexHome,
      codexPath: f.codexPath,
      model: "gpt-6.1-sol",
    })({
      prompt: "Generate",
      imagePaths: [],
      directory: f.directory,
      transparentBackground: false,
    }),
  ).rejects.toThrow("no image was produced");
});

test("native output cannot escape the session folder through a symlink", async () => {
  const f = await nativeFixture(
    `console.log(JSON.stringify({type:'thread.started',thread_id:'${threadId}'}));`,
  );
  const generated = join(f.codexHome, "generated_images");
  await mkdir(generated);
  const privateImage = join(f.root, "private.png");
  await writeFile(privateImage, png);
  await symlink(f.root, join(generated, threadId));
  await expect(
    nativeImageGeneration({
      codexHome: f.codexHome,
      codexPath: f.codexPath,
      model: "gpt-6.1-sol",
    })({
      prompt: "Generate",
      imagePaths: [],
      directory: f.directory,
      transparentBackground: false,
    }),
  ).rejects.toThrow("no image was produced");
  expect(await Bun.file(privateImage).exists()).toBe(true);
});

test("native generation is killed when the MCP request is cancelled", async () => {
  const f = await nativeFixture(
    `console.log(JSON.stringify({type:'thread.started',thread_id:'${threadId}'})); await Bun.sleep(10000);`,
  );
  const controller = new AbortController();
  const run = nativeImageGeneration({
    codexHome: f.codexHome,
    codexPath: f.codexPath,
    model: "gpt-6.1-sol",
  })(
    {
      prompt: "Generate",
      imagePaths: [],
      directory: f.directory,
      transparentBackground: false,
    },
    controller.signal,
  );
  controller.abort(new Error("Request cancelled"));
  await expect(run).rejects.toThrow("Request cancelled");
});
