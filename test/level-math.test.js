import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  levelForTotalXp,
  levelProgress,
  totalXpForLevel,
  voiceSecondsForLevel,
  voiceXpForSeconds
} from "../src/domain/level-math.js";
import { LEVEL_POLICY } from "../src/domain/level-policy.js";

const HOUR = 3600;

describe("totalXpForLevel", () => {
  it("matches the spec table", () => {
    assert.equal(totalXpForLevel(0), 0n);
    assert.equal(totalXpForLevel(1), 52n);
    assert.equal(totalXpForLevel(5), 918n);
    assert.equal(totalXpForLevel(10), 3480n);
    assert.equal(totalXpForLevel(20), 13536n);
    assert.equal(totalXpForLevel(50), 83152n);
    assert.equal(totalXpForLevel(100), 330673n);
  });

  it("is strictly increasing", () => {
    for (let level = 0; level < 200; level += 1) {
      assert.ok(totalXpForLevel(level + 1) > totalXpForLevel(level));
    }
  });
});

describe("levelForTotalXp", () => {
  it("returns 0 for no xp", () => {
    assert.equal(levelForTotalXp(0), 0);
    assert.equal(levelForTotalXp(-5), 0);
  });

  it("T(L) - 1 => Level L - 1, T(L) => Level L", () => {
    for (let level = 1; level <= 150; level += 1) {
      const threshold = totalXpForLevel(level);

      assert.equal(levelForTotalXp(threshold - 1n), level - 1);
      assert.equal(levelForTotalXp(threshold), level);
    }
  });

  it("handles very large xp", () => {
    assert.equal(levelForTotalXp(totalXpForLevel(5000)), 5000);
  });
});

describe("levelProgress", () => {
  it("splits current and required xp", () => {
    const progress = levelProgress(1000);

    assert.equal(progress.level, 5);
    assert.equal(progress.currentLevelXp, 1000n - totalXpForLevel(5));
    assert.equal(progress.requiredLevelXp, totalXpForLevel(6) - totalXpForLevel(5));
  });

  it("reports level 0 for unknown users", () => {
    const progress = levelProgress(0);

    assert.equal(progress.level, 0);
    assert.equal(progress.currentLevelXp, 0n);
    assert.equal(progress.requiredLevelXp, 52n);
  });
});

describe("voiceXpForSeconds", () => {
  it("gives no xp without voice time", () => {
    assert.equal(voiceXpForSeconds(0), 0n);
    assert.equal(voiceXpForSeconds(-100), 0n);
  });

  it("reaches level 1 at the configured hours", () => {
    const hours = LEVEL_POLICY.voiceHoursForLevel1;

    assert.equal(levelForTotalXp(voiceXpForSeconds(hours * HOUR)), 1);
    // 序盤は 1時間あたり約2 XP しか入らないため、境界の判定には余裕を持たせる
    assert.equal(levelForTotalXp(voiceXpForSeconds(hours * HOUR - HOUR)), 0);
  });

  it("reaches level 10 at the configured hours", () => {
    const hours = LEVEL_POLICY.voiceHoursForLevel10;

    assert.equal(levelForTotalXp(voiceXpForSeconds(hours * HOUR)), 10);
    assert.equal(levelForTotalXp(voiceXpForSeconds(hours * HOUR - 600)), 9);
  });

  it("matches voiceSecondsForLevel", () => {
    for (const level of [1, 5, 10, 20, 50, 100]) {
      const seconds = voiceSecondsForLevel(level);

      assert.equal(levelForTotalXp(voiceXpForSeconds(seconds)), level);
      assert.equal(levelForTotalXp(voiceXpForSeconds(seconds - 3600)), level - 1);
    }
  });

  it("never decreases as voice time grows", () => {
    let previous = 0n;

    for (let minutes = 0; minutes <= 60 * 400; minutes += 7) {
      const xp = voiceXpForSeconds(minutes * 60);

      assert.ok(xp >= previous, `xp decreased at ${minutes} minutes`);
      previous = xp;
    }
  });

  it("is far slower than chat", () => {
    // 1時間のVCで得られるXPは、チャット1通(15〜25 XP)にも満たない
    assert.ok(voiceXpForSeconds(HOUR) < BigInt(LEVEL_POLICY.textXpMin));
  });
});
