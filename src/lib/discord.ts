export async function verifyDiscordRequest(
  request: Request,
  body: Uint8Array<ArrayBuffer>,
  publicKey: string,
): Promise<boolean> {
  const signature = request.headers.get("x-signature-ed25519") ?? "";
  const timestamp = request.headers.get("x-signature-timestamp") ?? "";
  if (!/^[a-f\d]{128}$/i.test(signature) || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const prefix = new TextEncoder().encode(timestamp);
  const message = new Uint8Array(prefix.length + body.length);
  message.set(prefix);
  message.set(body, prefix.length);
  const key = await crypto.subtle.importKey("raw", fromHex(publicKey), "Ed25519", false, ["verify"]);
  return crypto.subtle.verify("Ed25519", key, fromHex(signature), message);
}

function fromHex(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
}
