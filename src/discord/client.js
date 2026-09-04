import { Client, Events, GatewayIntentBits } from "discord.js";

import { logger } from "../logger.js";
import * as interactionCreate from "./events/interaction-create.js";
import * as messageCreate from "./events/message-create.js";
import * as voiceStateUpdate from "./events/voice-state-update.js";

const events = [messageCreate, voiceStateUpdate, interactionCreate];

export function createClient() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildVoiceStates
    ]
  });

  for (const event of events) {
    client.on(event.name, (...args) => {
      Promise.resolve(event.execute(...args)).catch((error) =>
        logger.error(`unhandled error in ${String(event.name)}`, error)
      );
    });
  }

  client.on(Events.Error, (error) => logger.error("discord client error", error));
  client.on(Events.ShardDisconnect, (event, shardId) =>
    logger.warn(`shard ${shardId} disconnected (${event.code})`)
  );
  client.on(Events.ShardReconnecting, (shardId) => logger.warn(`shard ${shardId} reconnecting`));
  client.on(Events.ShardResume, (shardId) => logger.info(`shard ${shardId} resumed`));

  return client;
}
