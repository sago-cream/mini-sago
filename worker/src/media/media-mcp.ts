import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { MediaProcessor } from "./media";
import { httpMediaClient } from "./media-client";
import { PythonProcessor, pythonToolSchema } from "./python";
import {
  ImageGenerator,
  imageGenerationSchema,
  nativeImageGeneration,
} from "./image-generation";
import { realpath } from "node:fs/promises";

function toolResult(value: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: value,
  };
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "Media processing failed.";
}

async function main() {
  const manifestPath = process.env.MINISAGO_MEDIA_MANIFEST;
  if (!manifestPath) throw new Error("MINISAGO_MEDIA_MANIFEST is required.");
  const sandboxUrl = process.env.MINISAGO_SANDBOX_URL;
  if (!sandboxUrl) throw new Error("MINISAGO_SANDBOX_URL is required.");
  const mcpUrl = process.env.MINISAGO_MCP_URL;
  const token = process.env.MINISAGO_MCP_TOKEN;
  if (!mcpUrl || !token) throw new Error("MiniSago media access is required.");
  const mediaClient = httpMediaClient(mcpUrl, token);
  const processor = await MediaProcessor.fromFile(manifestPath, mediaClient);
  const generationController = new AbortController();
  const codexPath = process.env.MINISAGO_IMAGE_CODEX_PATH;
  const codexHome = process.env.MINISAGO_IMAGE_CODEX_HOME;
  const imageManifest = await Bun.file(manifestPath).json();
  const imageGenerator =
    codexPath && codexHome
      ? new ImageGenerator(
          processor,
          await realpath(imageManifest.root),
          await realpath(imageManifest.outputDirectory),
          nativeImageGeneration({
            codexPath,
            codexHome,
            model: process.env.MINISAGO_IMAGE_MODEL || "gpt-6.1-sol",
          }),
        )
      : undefined;
  const python = await PythonProcessor.fromFile(
    manifestPath,
    sandboxUrl,
    mediaClient,
  );
  const server = new McpServer(
    { name: "minisago-media", version: "1.0.0" },
    {
      instructions:
        "Use these request-local tools only when the requester explicitly asks to inspect, compute with, or transform media, or a coding task needs an attachment downloaded into its workspace. Every attachment, member avatar, and generated output is addressed by the same mediaId. Tool outputs may be passed directly into later media or Discord tools. Never invent media IDs. Return at most one useful artifact in the final answer. Prefer a specific media tool when it fits. Otherwise use run_python for general request-local computation. Python includes Pillow, NumPy, OpenCV, scikit-image, rembg with the offline lightweight u2netp model, pypdf, python-docx, openpyxl, and FFmpeg. It has no network, cannot install packages, receives no credentials, and is limited by time, memory, processes, and output size.",
    },
  );
  const readAnnotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  } as const;
  const transformAnnotations = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  } as const;

  if (process.env.MINISAGO_MEDIA_DEVELOPER === "1") {
    server.registerTool(
      "download_attachment",
      {
        description:
          "Download the original Discord attachment into the coding task's attachment folder by mediaId. Use IDs from supplied context or resolve_context, including uploads received during an active task. Returns the local path for viewing or copying into the repository. The host refreshes expired Discord links. No URL or destination path is accepted.",
        inputSchema: { mediaId: z.string().trim().min(1).max(200) },
        annotations: readAnnotations,
      },
      async ({ mediaId }) => {
        try {
          return toolResult({
            status: "complete",
            ...(await processor.download(mediaId)),
          });
        } catch (error) {
          return toolResult({ status: "invalid", error: message(error) });
        }
      },
    );
  }

  if (imageGenerator)
    server.registerTool(
      "generate_image",
      {
        description:
          "Generate an image from a prompt or edit referenced request-local images. Supply mediaIds from attachments, avatars, read_guild_emoji, or prior media outputs; omit them for a new image. Uses the worker's ChatGPT-authenticated built-in Codex generator, without an API key. purpose emoji creates a transparent 128×128 PNG under 256 KiB; sticker creates a transparent 320×320 PNG under 512 KiB. transparentBackground overrides the purpose default. Editing produces a still image and preserves the source. Returns a reusable mediaId for add_guild_expression and subsequent edits. The host automatically attaches the latest generated result to the Discord answer. Do not claim success without a complete result, and do not add or replace an expression unless explicitly requested.",
        inputSchema: imageGenerationSchema,
        annotations: { ...transformAnnotations, openWorldHint: true },
      },
      async (input, extra) => {
        try {
          return toolResult({
            status: "complete",
            ...(await imageGenerator.generate(
              input,
              AbortSignal.any([extra.signal, generationController.signal]),
            )),
          });
        } catch (error) {
          return toolResult({ status: "unavailable", error: message(error) });
        }
      },
    );

  server.registerTool(
    "inspect_media",
    {
      description:
        "Inspect request-scoped audio, image, or video by mediaId. Returns bounded format, stream, dimension, and duration metadata.",
      inputSchema: {
        mediaId: z.string().trim().min(1).max(200),
      },
      annotations: readAnnotations,
    },
    async ({ mediaId }) => {
      try {
        return toolResult({
          status: "complete",
          ...(await processor.inspect(mediaId)),
        });
      } catch (error) {
        return toolResult({ status: "invalid", error: message(error) });
      }
    },
  );

  server.registerTool(
    "transform_image",
    {
      description:
        "Convert, resize, fit, or rotate request-scoped image media. Returns a mediaId that can be passed directly to another media or Discord tool.",
      inputSchema: {
        mediaId: z.string().trim().min(1).max(200),
        format: z.enum(["jpeg", "png", "webp"]).default("webp"),
        width: z.number().int().min(16).max(4096).optional(),
        height: z.number().int().min(16).max(4096).optional(),
        fit: z.enum(["contain", "cover", "stretch"]).default("contain"),
        rotate: z
          .union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])
          .default(0),
        quality: z.number().int().min(20).max(100).default(82),
      },
      annotations: transformAnnotations,
    },
    async (input) => {
      try {
        return toolResult({
          status: "complete",
          ...(await processor.transformImage(input)),
        });
      } catch (error) {
        return toolResult({ status: "invalid", error: message(error) });
      }
    },
  );

  server.registerTool(
    "extract_video_frame",
    {
      description:
        "Extract one still frame from a video attached to the active request. Produces one temporary image artifact. Call only when the requester explicitly asks for a frame or thumbnail.",
      inputSchema: {
        mediaId: z.string().trim().min(1).max(200),
        timeSeconds: z.number().min(0).max(600).default(0),
        format: z.enum(["jpeg", "png", "webp"]).default("jpeg"),
        width: z.number().int().min(16).max(4096).optional(),
      },
      annotations: transformAnnotations,
    },
    async (input) => {
      try {
        return toolResult({
          status: "complete",
          ...(await processor.extractFrame(input)),
        });
      } catch (error) {
        return toolResult({ status: "invalid", error: message(error) });
      }
    },
  );

  server.registerTool(
    "transcode_media",
    {
      description:
        "Create a short MP4, MP3, or GIF from an audio or video attachment in the active request. Uses fixed codecs and bounded presets; arbitrary FFmpeg arguments are not accepted.",
      inputSchema: {
        mediaId: z.string().trim().min(1).max(200),
        preset: z.enum(["audio_mp3", "gif", "video_mp4"]),
        startSeconds: z.number().min(0).max(600).default(0),
        durationSeconds: z.number().min(0.1).max(120),
        maxWidth: z.number().int().min(64).max(1280).default(1280),
      },
      annotations: transformAnnotations,
    },
    async (input) => {
      try {
        return toolResult({
          status: "complete",
          ...(await processor.transcode(input)),
        });
      } catch (error) {
        return toolResult({ status: "invalid", error: message(error) });
      }
    },
  );

  server.registerTool(
    "run_python",
    {
      description:
        "Run bounded Python for a computation, document read, or media transformation not covered by another tool. Read MINISAGO_INPUTS_JSON for selected request-local input paths. If outputExtension is set, write exactly one result to MINISAGO_OUTPUT_PATH and return its mediaId. Pillow, NumPy, OpenCV, scikit-image, rembg (offline lightweight u2netp model), pypdf, python-docx, openpyxl, and FFmpeg are available. The runtime has no network or package installation.",
      inputSchema: pythonToolSchema,
      annotations: transformAnnotations,
    },
    async (input) => {
      try {
        return toolResult({
          status: "complete",
          ...(await python.run(input)),
        });
      } catch (error) {
        return toolResult({ status: "invalid", error: message(error) });
      }
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  const close = transport.onclose;
  transport.onclose = () => {
    generationController.abort();
    close?.();
  };
  process.once("SIGTERM", () => {
    generationController.abort();
    process.exit(0);
  });
}

await main().catch((error) => {
  console.error(message(error));
  process.exit(1);
});
