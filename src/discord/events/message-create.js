import { Events } from "discord.js";

import { logger } from "../../logger.js";
import { notifyTextLevelUp } from "../../services/level-notification.js";
import { grantTextXp } from "../../services/xp-service.js";

export const name = Events.MessageCreate;

/** XP対象メッセージか(本文は判定しない) */
export function isXpEligibleMessage(message) {
  if (!message.guildId) {
    return false;
  }

  if (message.author?.bot) {
    return false;
  }

  if (message.webhookId) {
    return false;
  }

  if (message.system) {
    return false;
  }

  return true;
}

export async function execute(message) {
  if (!isXpEligibleMessage(message)) {
    return;
  }

  try {
    const result = await grantTextXp(message.guildId, message.author.id);

    if (!result || !result.leveledUp) {
      return;
    }

    await notifyTextLevelUp(message.channel, message.author.id, result.levelAfter);
  } catch (error) {
    logger.error("failed to grant text xp", error);
  }
}
