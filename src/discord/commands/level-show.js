import {
  AttachmentBuilder,
  EmbedBuilder,
  SlashCommandSubcommandBuilder
} from "discord.js";

import { logger } from "../../logger.js";
import { formatDuration, renderRankCard } from "../../services/rank-card-renderer.js";
import { getProfile } from "../../services/xp-service.js";

export const name = "show";

export const data = new SlashCommandSubcommandBuilder()
  .setName("show")
  .setDescription("レベルを表示します")
  .addUserOption((option) =>
    option.setName("player").setDescription("表示するユーザー(省略時は自分)").setRequired(false)
  );

const BAR_LENGTH = 18;

export function progressBar(currentLevelXp, requiredLevelXp) {
  const required = Number(requiredLevelXp);
  const current = Number(currentLevelXp);
  const ratio = required > 0 ? Math.min(1, Math.max(0, current / required)) : 0;
  const filled = Math.round(ratio * BAR_LENGTH);

  return "█".repeat(filled) + "░".repeat(BAR_LENGTH - filled);
}

function formatNumber(value) {
  return Number(value).toLocaleString("en-US");
}

export function buildFallbackEmbed({ displayName, avatarUrl, profile }) {
  const line = ({ level, currentLevelXp, requiredLevelXp, rank }) =>
    [
      `**Level ${formatNumber(level)}** ・ Rank ${rank === null ? "-" : `#${formatNumber(rank)}`}`,
      progressBar(currentLevelXp, requiredLevelXp),
      `${formatNumber(currentLevelXp)} / ${formatNumber(requiredLevelXp)} XP`
    ].join("\n");

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({ name: displayName, iconURL: avatarUrl })
    .addFields(
      { name: "テキスト", value: line(profile.text), inline: true },
      {
        name: "ボイス",
        value: `${line(profile.voice)}\n滞在 ${formatDuration(profile.voice.seconds)}`,
        inline: true
      }
    );
}

export async function execute(interaction, deps = {}) {
  const { getProfile: loadProfile = getProfile, renderRankCard: renderCard = renderRankCard } = deps;
  await interaction.deferReply();

  const target = interaction.options.getUser("player") ?? interaction.user;

  if (target.bot) {
    await interaction.editReply({ content: "Botはレベル対象外です。" });
    return;
  }

  const targetMember =
    interaction.options.getMember("player") ??
    (interaction.options.getUser("player") ? null : interaction.member);

  const displayName = targetMember?.displayName ?? target.displayName ?? target.username;
  const avatarUrl =
    targetMember?.displayAvatarURL?.({ extension: "png", size: 256 }) ??
    target.displayAvatarURL({ extension: "png", size: 256 });

  const profile = await loadProfile(interaction.guildId, target.id);

  try {
    const png = await renderCard({
      displayName,
      avatarUrl,
      text: profile.text,
      voice: profile.voice
    });

    const attachment = new AttachmentBuilder(png, { name: "rank-card.png" });

    await interaction.editReply({ files: [attachment] });
  } catch (error) {
    // Avatar取得 / Canvas / Font / PNG生成 / Attachment のいずれかで失敗
    logger.warn("rank card rendering failed, falling back to embed", error);

    await interaction.editReply({
      embeds: [buildFallbackEmbed({ displayName, avatarUrl, profile })]
    });
  }
}
