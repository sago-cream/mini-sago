/** Bound downloads even without Content-Length and release their stream resources. */
export async function readBoundedResponseBytes(
  response: Response,
  maximum: number,
  sizeError: string,
) {
  if (Number(response.headers.get("content-length") ?? 0) > maximum) {
    await response.body?.cancel().catch(() => {});
    throw new Error(sizeError);
  }
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) throw new Error(sizeError);
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
