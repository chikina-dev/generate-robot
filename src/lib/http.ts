export class BodyTooLargeError extends Error {}

export async function readBytes(
  source: Request | Response,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  if (Number(source.headers.get("content-length")) > maxBytes) {
    await source.body?.cancel();
    throw new BodyTooLargeError("ファイルサイズが上限を超えています。");
  }
  const reader = source.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw new BodyTooLargeError("ファイルサイズが上限を超えています。");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
