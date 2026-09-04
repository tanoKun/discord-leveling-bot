-- テキストとVCでレベルを分けたため、ランキングもそれぞれで引く。

CREATE INDEX IF NOT EXISTS level_members_text_rank_idx
ON level_members (guild_id, text_xp DESC);

CREATE INDEX IF NOT EXISTS level_members_voice_rank_idx
ON level_members (guild_id, voice_xp DESC);

DROP INDEX IF EXISTS level_members_rank_idx;
