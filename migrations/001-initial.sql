CREATE TABLE IF NOT EXISTS level_members (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,

    text_xp BIGINT NOT NULL DEFAULT 0
        CHECK (text_xp >= 0),

    voice_xp BIGINT NOT NULL DEFAULT 0
        CHECK (voice_xp >= 0),

    next_text_xp_at TIMESTAMPTZ,

    voice_remainder_seconds INTEGER NOT NULL DEFAULT 0
        CHECK (
            voice_remainder_seconds >= 0
            AND voice_remainder_seconds < 300
        ),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (
        guild_id,
        user_id
    )
);

CREATE INDEX IF NOT EXISTS level_members_rank_idx
ON level_members (
    guild_id,
    ((text_xp + voice_xp)) DESC
);
