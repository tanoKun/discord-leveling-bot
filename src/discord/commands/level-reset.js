import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandSubcommandBuilder
} from "discord.js";

import { logger } from "../../logger.js";
import { resetMember } from "../../services/xp-service.js";

export const name = "reset";

export const CONFIRM_TIMEOUT_MS = 30_000;

export const data = new SlashCommandSubcommandBuilder()
  .setName("reset")
  .setDescription("ユーザーのレベルデータをリセットします")
  .addUserOption((option) =>
    option.setName("player").setDescription("リセットするユーザー").setRequired(true)
  );

const CONFIRM_ID = "level-reset:confirm";
const CANCEL_ID = "level-reset:cancel";

function buildComponents(disabled = false) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(CONFIRM_ID)
        .setLabel("リセットする")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(CANCEL_ID)
        .setLabel("キャンセル")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled)
    )
  ];
}

export async function execute(interaction, deps = {}) {
  const { resetMember: reset = resetMember } = deps;
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      content: "このコマンドには「サーバー管理」権限が必要です。",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const target = interaction.options.getUser("player", true);

  if (target.bot) {
    await interaction.reply({
      content: "Botはレベル対象外です。",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  await interaction.reply({
    content: `<@${target.id}> のレベルデータをリセットしますか？`,
    components: buildComponents(),
    allowedMentions: { parse: [] },
    flags: MessageFlags.Ephemeral
  });

  const message = await interaction.fetchReply();

  let confirmation;

  try {
    confirmation = await message.awaitMessageComponent({
      componentType: ComponentType.Button,
      time: CONFIRM_TIMEOUT_MS,
      filter: (component) => component.user.id === interaction.user.id
    });
  } catch {
    await interaction.editReply({
      content: "確認の有効期限が切れました。リセットは行われていません。",
      components: buildComponents(true)
    });
    return;
  }

  if (confirmation.customId === CANCEL_ID) {
    await confirmation.update({
      content: "リセットをキャンセルしました。",
      components: buildComponents(true)
    });
    return;
  }

  await confirmation.deferUpdate();

  await reset(interaction.guildId, target.id);

  // VC滞在中の場合は、この瞬間から新しいセッションとして計測を再開する
  interaction.client.voiceTracker?.resetSession(interaction.guildId, target.id);

  logger.info(
    `level data reset: guild=${interaction.guildId} target=${target.id} by=${interaction.user.id}`
  );

  await interaction.editReply({
    content: `<@${target.id}> のレベルデータをリセットしました。`,
    components: buildComponents(true),
    allowedMentions: { parse: [] }
  });
}
