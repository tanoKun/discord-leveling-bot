import { LEVEL_POLICY } from "./level-policy.js";

/**
 * ProBot風レベルカーブ。
 *
 *   T(L) = floor(32.8739 * L^2 + 19.3492 * L)
 *
 * BigIntで厳密に計算する。
 */

/** Level L に到達するために必要な累計XP */
export function totalXpForLevel(level) {
  const l = BigInt(level);

  if (l < 0n) {
    throw new RangeError("level must be >= 0");
  }

  return (328739n * l * l + 193492n * l) / 10000n;
}

/** T(L) <= totalXp を満たす最大の L */
export function levelForTotalXp(totalXp) {
  const xp = BigInt(totalXp);

  if (xp <= 0n) {
    return 0;
  }

  // 上限を倍々で探す
  let high = 1n;
  while (totalXpForLevel(high) <= xp) {
    high *= 2n;
  }

  // [low, high) の二分探索
  let low = high / 2n;
  while (high - low > 1n) {
    const mid = (low + high) / 2n;

    if (totalXpForLevel(mid) <= xp) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return Number(low);
}

/** 現在レベルと、そのレベル内での進捗 */
export function levelProgress(totalXp) {
  const xp = BigInt(totalXp);
  const level = levelForTotalXp(xp);

  const base = totalXpForLevel(level);
  const next = totalXpForLevel(level + 1);

  return {
    level,
    totalXp: xp,
    currentLevelXp: xp - base,
    requiredLevelXp: next - base
  };
}

/**
 * VC滞在秒数を 300秒(=1 tick)単位のXPと端数へ分解する。
 */
export function splitVoiceSeconds(remainderSeconds, addedSeconds, policy = LEVEL_POLICY) {
  const total = Math.max(0, Math.floor(remainderSeconds)) + Math.max(0, Math.floor(addedSeconds));
  const ticks = Math.floor(total / policy.voiceTickSeconds);

  return {
    ticks,
    gainedXp: ticks * policy.voiceXpPerTick,
    remainderSeconds: total % policy.voiceTickSeconds
  };
}
