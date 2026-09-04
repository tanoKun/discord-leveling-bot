import { LEVEL_POLICY } from "./level-policy.js";

/**
 * ProBot風レベルカーブ。
 *
 *   T(L) = floor(32.8739 * L^2 + 19.3492 * L)
 *
 * BigIntで厳密に計算する。
 */

const {
  curveEarlyMaxLevel: EARLY_MAX,
  curveEarlyMultiplier: EARLY_MULTIPLIER,
  curveLateMinLevel: LATE_MIN,
  curveLateMultiplier: LATE_MULTIPLIER
} = LEVEL_POLICY;

// 倍率は 1/1000 単位の整数で扱う(BigIntで厳密に計算するため)
const EARLY_SCALED = BigInt(Math.round(EARLY_MULTIPLIER * 1000));
const LATE_SCALED = BigInt(Math.round(LATE_MULTIPLIER * 1000));

/** Level L に掛ける倍率(1/1000単位)。EARLY_MAX〜LATE_MIN は線形補間する。 */
function multiplierScaled(level) {
  if (level <= EARLY_MAX) {
    return EARLY_SCALED;
  }

  if (level >= LATE_MIN) {
    return LATE_SCALED;
  }

  const span = BigInt(LATE_MIN - EARLY_MAX);
  const step = BigInt(level - EARLY_MAX);

  return EARLY_SCALED - ((EARLY_SCALED - LATE_SCALED) * step) / span;
}

/** 連続値のレベルに対する倍率(VCの換算で使う) */
function multiplierFor(level) {
  if (level <= EARLY_MAX) {
    return EARLY_MULTIPLIER;
  }

  if (level >= LATE_MIN) {
    return LATE_MULTIPLIER;
  }

  const ratio = (level - EARLY_MAX) / (LATE_MIN - EARLY_MAX);

  return EARLY_MULTIPLIER - (EARLY_MULTIPLIER - LATE_MULTIPLIER) * ratio;
}

/** Level L に到達するために必要な累計XP */
export function totalXpForLevel(level) {
  const l = BigInt(level);

  if (l < 0n) {
    throw new RangeError("level must be >= 0");
  }

  return ((328739n * l * l + 193492n * l) * multiplierScaled(Number(level))) / 10000000n;
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
 * VCのXPはチャットとは別の式で求める。
 *
 * 目安として指定した「VCだけでLevel Lに到達するまでの時間」
 *
 *   hours(L) = VOICE_A * L^2 + VOICE_B * L
 *
 * を満たすように、滞在秒数からXPへ変換する。
 * hours(1) と hours(10) の2点から係数を決める。
 */
const VOICE_A = (LEVEL_POLICY.voiceHoursForLevel10 - 10 * LEVEL_POLICY.voiceHoursForLevel1) / 90;
const VOICE_B = LEVEL_POLICY.voiceHoursForLevel1 - VOICE_A;

if (!(VOICE_A > 0) || !(VOICE_B > 0)) {
  throw new RangeError(
    "voiceHoursForLevel10 must be between 10x and 100x of voiceHoursForLevel1"
  );
}

/** VC滞在時間(時間)に相当する連続値のレベル */
export function voiceLevelForHours(hours) {
  if (hours <= 0) {
    return 0;
  }

  return (-VOICE_B + Math.sqrt(VOICE_B * VOICE_B + 4 * VOICE_A * hours)) / (2 * VOICE_A);
}

/** VC滞在時間(時間)でLevel Lに到達するのに必要な時間 */
function voiceHoursForLevel(level) {
  return VOICE_A * level * level + VOICE_B * level;
}

/**
 * VC滞在秒数の累計に対応するVC XP。
 *
 * 整数レベル間を線形補間する。こうするとレベルカーブの形に関わらず
 * 「Level L に到達する時間」が目安どおりになり、かつXPが逆行しない。
 */
export function voiceXpForSeconds(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds)));

  if (total === 0) {
    return 0n;
  }

  const hours = total / 3600;
  const level = Math.floor(voiceLevelForHours(hours));

  const fromHours = voiceHoursForLevel(level);
  const toHours = voiceHoursForLevel(level + 1);

  const fromXp = totalXpForLevel(level);
  const toXp = totalXpForLevel(level + 1);

  const ratio = Math.min(1, Math.max(0, (hours - fromHours) / (toHours - fromHours)));

  return fromXp + BigInt(Math.floor(Number(toXp - fromXp) * ratio));
}

/** Level L にVCだけで到達するのに必要な滞在秒数(目安表示・テスト用) */
export function voiceSecondsForLevel(level) {
  const l = Number(level);

  return Math.round((VOICE_A * l * l + VOICE_B * l) * 3600);
}
