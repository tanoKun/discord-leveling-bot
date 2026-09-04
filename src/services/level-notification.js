import { PermissionFlagsBits } from "discord.js";

import { config } from "../config.js";
import { logger } from "../logger.js";

function canSend(channel) {
  if (!channel?.isTextBased?.() || !channel.guild) {
    return false;
  }

  const me = channel.guild.members.me;

  if (!me) {
    return false;
  }

  const permissions = channel.permissionsFor(me);

  return Boolean(
    permissions?.has(PermissionFlagsBits.ViewChannel) &&
      permissions.has(PermissionFlagsBits.SendMessages)
  );
}

export const TEXT_LABEL = "テキストレベル";
export const VOICE_LABEL = "ボイスレベル";

function buildContent(userId, label, level) {
  return `🎉 <@${userId}> が ${label} ${level} になりました！`;
}

async function send(channel, userId, label, level) {
  await channel.send({
    content: buildContent(userId, label, level),
    allowedMentions: { users: [userId] }
  });
}

/**
 * テキストXPでのレベルアップ通知。
 * XPを獲得したチャンネルへ送信する。
 */
export async function notifyTextLevelUp(channel, userId, level) {
  if (!config.LEVEL_UP_NOTIFY || !canSend(channel)) {
    return false;
  }

  try {
    await send(channel, userId, TEXT_LABEL, level);
    return true;
  } catch (error) {
    // 通知失敗でXPはロールバックしない
    logger.warn("failed to send text level up notification", error);
    return false;
  }
}

/**
 * VC XPでのレベルアップ通知。
 * 1. LEVEL_UP_CHANNEL_ID
 * 2. Guild System Channel
 * 3. 送信できなければ通知しない
 */
export async function notifyVoiceLevelUp(guild, userId, level) {
  if (!config.LEVEL_UP_NOTIFY) {
    return false;
  }

  const candidates = [];

  if (config.LEVEL_UP_CHANNEL_ID) {
    candidates.push(guild.channels.cache.get(config.LEVEL_UP_CHANNEL_ID) ?? null);
  }

  candidates.push(guild.systemChannel ?? null);

  for (const channel of candidates) {
    if (!canSend(channel)) {
      continue;
    }

    try {
      await send(channel, userId, VOICE_LABEL, level);
      return true;
    } catch (error) {
      logger.warn("failed to send voice level up notification", error);
    }
  }

  return false;
}

export const __test = { buildContent };
