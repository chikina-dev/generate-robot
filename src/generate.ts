import { AttachmentBuilder, Client, ChatInputCommandInteraction, Events, InteractionResponse, REST, Routes, SlashCommandBuilder, SlashCommandOptionsOnlyBuilder } from "discord.js";
import { loadImage, registerFont } from "canvas";
import { GenerateRobotText } from "./lib/generate/image";
import * as send from "./lib/send";
import { styleText } from "util";

type commandHandlerType = (interaction: ChatInputCommandInteraction) => Promise<InteractionResponse | void>;

type commandType = {
  name: string;
  builder: SlashCommandOptionsOnlyBuilder;
  handler: commandHandlerType;
}

registerFont('./public/font/GenJyuuGothic-Normal.ttf', { family: 'GenJyuuGothic-Normal' });

const commands: commandType[] = [
  {
    name: "generate_robot",
    builder: new SlashCommandBuilder()
      .setName('generate_robot')
      .setDescription('鬼畜ロボットの画像です.')
      .addStringOption(option => option
        .setName('content')
        .setDescription('吹き出しのテキスト')
        .setRequired(true)
      ),
    handler: async (interaction) => {
      const content = interaction.options.getString("content")
      const robotImage = await loadImage(process.env.ROBOT_IMAGE_PATH ?? "");
      getLog(content);
      if (!content) return await send.SendReply(interaction, send.GenerateText(`内容を入力してください。`))
      const textAttachment = new AttachmentBuilder(GenerateRobotText({ content, robotImage }), { name: 'hapyou-robot.png' });
      return await send.SendReply(interaction, send.GenerateFile(textAttachment));
    }
  }
]
function robotHandlers(commands: commandType[]): { [key: string]: commandHandlerType } {
  return commands.reduce((handlers, command) => {
    handlers[command.name] = command.handler;
    return handlers;
  }, {} as { [key: string]: commandHandlerType });
}

async function registerCommands(client: Client, rest: REST) {
  try {
    await rest.put(
      Routes.applicationCommands(client.user?.id ?? ""),
      { body: commands.map(command => command.builder.toJSON()) }
    );
  } catch (err) {
    console.error('Failed to register commands:', err);
  }
}

function GenerateRobot(client: Client) {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN ?? "");
  const commandHandlers = robotHandlers(commands);

  if (process.env.DISCORD_BOT_TOKEN) {
    registerCommands(client, rest).then(() => {
      console.log('Successfully registered application commands.');
      client.on(Events.InteractionCreate, async (interaction) => {
        if (interaction.isChatInputCommand()) {
          if (interaction.commandName in commandHandlers) {
            return commandHandlers[interaction.commandName](interaction);
          } else {
            return await send.SendReply(interaction, send.GenerateText(`コマンドが見つかりません。`))
          }
        }
      });
    });
  }
}

function getLog(content: string | null) {
	console.log(styleText('bgWhiteBright', styleText('black','----- Get Log -----')));
	console.log(styleText('yellow', `日付: ${new Date().toLocaleString()}`));
  console.log(styleText('white', `データ: ${content}\n`));
}


export default GenerateRobot;
