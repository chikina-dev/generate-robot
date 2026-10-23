import { robotCommand } from "../src/commands.ts";

const { DISCORD_APPLICATION_ID: applicationId, DISCORD_BOT_TOKEN: token, DISCORD_GUILD_ID: guildId } = process.env;
if (!applicationId || !token) throw new Error(".envにDISCORD_APPLICATION_IDとDISCORD_BOT_TOKENを設定してください。");
if (!/^\d+$/.test(applicationId) || (guildId && !/^\d+$/.test(guildId))) throw new Error("Application IDとGuild IDは数字で指定してください。");
const scope = guildId ? `applications/${applicationId}/guilds/${guildId}/commands` : `applications/${applicationId}/commands`;
// POST upserts only this command and leaves any other application commands intact.
const response = await fetch(`https://discord.com/api/v10/${scope}`, {
  method: "POST",
  headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(robotCommand),
  signal: AbortSignal.timeout(15_000),
});
await response.body?.cancel();
if (!response.ok) throw new Error(`コマンド登録に失敗しました（HTTP ${response.status}）。`);
console.log(`/generate_robotを${guildId ? "開発サーバー" : "グローバル"}に登録しました。`);
