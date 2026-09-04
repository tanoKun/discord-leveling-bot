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

// テキストとVCはレベルを共有しない。種別ごとのXPだけでレベルを判定する。
function describeGain(result) {
  if (!result) {
    return null;
  }

  const levelBefore = levelForTotalXp(result.xpBefore);
  const levelAfter = levelForTotalXp(result.xpAfter);

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

function progressFor(xp, rank) {
  const progress = levelProgress(xp);

  return {
    level: progress.level,
    xp: progress.totalXp,
    currentLevelXp: progress.currentLevelXp,
    requiredLevelXp: progress.requiredLevelXp,
    rank
  };
}

/** `/level show` 用のプロフィール。テキストとVCをそれぞれ独立したレベルとして返す。 */
export async function getProfile(guildId, userId, { repo = repository } = {}) {
  const member = (await repo.getMember(guildId, userId)) ?? repo.emptyMember(guildId, userId);

  const [textRank, voiceRank] = member.exists
    ? await Promise.all([repo.getTextRank(guildId, userId), repo.getVoiceRank(guildId, userId)])
    : [null, null];

  return {
    member,
    text: progressFor(member.textXp, textRank),
    voice: {
      ...progressFor(member.voiceXp, voiceRank),
      seconds: member.voiceSeconds
    }
  };
}

export async function resetMember(guildId, userId, { repo = repository } = {}) {
  await repo.resetMember(guildId, userId);
}
