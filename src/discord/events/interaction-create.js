import { Events, MessageFlags } from "discord.js";

import { logger } from "../../logger.js";
import * as levelReset from "../commands/level-reset.js";
import * as levelShow from "../commands/level-show.js";

export const name = Events.InteractionCreate;

const subcommands = new Map([
  [levelShow.name, levelShow],
  [levelReset.name, levelReset]
]);

export async function execute(interaction) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "level") {
    return;
  }

  if (!interaction.inGuild()) {
    await interaction.reply({
      content: "このコマンドはサーバー内でのみ使用できます。",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const handler = subcommands.get(interaction.options.getSubcommand());

  if (!handler) {
    return;
  }

  try {
    await handler.execute(interaction);
  } catch (error) {
    logger.error(`command failed: /level ${interaction.options.getSubcommand()}`, error);

    const payload = {
      content: "コマンドの実行中にエラーが発生しました。",
      embeds: [],
      files: [],
      components: []
    };

    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload);
      } else {
        await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
      }
    } catch (replyError) {
      logger.error("failed to report command error", replyError);
    }
  }
}
