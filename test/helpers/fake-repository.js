import { splitVoiceSeconds } from "../../src/domain/level-math.js";

/**
 * member-repository と同じ契約を持つインメモリ実装。
 * FOR UPDATE 相当の直列化も再現する。
 */
export function createFakeRepository() {
  const rows = new Map();
  let queue = Promise.resolve();

  const key = (guildId, userId) => `${guildId}:${userId}`;

  function ensure(guildId, userId) {
    const id = key(guildId, userId);

    if (!rows.has(id)) {
      rows.set(id, {
        guildId,
        userId,
        textXp: 0n,
        voiceXp: 0n,
        nextTextXpAt: null,
        voiceRemainderSeconds: 0
      });
    }

    return rows.get(id);
  }

  // 同一行に対する更新を直列化する(SELECT ... FOR UPDATE 相当)
  function serialize(fn) {
    const result = queue.then(fn);
    queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  const repo = {
    rows,

    emptyMember(guildId, userId) {
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
    },

    async getMember(guildId, userId) {
      const row = rows.get(key(guildId, userId));

      if (!row) {
        return null;
      }

      return { ...row, totalXp: row.textXp + row.voiceXp, exists: true };
    },

    async getRank(guildId, userId) {
      const row = rows.get(key(guildId, userId));

      if (!row) {
        return null;
      }

      const total = row.textXp + row.voiceXp;
      let rank = 1;

      for (const other of rows.values()) {
        if (other.guildId === guildId && other.textXp + other.voiceXp > total) {
          rank += 1;
        }
      }

      return rank;
    },

    async grantTextXp(guildId, userId, { xp, cooldownSeconds, now = new Date() }) {
      return serialize(async () => {
        const row = ensure(guildId, userId);

        if (row.nextTextXpAt && row.nextTextXpAt.getTime() > now.getTime()) {
          return null;
        }

        const totalXpBefore = row.textXp + row.voiceXp;

        row.textXp += BigInt(xp);
        row.nextTextXpAt = new Date(now.getTime() + cooldownSeconds * 1000);

        return {
          gainedXp: BigInt(xp),
          totalXpBefore,
          totalXpAfter: row.textXp + row.voiceXp,
          nextTextXpAt: row.nextTextXpAt
        };
      });
    },

    async addVoiceSeconds(guildId, userId, seconds) {
      return serialize(async () => {
        const row = ensure(guildId, userId);
        const totalXpBefore = row.textXp + row.voiceXp;

        const split = splitVoiceSeconds(row.voiceRemainderSeconds, seconds);

        row.voiceXp += BigInt(split.gainedXp);
        row.voiceRemainderSeconds = split.remainderSeconds;

        return {
          gainedXp: BigInt(split.gainedXp),
          remainderSeconds: split.remainderSeconds,
          totalXpBefore,
          totalXpAfter: row.textXp + row.voiceXp
        };
      });
    },

    async resetMember(guildId, userId) {
      return serialize(async () => {
        const row = ensure(guildId, userId);

        row.textXp = 0n;
        row.voiceXp = 0n;
        row.nextTextXpAt = null;
        row.voiceRemainderSeconds = 0;
      });
    }
  };

  return repo;
}
