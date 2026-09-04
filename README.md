# Discord Level Bot

ProBot風のテンポでレベルが上がる、軽量なDiscord Level Bot。
テキストとボイスはそれぞれ独立したレベルとして扱う。

- チャットXP(8 XP / 30〜70秒のCooldown)
- VC滞在XP(チャットとは別のレベル・別の式。VCのみで Level 1 に約10時間、Level 10 に約150時間)
- ProBot風レベルカーブ `T(L) = floor(32.8739 * L^2 + 19.3492 * L)`
- `/level show [player]` — PNGランクカードにテキスト/ボイス両方のレベルとランクを表示(失敗時はEmbedへフォールバック)
- `/level reset <player>` — Manage Server 権限 + 30秒の確認ボタン
- レベルアップ通知

## 必要なもの

- Node.js 24
- PostgreSQL
- Discord Bot Token

Gateway Intents は `Guilds` / `GuildMessages` / `GuildVoiceStates` のみ。
`MessageContent` などの特権Intentは不要(メッセージ本文はXP判定に使わない)。

## セットアップ

```bash
npm install
cp .env.example .env   # 値を埋める
npm run register       # スラッシュコマンド登録
npm start
```

`DISCORD_DEV_GUILD_ID` を設定すると、そのギルドにのみ即時反映でコマンドを登録する(カンマ区切りで複数指定可)。
未設定の場合はグローバル登録(反映に時間がかかる)。

マイグレーションは起動時に自動適用される(`migrations/*.sql`)。

## 環境変数

| 変数 | 必須 | 説明 |
|---|---|---|
| `DISCORD_TOKEN` | ✓ | Bot Token |
| `DISCORD_APPLICATION_ID` | | Application ID（`npm run register` にのみ必要） |
| `DISCORD_DEV_GUILD_ID` | | コマンド登録先のギルドID(カンマ区切りで複数可) |
| `DATABASE_URL` | ✓ | PostgreSQL接続URL |
| `LEVEL_UP_NOTIFY` | | レベルアップ通知(既定 `true`) |
| `LEVEL_UP_CHANNEL_ID` | | VC XPのレベルアップ通知先 |
| `PORT` | | ヘルスチェック用HTTPポート(既定 `8080`) |
| `LOG_LEVEL` | | `debug` / `info` / `warn` / `error` |

## テスト

```bash
npm test
```

PostgreSQLに対する統合テストは `TEST_DATABASE_URL` を設定した場合のみ実行される。

```bash
docker run -d --name levelbot-pg -e POSTGRES_PASSWORD=test -e POSTGRES_DB=levelbot -p 55432:5432 postgres:17-alpine
TEST_DATABASE_URL=postgres://postgres:test@localhost:55432/levelbot npm test
```

## Northflank へのデプロイ

1. PostgreSQL アドオンを作成する
2. このリポジトリを連携し、Dockerfile からビルドする Service を作成する
3. Instances は **1** のまま(複数プロセスは想定していない)
4. `DISCORD_TOKEN` と `DATABASE_URL` をSecretとして登録する
5. ヘルスチェックは `GET /`(`PORT`)

## XP調整

XPに関する値は [`src/domain/level-policy.js`](src/domain/level-policy.js) に集約している。
ProBotの挙動に寄せる場合もこのファイルだけを変更すればよい。
