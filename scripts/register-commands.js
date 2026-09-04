import { InteractionContextType, REST, Routes, SlashCommandBuilder } from "discord.js";

import { config } from "../src/config.js";
import * as levelReset from "../src/discord/commands/level-reset.js";
import * as levelShow from "../src/discord/commands/level-show.js";

export function buildLevelCommand() {
  return new SlashCommandBuilder()
    .setName("level")
    .setDescription("レベル関連のコマンド")
    .setContexts(InteractionContextType.Guild)
    .addSubcommand(levelShow.data)
    .addSubcommand(levelReset.data);
}

if (!config.DISCORD_APPLICATION_ID) {
  console.error("DISCORD_APPLICATION_ID is required to register commands");
  process.exit(1);
}

const body = [buildLevelCommand().toJSON()];

const rest = new REST({ version: "10" }).setToken(config.DISCORD_TOKEN);

const guildIds = config.DISCORD_DEV_GUILD_ID;

if (guildIds.length === 0) {
  // グローバル登録(反映に時間がかかる)
  await rest.put(Routes.applicationCommands(config.DISCORD_APPLICATION_ID), { body });
  console.log("registered global commands");
} else {
  // ギルド登録は1ギルドずつ。指定された分だけ繰り返す(即時反映)
  for (const guildId of guildIds) {
    await rest.put(Routes.applicationGuildCommands(config.DISCORD_APPLICATION_ID, guildId), {
      body
    });
    console.log(`registered guild commands for ${guildId}`);
  }
}
