export async function editReply(
  applicationId: string,
  token: string,
  result: { png: Uint8Array<ArrayBuffer> } | { error: string },
): Promise<void> {
  const form = new FormData();
  if ("png" in result) {
    form.set("payload_json", JSON.stringify({
      attachments: [{ id: 0, filename: "hapyou-robot.png" }],
      allowed_mentions: { parse: [] },
    }));
    form.set("files[0]", new Blob([result.png], { type: "image/png" }), "hapyou-robot.png");
  } else {
    form.set("payload_json", JSON.stringify({ content: result.error, allowed_mentions: { parse: [] } }));
  }
  const response = await fetch(
    `https://discord.com/api/v10/webhooks/${applicationId}/${token}/messages/@original`,
    { method: "PATCH", body: form, signal: AbortSignal.timeout(5000) },
  );
  await response.body?.cancel();
  if (!response.ok) throw new Error(`Discordへの返信に失敗しました（HTTP ${response.status}）。`);
}
