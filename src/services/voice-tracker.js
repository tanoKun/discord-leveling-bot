import { LEVEL_POLICY } from "../domain/level-policy.js";
import { logger } from "../logger.js";
import * as xpService from "./xp-service.js";

export const CHECKPOINT_INTERVAL_MS = 30_000;

function sessionKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function humanCount(channel) {
  let count = 0;

  for (const member of channel.members.values()) {
    if (!member.user?.bot) {
      count += 1;
    }
  }

  return count;
}

/**
 * VC XPの対象条件:
 * 1. Botではない
 * 2. AFKチャンネルではない
 * 3. Deafではない(self / server どちらも不可)
 * 4. 同じVCにBot以外が2人以上
 */
export function isEligibleVoiceState(voiceState) {
  const channel = voiceState?.channel;

  if (!channel) {
    return false;
  }

  if (voiceState.member?.user?.bot) {
    return false;
  }

  if (channel.guild?.afkChannelId && channel.id === channel.guild.afkChannelId) {
    return false;
  }

  if (voiceState.deaf || voiceState.selfDeaf || voiceState.serverDeaf) {
    return false;
  }

  return humanCount(channel) >= 2;
}

export class VoiceTracker {
  #sessions = new Map();
  #timer = null;
  #ticking = false;

  constructor({
    onLevelUp = null,
    xp = xpService,
    intervalMs = CHECKPOINT_INTERVAL_MS,
    now = () => Date.now()
  } = {}) {
    this.onLevelUp = onLevelUp;
    this.xp = xp;
    this.intervalMs = intervalMs;
    this.now = now;
  }

  get sessions() {
    return this.#sessions;
  }

  start() {
    if (this.#timer) {
      return;
    }

    this.#timer = setInterval(() => {
      // 実行中に次のTimerが来た場合は重複実行しない
      if (this.#ticking) {
        return;
      }

      this.#ticking = true;

      this.checkpointAll()
        .catch((error) => logger.error("voice checkpoint failed", error))
        .finally(() => {
          this.#ticking = false;
        });
    }, this.intervalMs);
  }

  async stop() {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }

    await this.flushAll();
  }

  /** Bot起動時に既存のVC状態を取り込む */
  async syncGuild(guild) {
    const states = guild.voiceStates?.cache;

    if (!states) {
      return;
    }

    for (const voiceState of states.values()) {
      await this.syncVoiceState(voiceState);
    }
  }

  /** voiceStateUpdate の処理 */
  async handleVoiceStateUpdate(oldState, newState) {
    await this.syncVoiceState(newState);

    // 人数変化により、同じVCにいる他ユーザーのEligibilityも変わる
    const channels = new Set();

    if (oldState?.channel) {
      channels.add(oldState.channel);
    }

    if (newState?.channel) {
      channels.add(newState.channel);
    }

    for (const channel of channels) {
      for (const member of channel.members.values()) {
        if (member.id === newState.id) {
          continue;
        }

        await this.syncVoiceState(member.voice);
      }
    }
  }

  /** 単一ユーザーの状態を反映する */
  async syncVoiceState(voiceState) {
    if (!voiceState?.guild || !voiceState.id) {
      return;
    }

    const guildId = voiceState.guild.id;
    const userId = voiceState.id;
    const key = sessionKey(guildId, userId);
    const session = this.#sessions.get(key);
    const eligible = isEligibleVoiceState(voiceState);

    if (!eligible) {
      if (session) {
        await this.#checkpoint(session);
        await this.#flush(session, { force: true });
        this.#sessions.delete(key);
      }

      return;
    }

    if (!session) {
      this.#sessions.set(key, {
        guildId,
        userId,
        channelId: voiceState.channelId,
        accumulatedSeconds: 0,
        lastCheckpointAt: this.now(),
        flushing: false
      });

      return;
    }

    if (session.channelId !== voiceState.channelId) {
      // VC移動: 移動前までの時間は確定させる
      await this.#checkpoint(session);
      session.channelId = voiceState.channelId;
    }

    await this.#checkpoint(session);
    await this.#flush(session);
  }

  /** リセット時。その瞬間から新しいセッションとして計測を再開する */
  resetSession(guildId, userId) {
    const session = this.#sessions.get(sessionKey(guildId, userId));

    if (!session) {
      return;
    }

    session.accumulatedSeconds = 0;
    session.lastCheckpointAt = this.now();
  }

  async checkpointAll() {
    for (const session of [...this.#sessions.values()]) {
      await this.#checkpoint(session);
      await this.#flush(session);
    }
  }

  async flushAll() {
    for (const session of [...this.#sessions.values()]) {
      await this.#checkpoint(session);
      await this.#flush(session, { force: true });
    }
  }

  #checkpoint(session) {
    const now = this.now();
    const elapsed = Math.floor((now - session.lastCheckpointAt) / 1000);

    if (elapsed <= 0) {
      return;
    }

    session.accumulatedSeconds += elapsed;
    // 秒未満の端数は次回へ持ち越す
    session.lastCheckpointAt += elapsed * 1000;
  }

  async #flush(session, { force = false } = {}) {
    if (session.flushing) {
      return;
    }

    const enough = session.accumulatedSeconds >= LEVEL_POLICY.voiceTickSeconds;

    if (!enough && !(force && session.accumulatedSeconds > 0)) {
      return;
    }

    const seconds = session.accumulatedSeconds;
    session.accumulatedSeconds = 0;
    session.flushing = true;

    try {
      const result = await this.xp.addVoiceSeconds(session.guildId, session.userId, seconds);

      if (result?.leveledUp && this.onLevelUp) {
        await this.onLevelUp({
          guildId: session.guildId,
          userId: session.userId,
          level: result.levelAfter
        });
      }
    } catch (error) {
      // 失敗した秒数は戻して次回に再試行する
      session.accumulatedSeconds += seconds;
      logger.error("failed to persist voice xp", error);
    } finally {
      session.flushing = false;
    }
  }
}
