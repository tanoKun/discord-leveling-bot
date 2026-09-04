import assert from "node:assert/strict";
import { describe, it } from "node:test";

import "./helpers/env.js";

import { isXpEligibleMessage } from "../src/discord/events/message-create.js";
import { totalXpForLevel } from "../src/domain/level-math.js";
import { LEVEL_POLICY } from "../src/domain/level-policy.js";
import { grantTextXp } from "../src/services/xp-service.js";
import { createFakeRepository } from "./helpers/fake-repository.js";

const GUILD = "guild-1";
const USER = "user-1";

function message(overrides = {}) {
  return {
    guildId: GUILD,
    author: { id: USER, bot: false },
    webhookId: null,
    system: false,
    ...overrides
  };
}

describe("text xp eligibility", () => {
  it("accepts a normal guild message", () => {
    assert.equal(isXpEligibleMessage(message()), true);
  });

  it("rejects DMs", () => {
    assert.equal(isXpEligibleMessage(message({ guildId: null })), false);
  });

  it("rejects bots", () => {
    assert.equal(isXpEligibleMessage(message({ author: { id: USER, bot: true } })), false);
  });

  it("rejects webhooks", () => {
    assert.equal(isXpEligibleMessage(message({ webhookId: "123" })), false);
  });

  it("rejects system messages", () => {
    assert.equal(isXpEligibleMessage(message({ system: true })), false);
  });
});

describe("grantTextXp", () => {
  it("grants the configured xp on the first message", async () => {
    const repo = createFakeRepository();

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const now = new Date(attempt * 10 * 60_000);
      const result = await grantTextXp(GUILD, `user-${attempt}`, { now, repo });

      assert.ok(result.gainedXp >= BigInt(LEVEL_POLICY.textXpMin));
      assert.ok(result.gainedXp <= BigInt(LEVEL_POLICY.textXpMax));
    }
  });

  it("gives no xp during cooldown", async () => {
    const repo = createFakeRepository();
    const start = new Date("2026-01-01T14:00:00Z");

    const first = await grantTextXp(GUILD, USER, { now: start, repo });
    assert.ok(first);

    const during = await grantTextXp(GUILD, USER, {
      now: new Date(start.getTime() + 15_000),
      repo
    });

    assert.equal(during, null);
  });

  it("grants again once the cooldown elapsed", async () => {
    const repo = createFakeRepository();
    const start = new Date("2026-01-01T14:00:00Z");

    const first = await grantTextXp(GUILD, USER, { now: start, repo });
    const cooldownEnd = first.nextTextXpAt;

    assert.equal(
      await grantTextXp(GUILD, USER, { now: new Date(cooldownEnd.getTime() - 1000), repo }),
      null
    );

    const second = await grantTextXp(GUILD, USER, { now: cooldownEnd, repo });
    assert.ok(second);
    assert.ok(second.gainedXp > 0n);
  });

  it("does not extend the cooldown when spamming", async () => {
    const repo = createFakeRepository();
    const start = new Date("2026-01-01T14:00:00Z");

    const first = await grantTextXp(GUILD, USER, { now: start, repo });
    const expected = first.nextTextXpAt.getTime();
    const cooldownMs = expected - start.getTime();

    // Cooldownの長さはランダムなので、その窓の内側で連投する
    for (const ratio of [0.25, 0.5, 0.9]) {
      const now = new Date(start.getTime() + Math.floor(cooldownMs * ratio));

      assert.equal(await grantTextXp(GUILD, USER, { now, repo }), null);
    }

    const row = await repo.getMember(GUILD, USER);
    assert.equal(row.nextTextXpAt.getTime(), expected);
    assert.equal(row.textXp, first.gainedXp);
  });

  it("does not double grant on concurrent events", async () => {
    const repo = createFakeRepository();
    const now = new Date("2026-01-01T14:00:00Z");

    const results = await Promise.all([
      grantTextXp(GUILD, USER, { now, repo }),
      grantTextXp(GUILD, USER, { now, repo }),
      grantTextXp(GUILD, USER, { now, repo })
    ]);

    assert.equal(results.filter(Boolean).length, 1);
  });

  it("reports a level up", async () => {
    const repo = createFakeRepository();
    let now = new Date("2026-01-01T14:00:00Z");
    let leveledUp = false;

    // Level 1 に必要な回数ぶん繰り返す(policyの値が変わっても足りるよう余裕を持たせる)
    const attempts = Math.ceil(Number(totalXpForLevel(1)) / LEVEL_POLICY.textXpMin) + 1;

    for (let i = 0; i < attempts; i += 1) {
      const result = await grantTextXp(GUILD, USER, { now, repo });

      if (result?.leveledUp) {
        leveledUp = true;
        assert.equal(result.levelAfter, 1);
        break;
      }

      now = new Date(now.getTime() + 120_000);
    }

    assert.ok(leveledUp, `level 1 should be reached within ${attempts} messages`);
  });
});
