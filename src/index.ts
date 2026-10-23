import {
  ApplicationCommandType,
  InteractionResponseType,
  InteractionType,
  MessageFlags,
  type APIInteraction,
} from "discord-api-types/v10";
import { completeGeneration, readRobotInput } from "./generate";
import { verifyDiscordRequest } from "./lib/discord";
import { BodyTooLargeError, readBytes } from "./lib/http";

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (request.method === "GET" && path === "/") return new Response("generate-robot is running");
    if (path !== "/interactions") return new Response("Not found", { status: 404 });
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
    if (!/^[a-f\d]{64}$/i.test(env.DISCORD_PUBLIC_KEY ?? "")) {
      console.error({ event: "discord.public_key_missing" });
      return new Response("Discord public key is not configured", { status: 503 });
    }
    try {
      const body = await readBytes(request, 64 * 1024);
      if (!await verifyDiscordRequest(request, body, env.DISCORD_PUBLIC_KEY)) {
        return new Response("Invalid request signature", { status: 401 });
      }
      let interaction: APIInteraction;
      try {
        interaction = JSON.parse(new TextDecoder().decode(body));
      } catch {
        return new Response("Invalid JSON", { status: 400 });
      }
      if (interaction.type === InteractionType.Ping) {
        return Response.json({ type: InteractionResponseType.Pong });
      }
      if (interaction.type !== InteractionType.ApplicationCommand ||
          interaction.data.type !== ApplicationCommandType.ChatInput ||
          interaction.data.name !== "generate_robot") {
        return replyError("コマンドが見つかりません。");
      }
      const input = readRobotInput(interaction.data);
      if (typeof input === "string") return replyError(input);
      ctx.waitUntil(completeGeneration(interaction, input, env));
      return Response.json({ type: InteractionResponseType.DeferredChannelMessageWithSource });
    } catch (error) {
      if (error instanceof BodyTooLargeError) return new Response("Payload too large", { status: 413 });
      console.error({ event: "discord.request_failed", message: error instanceof Error ? error.message : "Unknown error" });
      return new Response("Internal server error", { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;

function replyError(content: string): Response {
  return Response.json({
    type: InteractionResponseType.ChannelMessageWithSource,
    data: { content, flags: MessageFlags.Ephemeral, allowed_mentions: { parse: [] } },
  });
}
