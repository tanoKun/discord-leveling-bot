-- VCのXPは滞在秒数から算出する方式へ変更する。
-- voice_xp は導出値として保存し続ける(ランキング用インデックスをそのまま使うため)。

ALTER TABLE level_members
    ADD COLUMN IF NOT EXISTS voice_seconds BIGINT NOT NULL DEFAULT 0
        CHECK (voice_seconds >= 0);

-- 旧仕様(300秒ごとに固定XP)で貯まっていた分を滞在秒数へ復元する
UPDATE level_members
SET voice_seconds = (voice_xp / 3) * 300 + COALESCE(voice_remainder_seconds, 0)
WHERE voice_seconds = 0
  AND (voice_xp > 0 OR COALESCE(voice_remainder_seconds, 0) > 0);

-- 秒数をすべて保持するため、端数の持ち越しは不要になる
ALTER TABLE level_members
    DROP COLUMN IF EXISTS voice_remainder_seconds;
