import { randomInt } from "node:crypto";

import * as repository from "../db/member-repository.js";
import { levelForTotalXp, levelProgress } from "../domain/level-math.js";
import { LEVEL_POLICY } from "../domain/level-policy.js";

export function rollTextXp() {
  return randomInt(LEVEL_POLICY.textXpMin, LEVEL_POLICY.textXpMax + 1);
}

export function rollTextCooldownSeconds() {
  return randomInt(LEVEL_POLICY.textCooldownMinSeconds, LEVEL_POLICY.textCooldownMaxSeconds + 1);
}

function describeGain(result) {
  if (!result) {
    return null;
  }

  const levelBefore = levelForTotalXp(result.totalXpBefore);
  const levelAfter = levelForTotalXp(result.totalXpAfter);

  return {
    ...result,
    levelBefore,
    levelAfter,
    leveledUp: levelAfter > levelBefore
  };
}

/**
 * テキストXPを付与する。
 * Cooldown中は null。
 */
export async function grantTextXp(guildId, userId, { now = new Date(), repo = repository } = {}) {
  const result = await repo.grantTextXp(guildId, userId, {
    xp: rollTextXp(),
    cooldownSeconds: rollTextCooldownSeconds(),
    now
  });

  return describeGain(result);
}

/** VC滞在秒数を反映する。 */
export async function addVoiceSeconds(guildId, userId, seconds, { repo = repository } = {}) {
  const result = await repo.addVoiceSeconds(guildId, userId, seconds);

  return describeGain(result);
}

/** `/level show` 用のプロフィール */
export async function getProfile(guildId, userId, { repo = repository } = {}) {
  const member = (await repo.getMember(guildId, userId)) ?? repo.emptyMember(guildId, userId);
  const rank = member.exists ? await repo.getRank(guildId, userId) : null;

  return {
    member,
    rank,
    ...levelProgress(member.totalXp)
  };
}

export async function resetMember(guildId, userId, { repo = repository } = {}) {
  await repo.resetMember(guildId, userId);
}
