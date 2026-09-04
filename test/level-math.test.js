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
  it("applies the configured multipliers to the ProBot curve", () => {
    // 素の T(L) = floor(32.8739L^2 + 19.3492L) に対し、
    // Lv1〜5 は3倍、Lv10以上は1.5倍、その間は線形補間。
    const base = (level) => Math.floor(32.8739 * level * level + 19.3492 * level);
    const ratio = (level) => Number(totalXpForLevel(level)) / base(level);

    assert.equal(totalXpForLevel(0), 0n);

    for (const level of [1, 2, 3, 4, 5]) {
      assert.ok(Math.abs(ratio(level) - 3) < 0.02, `Lv${level} should be about 3x`);
    }

    for (const level of [10, 20, 50, 100]) {
      assert.ok(Math.abs(ratio(level) - 1.5) < 0.02, `Lv${level} should be about 1.5x`);
    }

    // 補間区間は3倍から1.5倍へ単調に下がる
    assert.ok(ratio(6) < 3 && ratio(6) > ratio(7));
    assert.ok(ratio(7) > ratio(8) && ratio(8) > ratio(9) && ratio(9) > 1.5);
  });

  it("matches the expected thresholds", () => {
    assert.equal(totalXpForLevel(1), 156n);
    assert.equal(totalXpForLevel(5), 2755n);
    assert.equal(totalXpForLevel(10), 5221n);
    assert.equal(totalXpForLevel(20), 20304n);
    assert.equal(totalXpForLevel(100), 496010n);
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
    const level = progress.level;

    assert.ok(level > 0);
    assert.equal(progress.currentLevelXp, 1000n - totalXpForLevel(level));
    assert.equal(progress.requiredLevelXp, totalXpForLevel(level + 1) - totalXpForLevel(level));
  });

  it("reports level 0 for unknown users", () => {
    const progress = levelProgress(0);

    assert.equal(progress.level, 0);
    assert.equal(progress.currentLevelXp, 0n);
    assert.equal(progress.requiredLevelXp, totalXpForLevel(1));
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
    // 1時間のVCで到達するレベルは0のまま(チャットなら数分で入る量)
    assert.equal(levelForTotalXp(voiceXpForSeconds(HOUR)), 0);
  });
});
