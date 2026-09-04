import assert from "node:assert/strict";
import { describe, it } from "node:test";

import "./helpers/env.js";

import { voiceSecondsForLevel } from "../src/domain/level-math.js";
import { addVoiceSeconds } from "../src/services/xp-service.js";
import { VoiceTracker, isEligibleVoiceState } from "../src/services/voice-tracker.js";
import { levelForTotalXp } from "../src/domain/level-math.js";
import { createChannel, createGuild, joinChannel, leaveChannel } from "./helpers/fake-discord.js";
import { createFakeRepository } from "./helpers/fake-repository.js";

function createXpStub(repo) {
  return {
    addVoiceSeconds: (guildId, userId, seconds) =>
      addVoiceSeconds(guildId, userId, seconds, { repo })
  };
}

function createClock(start = 0) {
  const clock = { value: start };

  return {
    now: () => clock.value,
    advanceSeconds(seconds) {
      clock.value += seconds * 1000;
    }
  };
}

describe("voice eligibility", () => {
  it("gives no xp when alone in a voice channel", () => {
    const channel = createChannel();
    const alone = joinChannel(channel, { id: "u1" });

    assert.equal(isEligibleVoiceState(alone), false);
  });

  it("gives no xp for human + bot", () => {
    const channel = createChannel();
    const human = joinChannel(channel, { id: "u1" });
    joinChannel(channel, { id: "bot", bot: true });

    assert.equal(isEligibleVoiceState(human), false);
  });

  it("gives xp for two humans", () => {
    const channel = createChannel();
    const first = joinChannel(channel, { id: "u1" });
    const second = joinChannel(channel, { id: "u2" });

    assert.equal(isEligibleVoiceState(first), true);
    assert.equal(isEligibleVoiceState(second), true);
  });

  it("gives no xp to a deafened user", () => {
    const channel = createChannel();
    const deafened = joinChannel(channel, { id: "u1", deaf: true });
    joinChannel(channel, { id: "u2" });

    assert.equal(isEligibleVoiceState(deafened), false);
  });

  it("gives no xp to a server deafened user", () => {
    const channel = createChannel();
    const target = joinChannel(channel, { id: "u1" });
    joinChannel(channel, { id: "u2" });
    target.serverDeaf = true;

    assert.equal(isEligibleVoiceState(target), false);
  });

  it("gives xp to a muted (not deafened) user", () => {
    const channel = createChannel();
    const muted = joinChannel(channel, { id: "u1", mute: true });
    joinChannel(channel, { id: "u2" });

    assert.equal(isEligibleVoiceState(muted), true);
  });

  it("gives no xp in the AFK channel", () => {
    const guild = createGuild({ afkChannelId: "afk" });
    const channel = createChannel({ id: "afk", guild });
    const first = joinChannel(channel, { id: "u1" });
    joinChannel(channel, { id: "u2" });

    assert.equal(isEligibleVoiceState(first), false);
  });

  it("gives no xp when not connected", () => {
    assert.equal(isEligibleVoiceState({ id: "u1", channel: null }), false);
  });
});

describe("VoiceTracker", () => {
  function setup() {
    const repo = createFakeRepository();
    const clock = createClock();
    const levelUps = [];

    const tracker = new VoiceTracker({
      xp: createXpStub(repo),
      now: clock.now,
      onLevelUp: (event) => levelUps.push(event)
    });

    return { repo, clock, tracker, levelUps };
  }

  async function joinPair(tracker) {
    const channel = createChannel();
    const first = joinChannel(channel, { id: "u1" });
    const second = joinChannel(channel, { id: "u2" });

    await tracker.syncVoiceState(first);
    await tracker.syncVoiceState(second);

    return { channel, first, second };
  }

  it("stores voice seconds even below the write threshold", async () => {
    const { repo, clock, tracker } = setup();
    await joinPair(tracker);

    clock.advanceSeconds(299);
    await tracker.checkpointAll();

    // 書き込み単位に満たないうちはDBへ確定させない
    assert.equal(await repo.getMember("guild-1", "u1"), null);

    clock.advanceSeconds(1);
    await tracker.checkpointAll();

    assert.equal((await repo.getMember("guild-1", "u1")).voiceSeconds, 300);
  });

  it("converts accumulated seconds into xp with the voice formula", async () => {
    const { repo, clock, tracker } = setup();
    await joinPair(tracker);

    const secondsForLevel1 = voiceSecondsForLevel(1);

    clock.advanceSeconds(secondsForLevel1);
    await tracker.checkpointAll();

    const member = await repo.getMember("guild-1", "u1");

    assert.equal(member.voiceSeconds, secondsForLevel1);
    assert.equal(levelForTotalXp(member.totalXp), 1);
  });

  it("keeps counting across checkpoints", async () => {
    const { repo, clock, tracker } = setup();
    await joinPair(tracker);

    for (let i = 0; i < 120; i += 1) {
      clock.advanceSeconds(30);
      await tracker.checkpointAll();
    }

    assert.equal((await repo.getMember("guild-1", "u1")).voiceSeconds, 3600);
  });

  it("does not accumulate while alone", async () => {
    const { repo, clock, tracker } = setup();
    const channel = createChannel();
    const alone = joinChannel(channel, { id: "u1" });

    await tracker.syncVoiceState(alone);
    clock.advanceSeconds(600);
    await tracker.checkpointAll();

    assert.equal(tracker.sessions.size, 0);
    assert.equal(await repo.getMember("guild-1", "u1"), null);
  });

  it("stops accumulating when the other user leaves", async () => {
    const { repo, clock, tracker } = setup();
    const { channel, second } = await joinPair(tracker);

    clock.advanceSeconds(120);

    const left = leaveChannel(channel, second);
    await tracker.handleVoiceStateUpdate(second, left);

    // 滞在していた分は保存され、以降は積算されない
    assert.equal(tracker.sessions.size, 0);
    assert.equal((await repo.getMember("guild-1", "u1")).voiceSeconds, 120);

    clock.advanceSeconds(600);
    await tracker.checkpointAll();

    assert.equal((await repo.getMember("guild-1", "u1")).voiceSeconds, 120);
  });

  it("notifies once when several levels are passed", async () => {
    const { clock, tracker, levelUps } = setup();
    await joinPair(tracker);

    clock.advanceSeconds(voiceSecondsForLevel(3));
    await tracker.checkpointAll();

    // 複数レベルを一度に通過しても、ユーザーごとの通知は1回
    const forUser = levelUps.filter((event) => event.userId === "u1");

    assert.equal(forUser.length, 1);
    assert.ok(forUser[0].level > 1);
  });

  it("restarts measurement after a reset", async () => {
    const { repo, clock, tracker } = setup();
    await joinPair(tracker);

    clock.advanceSeconds(299);
    tracker.resetSession("guild-1", "u1");

    clock.advanceSeconds(1);
    await tracker.checkpointAll();

    // リセット前の299秒は破棄され、計測が最初からやり直しになる
    assert.equal(await repo.getMember("guild-1", "u1"), null);
  });

  it("flushes pending seconds on shutdown", async () => {
    const { repo, clock, tracker } = setup();
    await joinPair(tracker);

    clock.advanceSeconds(90);
    await tracker.stop();

    assert.equal((await repo.getMember("guild-1", "u1")).voiceSeconds, 90);
  });
});
