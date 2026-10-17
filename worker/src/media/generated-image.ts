import { readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";

const receipt = ".generated-image.json";
const mediaIdPattern = /^media-[a-zA-Z0-9_-]+\.png$/u;

export async function recordGeneratedImage(directory: string, mediaId: string) {
  if (!mediaIdPattern.test(mediaId))
    throw new Error("Invalid generated image ID.");
  await writeFile(join(directory, receipt), JSON.stringify({ mediaId }), {
    mode: 0o600,
  });
}

export async function latestGeneratedImage(
  directory: string,
): Promise<string | undefined> {
  const raw = await readFile(join(directory, receipt), "utf8").catch(
    (error) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    },
  );
  if (!raw) return undefined;
  const value = JSON.parse(raw);
  if (!mediaIdPattern.test(value.mediaId))
    throw new Error("Invalid generated image receipt.");
  return value.mediaId;
}

export async function clearGeneratedImage(directory: string, mediaId: string) {
  if ((await latestGeneratedImage(directory)) === mediaId)
    await rm(join(directory, receipt), { force: true });
}
