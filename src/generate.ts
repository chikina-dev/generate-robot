import {
  ApplicationCommandOptionType,
  type APIChatInputApplicationCommandInteractionData,
  type APIApplicationCommandInteraction,
} from "discord-api-types/v10";
import { generateRobot, type RobotInput } from "./lib/generate/image";
import { editReply } from "./lib/send";

export function readRobotInput(data: APIChatInputApplicationCommandInteractionData): RobotInput | string {
  const option = data.options?.find((option) => option.name === "content");
  const content = option?.type === ApplicationCommandOptionType.String ? option.value : undefined;
  if (!content?.trim()) return "内容を入力してください。";
  if (content.length > 1000 || content.split(/\\n|\r?\n/).length > 40) {
    return "内容は1000文字・40行以内にしてください。";
  }
  return { content };
}

export async function completeGeneration(
  interaction: APIApplicationCommandInteraction,
  input: RobotInput,
  env: Env,
): Promise<void> {
  try {
    const png = await generateRobot(input, env.ASSETS);
    if (png.byteLength > interaction.attachment_size_limit) {
      throw new Error("生成した画像がDiscordの添付サイズ上限を超えました。");
    }
    await editReply(interaction.application_id, interaction.token, { png });
    console.log({ event: "robot.generated", interactionId: interaction.id });
  } catch (error) {
    console.error({ event: "robot.failed", interactionId: interaction.id, message: error instanceof Error ? error.message : "Unknown error" });
    try {
      await editReply(interaction.application_id, interaction.token, { error: "画像の生成・送信に失敗しました。もう一度お試しください。" });
    } catch {
      console.error({ event: "robot.error_reply_failed", interactionId: interaction.id });
    }
  }
}
