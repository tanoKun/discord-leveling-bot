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

const route = config.DISCORD_DEV_GUILD_ID
  ? Routes.applicationGuildCommands(config.DISCORD_APPLICATION_ID, config.DISCORD_DEV_GUILD_ID)
  : Routes.applicationCommands(config.DISCORD_APPLICATION_ID);

await rest.put(route, { body });

console.log(
  config.DISCORD_DEV_GUILD_ID
    ? `registered guild commands for ${config.DISCORD_DEV_GUILD_ID}`
    : "registered global commands"
);
