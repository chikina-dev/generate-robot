import { ApplicationCommandOptionType, type RESTPostAPIApplicationCommandsJSONBody } from "discord-api-types/v10";

export const robotCommand = {
  name: "generate_robot",
  description: "鬼畜ロボットの画像です.",
  options: [{
    type: ApplicationCommandOptionType.String,
    name: "content",
    description: "吹き出しのテキスト（\\nで改行）",
    required: true,
    max_length: 1000,
  }],
} satisfies RESTPostAPIApplicationCommandsJSONBody;
