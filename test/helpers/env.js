// テストでは実際のDiscord/DBへ接続しないが、config の検証を通す必要がある。
process.env.DISCORD_TOKEN ??= "test-token";
process.env.DISCORD_APPLICATION_ID ??= "100000000000000000";
process.env.DATABASE_URL ??= "postgres://localhost:5432/test";
process.env.LEVEL_UP_NOTIFY ??= "true";
process.env.LOG_LEVEL ??= "error";
