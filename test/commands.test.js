import assert from "node:assert/strict";
import { describe, it } from "node:test";

import "./helpers/env.js";

import { PermissionFlagsBits } from "discord.js";

import * as levelReset from "../src/discord/commands/level-reset.js";
import * as levelShow from "../src/discord/commands/level-show.js";
import { levelProgress } from "../src/domain/level-math.js";
import { getProfile } from "../src/services/xp-service.js";
import { createFakeRepository } from "./helpers/fake-repository.js";

const GUILD = "guild-1";

function createUser(id, { bot = false, username = `user-${id}` } = {}) {
  return {
    id,
    bot,
    username,
    displayName: username,
    displayAvatarURL: () => `https://cdn.example.test/${id}.png`
  };
}

function createShowInteraction({ caller, player = null, playerMember = null }) {
  const state = { deferred: false, replies: [] };

  return {
    state,
    guildId: GUILD,
    user: caller,
    member: {
      displayName: `${caller.username} (nick)`,
      displayAvatarURL: () => `https://cdn.example.test/${caller.id}-guild.png`
    },
    options: {
      getUser: () => player,
      getMember: () => playerMember
    },
    async deferReply() {
      state.deferred = true;
    },
    async editReply(payload) {
      state.replies.push(payload);
      return payload;
    }
  };
}

function profileFor({ textXp = 0n, voiceXp = 0n, rank = null, exists = true } = {}) {
  const totalXp = textXp + voiceXp;

  return {
    member: { textXp, voiceXp, totalXp, exists },
    rank,
    ...levelProgress(totalXp)
  };
}

describe("/level show", () => {
  it("renders a PNG rank card for the caller", async () => {
    const caller = createUser("u1");
    const interaction = createShowInteraction({ caller });

    let renderedWith = null;

    await levelShow.execute(interaction, {
      getProfile: async () => profileFor({ textXp: 3100n, voiceXp: 1100n, rank: 4 }),
      renderRankCard: async (options) => {
        renderedWith = options;
        return Buffer.from("png");
      }
    });

    assert.equal(interaction.state.deferred, true);

    const reply = interaction.state.replies.at(-1);
    assert.equal(reply.files.length, 1);
    assert.equal(reply.files[0].name, "rank-card.png");
    assert.equal(renderedWith.level, 11);
    assert.equal(renderedWith.rank, 4);
    assert.equal(renderedWith.displayName, "user-u1 (nick)");
  });

  it("renders another player when given", async () => {
    const caller = createUser("u1");
    const target = createUser("u2");
    const interaction = createShowInteraction({
      caller,
      player: target,
      playerMember: {
        displayName: "target nick",
        displayAvatarURL: () => "https://cdn.example.test/u2-guild.png"
      }
    });

    const requested = [];

    await levelShow.execute(interaction, {
      getProfile: async (guildId, userId) => {
        requested.push([guildId, userId]);
        return profileFor({ textXp: 100n, rank: 9 });
      },
      renderRankCard: async () => Buffer.from("png")
    });

    assert.deepEqual(requested, [[GUILD, "u2"]]);
  });

  it("shows level 0 for a user without xp", async () => {
    const caller = createUser("u1");
    const interaction = createShowInteraction({ caller });

    await levelShow.execute(interaction, {
      getProfile: async () => profileFor({ exists: false }),
      renderRankCard: async () => {
        throw new Error("canvas unavailable");
      }
    });

    const embed = interaction.state.replies.at(-1).embeds[0].data;

    assert.match(embed.description, /Level 0/);
    assert.match(embed.description, /0 \/ 52 XP/);
    assert.match(embed.description, /Rank -/);
  });

  it("rejects bots", async () => {
    const caller = createUser("u1");
    const bot = createUser("bot-1", { bot: true });
    const interaction = createShowInteraction({ caller, player: bot });

    let rendered = false;

    await levelShow.execute(interaction, {
      getProfile: async () => {
        throw new Error("should not be called");
      },
      renderRankCard: async () => {
        rendered = true;
        return Buffer.from("png");
      }
    });

    assert.equal(interaction.state.replies.at(-1).content, "Botはレベル対象外です。");
    assert.equal(rendered, false);
  });

  it("falls back to an embed when rendering fails", async () => {
    const caller = createUser("u1");
    const interaction = createShowInteraction({ caller });

    await levelShow.execute(interaction, {
      getProfile: async () => profileFor({ textXp: 3100n, voiceXp: 1100n, rank: 4 }),
      renderRankCard: async () => {
        throw new Error("png encode failed");
      }
    });

    const reply = interaction.state.replies.at(-1);
    const embed = reply.embeds[0].data;

    assert.equal(reply.files, undefined);
    assert.match(embed.description, /Level 11/);
    assert.match(embed.description, /Rank #4/);
    assert.deepEqual(
      embed.fields.map((field) => [field.name, field.value]),
      [
        ["Total XP", "4,200"],
        ["Text XP", "3,100"],
        ["Voice XP", "1,100"]
      ]
    );
  });

  it("draws a progress bar", () => {
    assert.equal(levelShow.progressBar(0, 100), "░".repeat(18));
    assert.equal(levelShow.progressBar(100, 100), "█".repeat(18));
    assert.equal(levelShow.progressBar(0, 0), "░".repeat(18));
    assert.equal(levelShow.progressBar(50, 100), `${"█".repeat(9)}${"░".repeat(9)}`);
  });
});

function createResetInteraction({
  caller,
  target,
  canManageGuild = true,
  component = null,
  componentError = null
}) {
  const state = { replies: [], edits: [], filter: null, timeout: null, resetSessions: [] };

  const message = {
    awaitMessageComponent: async ({ filter, time }) => {
      state.filter = filter;
      state.timeout = time;

      if (componentError) {
        throw componentError;
      }

      return component;
    }
  };

  return {
    state,
    guildId: GUILD,
    user: caller,
    client: {
      voiceTracker: {
        resetSession: (guildId, userId) => state.resetSessions.push([guildId, userId])
      }
    },
    memberPermissions: {
      has: (flag) => canManageGuild && flag === PermissionFlagsBits.ManageGuild
    },
    options: {
      getUser: () => target
    },
    async reply(payload) {
      state.replies.push(payload);
      return payload;
    },
    async fetchReply() {
      return message;
    },
    async editReply(payload) {
      state.edits.push(payload);
      return payload;
    }
  };
}

function createButton(customId, userId) {
  const updates = [];

  return {
    customId,
    user: { id: userId },
    updates,
    async update(payload) {
      updates.push(payload);
    },
    async deferUpdate() {
      updates.push("deferUpdate");
    }
  };
}

describe("/level reset", () => {
  it("requires Manage Server", async () => {
    const caller = createUser("u1");
    const target = createUser("u2");
    const interaction = createResetInteraction({ caller, target, canManageGuild: false });

    let resetCalls = 0;

    await levelReset.execute(interaction, {
      resetMember: async () => {
        resetCalls += 1;
      }
    });

    assert.match(interaction.state.replies[0].content, /サーバー管理/);
    assert.equal(resetCalls, 0);
  });

  it("asks for confirmation before resetting", async () => {
    const caller = createUser("u1");
    const target = createUser("u2");
    const interaction = createResetInteraction({
      caller,
      target,
      component: createButton("level-reset:cancel", "u1")
    });

    let resetCalls = 0;

    await levelReset.execute(interaction, {
      resetMember: async () => {
        resetCalls += 1;
      }
    });

    assert.match(interaction.state.replies[0].content, /リセットしますか/);
    assert.equal(interaction.state.replies[0].components.length, 1);
    assert.equal(resetCalls, 0);
  });

  it("only accepts the invoker's button press", async () => {
    const caller = createUser("u1");
    const target = createUser("u2");
    const interaction = createResetInteraction({
      caller,
      target,
      component: createButton("level-reset:confirm", "u1")
    });

    await levelReset.execute(interaction, { resetMember: async () => {} });

    assert.equal(interaction.state.filter({ user: { id: "u1" } }), true);
    assert.equal(interaction.state.filter({ user: { id: "someone-else" } }), false);
  });

  it("expires after 30 seconds", async () => {
    const caller = createUser("u1");
    const target = createUser("u2");
    const interaction = createResetInteraction({
      caller,
      target,
      componentError: new Error("collector timed out")
    });

    let resetCalls = 0;

    await levelReset.execute(interaction, {
      resetMember: async () => {
        resetCalls += 1;
      }
    });

    assert.equal(interaction.state.timeout, 30_000);
    assert.equal(levelReset.CONFIRM_TIMEOUT_MS, 30_000);
    assert.match(interaction.state.edits.at(-1).content, /有効期限/);
    assert.equal(resetCalls, 0);
  });

  it("resets xp, cooldown and voice remainder on confirmation", async () => {
    const caller = createUser("u1");
    const target = createUser("u2");
    const repo = createFakeRepository();

    await repo.grantTextXp(GUILD, target.id, { xp: 100, cooldownSeconds: 60 });
    await repo.addVoiceSeconds(GUILD, target.id, 400);

    const interaction = createResetInteraction({
      caller,
      target,
      component: createButton("level-reset:confirm", "u1")
    });

    await levelReset.execute(interaction, {
      resetMember: (guildId, userId) => repo.resetMember(guildId, userId)
    });

    const member = await repo.getMember(GUILD, target.id);

    assert.equal(member.textXp, 0n);
    assert.equal(member.voiceXp, 0n);
    assert.equal(member.nextTextXpAt, null);
    assert.equal(member.voiceRemainderSeconds, 0);
    assert.deepEqual(interaction.state.resetSessions, [[GUILD, target.id]]);
    assert.match(interaction.state.edits.at(-1).content, /リセットしました/);
  });

  it("rejects bots", async () => {
    const caller = createUser("u1");
    const bot = createUser("bot-1", { bot: true });
    const interaction = createResetInteraction({ caller, target: bot });

    let resetCalls = 0;

    await levelReset.execute(interaction, {
      resetMember: async () => {
        resetCalls += 1;
      }
    });

    assert.equal(interaction.state.replies[0].content, "Botはレベル対象外です。");
    assert.equal(resetCalls, 0);
  });
});

describe("getProfile", () => {
  it("returns level 0 and no rank for unknown users", async () => {
    const repo = createFakeRepository();
    const profile = await getProfile(GUILD, "unknown", { repo });

    assert.equal(profile.level, 0);
    assert.equal(profile.rank, null);
    assert.equal(profile.currentLevelXp, 0n);
    assert.equal(profile.requiredLevelXp, 52n);
  });

  it("ranks members by total xp", async () => {
    const repo = createFakeRepository();

    await repo.addVoiceSeconds(GUILD, "low", 300);
    await repo.addVoiceSeconds(GUILD, "high", 3000);

    assert.equal((await getProfile(GUILD, "high", { repo })).rank, 1);
    assert.equal((await getProfile(GUILD, "low", { repo })).rank, 2);
  });
});
