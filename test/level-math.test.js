import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  levelForTotalXp,
  levelProgress,
  splitVoiceSeconds,
  totalXpForLevel
} from "../src/domain/level-math.js";

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

describe("splitVoiceSeconds", () => {
  it("299 seconds => 0 xp", () => {
    assert.deepEqual(splitVoiceSeconds(0, 299), {
      ticks: 0,
      gainedXp: 0,
      remainderSeconds: 299
    });
  });

  it("300 seconds => 10 xp", () => {
    assert.deepEqual(splitVoiceSeconds(0, 300), {
      ticks: 1,
      gainedXp: 10,
      remainderSeconds: 0
    });
  });

  it("601 seconds => 20 xp with remainder 1", () => {
    assert.deepEqual(splitVoiceSeconds(0, 601), {
      ticks: 2,
      gainedXp: 20,
      remainderSeconds: 1
    });
  });

  it("keeps the stored remainder", () => {
    assert.deepEqual(splitVoiceSeconds(299, 1), {
      ticks: 1,
      gainedXp: 10,
      remainderSeconds: 0
    });
  });
});
