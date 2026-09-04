import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import "./helpers/env.js";

/**
 * 実際のPostgreSQLに対する統合テスト。
 * TEST_DATABASE_URL が設定されている場合のみ実行する。
 *
 *   TEST_DATABASE_URL=postgres://postgres:test@localhost:55432/levelbot npm test
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe("member-repository (postgres)", { skip: TEST_DATABASE_URL ? false : "TEST_DATABASE_URL is not set" }, () => {
  const GUILD = "guild-int";

  let pool;
  let repo;

  before(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;

    const db = await import("../src/db/pool.js");
    pool = db.pool;

    await db.runMigrations();

    repo = await import("../src/db/member-repository.js");
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM level_members WHERE guild_id = $1", [GUILD]);
  });

  after(async () => {
    await pool.end();
  });

  it("creates the row on first grant", async () => {
    const now = new Date("2026-01-01T14:00:00Z");
    const result = await repo.grantTextXp(GUILD, "u1", { xp: 21, cooldownSeconds: 60, now });

    assert.equal(result.gainedXp, 21n);
    assert.equal(result.totalXpAfter, 21n);

    const member = await repo.getMember(GUILD, "u1");
    assert.equal(member.textXp, 21n);
    assert.equal(member.nextTextXpAt.toISOString(), "2026-01-01T14:01:00.000Z");
  });

  it("blocks grants during the cooldown without extending it", async () => {
    const now = new Date("2026-01-01T14:00:00Z");

    await repo.grantTextXp(GUILD, "u1", { xp: 20, cooldownSeconds: 60, now });

    const blocked = await repo.grantTextXp(GUILD, "u1", {
      xp: 20,
      cooldownSeconds: 60,
      now: new Date("2026-01-01T14:00:30Z")
    });

    assert.equal(blocked, null);

    const member = await repo.getMember(GUILD, "u1");
    assert.equal(member.textXp, 20n);
    assert.equal(member.nextTextXpAt.toISOString(), "2026-01-01T14:01:00.000Z");

    const after = await repo.grantTextXp(GUILD, "u1", {
      xp: 20,
      cooldownSeconds: 60,
      now: new Date("2026-01-01T14:01:00Z")
    });

    assert.ok(after);
    assert.equal(after.totalXpAfter, 40n);
  });

  it("does not double grant on concurrent messages", async () => {
    const now = new Date("2026-01-01T14:00:00Z");

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        repo.grantTextXp(GUILD, "u1", { xp: 20, cooldownSeconds: 60, now })
      )
    );

    assert.equal(results.filter(Boolean).length, 1);
    assert.equal((await repo.getMember(GUILD, "u1")).textXp, 20n);
  });

  it("converts voice seconds into ticks and keeps the remainder", async () => {
    assert.equal((await repo.addVoiceSeconds(GUILD, "u1", 299)).gainedXp, 0n);
    assert.equal((await repo.getMember(GUILD, "u1")).voiceRemainderSeconds, 299);

    assert.equal((await repo.addVoiceSeconds(GUILD, "u1", 1)).gainedXp, 10n);
    assert.equal((await repo.getMember(GUILD, "u1")).voiceRemainderSeconds, 0);

    assert.equal((await repo.addVoiceSeconds(GUILD, "u1", 601)).gainedXp, 20n);

    const member = await repo.getMember(GUILD, "u1");
    assert.equal(member.voiceXp, 30n);
    assert.equal(member.voiceRemainderSeconds, 1);
  });

  it("ranks by total xp", async () => {
    await repo.addVoiceSeconds(GUILD, "low", 300);
    await repo.addVoiceSeconds(GUILD, "high", 3000);

    assert.equal(await repo.getRank(GUILD, "high"), 1);
    assert.equal(await repo.getRank(GUILD, "low"), 2);
    assert.equal(await repo.getRank(GUILD, "missing"), null);
  });

  it("resets every stored value", async () => {
    await repo.grantTextXp(GUILD, "u1", { xp: 20, cooldownSeconds: 60 });
    await repo.addVoiceSeconds(GUILD, "u1", 400);

    await repo.resetMember(GUILD, "u1");

    const member = await repo.getMember(GUILD, "u1");

    assert.equal(member.textXp, 0n);
    assert.equal(member.voiceXp, 0n);
    assert.equal(member.nextTextXpAt, null);
    assert.equal(member.voiceRemainderSeconds, 0);
  });

  it("keeps xp per guild", async () => {
    await repo.addVoiceSeconds(GUILD, "u1", 300);
    await repo.addVoiceSeconds("guild-other", "u1", 900);

    assert.equal((await repo.getMember(GUILD, "u1")).voiceXp, 10n);
    assert.equal((await repo.getMember("guild-other", "u1")).voiceXp, 30n);

    await pool.query("DELETE FROM level_members WHERE guild_id = $1", ["guild-other"]);
  });
});
