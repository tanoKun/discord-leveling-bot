import http from "node:http";

import { Events } from "discord.js";

import { config } from "./config.js";
import { pool, runMigrations } from "./db/pool.js";
import { createClient } from "./discord/client.js";
import { logger } from "./logger.js";
import { notifyVoiceLevelUp } from "./services/level-notification.js";
import { VoiceTracker } from "./services/voice-tracker.js";

const client = createClient();

const voiceTracker = new VoiceTracker({
  onLevelUp: async ({ guildId, userId, level }) => {
    const guild = client.guilds.cache.get(guildId);

    if (!guild) {
      return;
    }

    await notifyVoiceLevelUp(guild, userId, level);
  }
});

client.voiceTracker = voiceTracker;

client.once(Events.ClientReady, async (readyClient) => {
  const guildCount = readyClient.guilds.cache.size;

  logger.info(`logged in as ${readyClient.user.tag} (guilds: ${guildCount})`);

  if (guildCount === 0) {
    // applications.commands だけで承認されている場合、コマンドは動くが
    // messageCreate / voiceStateUpdate は届かないためXPが一切入らない
    logger.warn(
      "not a member of any guild. invite the bot with the 'bot' scope, otherwise no xp will be granted"
    );
  }

  for (const guild of readyClient.guilds.cache.values()) {
    await voiceTracker.syncGuild(guild).catch((error) =>
      logger.error(`failed to sync voice states for guild ${guild.id}`, error)
    );
  }

  voiceTracker.start();
  logger.info("ready");
});

client.on(Events.GuildCreate, (guild) => {
  voiceTracker
    .syncGuild(guild)
    .catch((error) => logger.error(`failed to sync voice states for guild ${guild.id}`, error));
});

const healthServer = http.createServer((request, response) => {
  const healthy = client.isReady();

  response.writeHead(healthy ? 200 : 503, { "content-type": "application/json" });
  response.end(JSON.stringify({ status: healthy ? "ok" : "starting" }));
});

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info(`received ${signal}, shutting down`);

  try {
    // 端数秒を保存し、タイマーを停止する
    await voiceTracker.stop();
  } catch (error) {
    logger.error("failed to flush voice sessions", error);
  }

  try {
    await client.destroy();
  } catch (error) {
    logger.error("failed to destroy discord client", error);
  }

  healthServer.close();

  try {
    await pool.end();
  } catch (error) {
    logger.error("failed to close postgres pool", error);
  }

  process.exit(0);
}

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    shutdown(signal).catch((error) => {
      logger.error("shutdown failed", error);
      process.exit(1);
    });
  });
}

process.on("unhandledRejection", (reason) => logger.error("unhandled rejection", reason));

async function main() {
  await pool.query("SELECT 1");
  logger.info("connected to postgres");

  await runMigrations();

  healthServer.listen(config.PORT, () => logger.info(`health server listening on ${config.PORT}`));

  await client.login(config.DISCORD_TOKEN);
}

main().catch(async (error) => {
  logger.error("startup failed", error);

  healthServer.close();

  try {
    await client.destroy();
  } catch {
    // 起動前なので無視する
  }

  try {
    await pool.end();
  } catch {
    // 起動前なので無視する
  }

  process.exitCode = 1;
});
