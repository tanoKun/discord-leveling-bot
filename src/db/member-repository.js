import { splitVoiceSeconds } from "../domain/level-math.js";
import { pool, withTransaction } from "./pool.js";

function toMember(row) {
  if (!row) {
    return null;
  }

  const textXp = BigInt(row.text_xp);
  const voiceXp = BigInt(row.voice_xp);

  return {
    guildId: row.guild_id,
    userId: row.user_id,
    textXp,
    voiceXp,
    totalXp: textXp + voiceXp,
    nextTextXpAt: row.next_text_xp_at,
    voiceRemainderSeconds: row.voice_remainder_seconds
  };
}

/** 空のメンバー(DB未登録ユーザーの表示用) */
export function emptyMember(guildId, userId) {
  return {
    guildId,
    userId,
    textXp: 0n,
    voiceXp: 0n,
    totalXp: 0n,
    nextTextXpAt: null,
    voiceRemainderSeconds: 0,
    exists: false
  };
}

async function ensureRow(client, guildId, userId) {
  await client.query(
    `INSERT INTO level_members (guild_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (guild_id, user_id) DO NOTHING`,
    [guildId, userId]
  );
}

async function lockMember(client, guildId, userId) {
  await ensureRow(client, guildId, userId);

  const result = await client.query(
    `SELECT * FROM level_members
     WHERE guild_id = $1 AND user_id = $2
     FOR UPDATE`,
    [guildId, userId]
  );

  return toMember(result.rows[0]);
}

export async function getMember(guildId, userId) {
  const result = await pool.query(
    "SELECT * FROM level_members WHERE guild_id = $1 AND user_id = $2",
    [guildId, userId]
  );

  const member = toMember(result.rows[0]);

  return member ? { ...member, exists: true } : null;
}

/**
 * ギルド内順位。1位が 1。
 * データが存在しない場合は null。
 */
export async function getRank(guildId, userId) {
  const result = await pool.query(
    `SELECT 1 + (
       SELECT COUNT(*) FROM level_members other
       WHERE other.guild_id = target.guild_id
         AND (other.text_xp + other.voice_xp) > (target.text_xp + target.voice_xp)
     ) AS rank
     FROM level_members target
     WHERE target.guild_id = $1 AND target.user_id = $2`,
    [guildId, userId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return Number(result.rows[0].rank);
}

/**
 * テキストXP付与。Cooldown判定込みでトランザクション処理する。
 * Cooldown中は null を返す(Cooldownは延長しない)。
 */
export async function grantTextXp(guildId, userId, { xp, cooldownSeconds, now = new Date() }) {
  return withTransaction(async (client) => {
    const member = await lockMember(client, guildId, userId);

    if (member.nextTextXpAt && member.nextTextXpAt.getTime() > now.getTime()) {
      return null;
    }

    const nextAt = new Date(now.getTime() + cooldownSeconds * 1000);

    const result = await client.query(
      `UPDATE level_members
       SET text_xp = text_xp + $3,
           next_text_xp_at = $4,
           updated_at = NOW()
       WHERE guild_id = $1 AND user_id = $2
       RETURNING *`,
      [guildId, userId, String(xp), nextAt]
    );

    const updated = toMember(result.rows[0]);

    return {
      gainedXp: BigInt(xp),
      totalXpBefore: member.totalXp,
      totalXpAfter: updated.totalXp,
      nextTextXpAt: nextAt
    };
  });
}

/**
 * VC滞在秒数を反映する。
 * remainder + seconds から 300秒単位でXPを確定し、余りを保持する。
 */
export async function addVoiceSeconds(guildId, userId, seconds) {
  return withTransaction(async (client) => {
    const member = await lockMember(client, guildId, userId);

    const split = splitVoiceSeconds(member.voiceRemainderSeconds, seconds);
    const remainder = split.remainderSeconds;
    const gainedXp = BigInt(split.gainedXp);

    const result = await client.query(
      `UPDATE level_members
       SET voice_xp = voice_xp + $3,
           voice_remainder_seconds = $4,
           updated_at = NOW()
       WHERE guild_id = $1 AND user_id = $2
       RETURNING *`,
      [guildId, userId, String(gainedXp), remainder]
    );

    const updated = toMember(result.rows[0]);

    return {
      gainedXp,
      remainderSeconds: remainder,
      totalXpBefore: member.totalXp,
      totalXpAfter: updated.totalXp
    };
  });
}

/** レベルデータのリセット */
export async function resetMember(guildId, userId) {
  await withTransaction(async (client) => {
    await ensureRow(client, guildId, userId);

    await client.query(
      `UPDATE level_members
       SET text_xp = 0,
           voice_xp = 0,
           next_text_xp_at = NULL,
           voice_remainder_seconds = 0,
           updated_at = NOW()
       WHERE guild_id = $1 AND user_id = $2`,
      [guildId, userId]
    );
  });
}
