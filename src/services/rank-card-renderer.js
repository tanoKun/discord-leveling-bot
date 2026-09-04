import { createCanvas, loadImage } from "@napi-rs/canvas";

export const CARD_WIDTH = 960;
export const CARD_HEIGHT = 300;

const FONT_STACK = '"Noto Sans CJK JP", "Noto Sans JP", "Noto Sans", sans-serif';
const AVATAR_FETCH_TIMEOUT_MS = 5000;

const COLORS = {
  backgroundTop: "#1b1f2a",
  backgroundBottom: "#11141c",
  panel: "#232838",
  accent: "#5865f2",
  accentSoft: "#7d87ff",
  text: "#ffffff",
  muted: "#a3adc2",
  track: "#3a4155"
};

function font(size, weight = "600") {
  return `${weight} ${size}px ${FONT_STACK}`;
}

function formatNumber(value) {
  return Number(value).toLocaleString("en-US");
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }

  let truncated = text;

  while (truncated.length > 1 && ctx.measureText(`${truncated}…`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }

  return `${truncated}…`;
}

async function fetchAvatar(avatarUrl) {
  const response = await fetch(avatarUrl, {
    signal: AbortSignal.timeout(AVATAR_FETCH_TIMEOUT_MS)
  });

  if (!response.ok) {
    throw new Error(`avatar fetch failed: ${response.status}`);
  }

  return loadImage(Buffer.from(await response.arrayBuffer()));
}

/**
 * ランクカードPNGを生成する。
 * 失敗した場合は例外を投げる(呼び出し側でEmbedへフォールバックする)。
 */
export async function renderRankCard({
  displayName,
  avatarUrl,
  level,
  rank,
  currentLevelXp,
  requiredLevelXp,
  totalXp,
  textXp,
  voiceXp
}) {
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");

  // 背景
  const background = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  background.addColorStop(0, COLORS.backgroundTop);
  background.addColorStop(1, COLORS.backgroundBottom);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  ctx.fillStyle = COLORS.panel;
  roundedRect(ctx, 16, 16, CARD_WIDTH - 32, CARD_HEIGHT - 32, 28);
  ctx.fill();

  // アバター
  const avatarSize = 160;
  const avatarX = 56;
  const avatarY = (CARD_HEIGHT - avatarSize) / 2;

  const avatar = await fetchAvatar(avatarUrl);

  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
  ctx.restore();

  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 3, 0, Math.PI * 2);
  ctx.stroke();

  const contentX = avatarX + avatarSize + 40;
  const contentRight = CARD_WIDTH - 56;

  // ランク(右上)
  const rankText = rank === null || rank === undefined ? "RANK -" : `RANK #${formatNumber(rank)}`;
  ctx.font = font(34, "700");
  ctx.fillStyle = COLORS.accentSoft;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(rankText, contentRight, 78);
  const rankWidth = ctx.measureText(rankText).width;

  // 表示名
  ctx.textAlign = "left";
  ctx.font = font(40, "700");
  ctx.fillStyle = COLORS.text;
  ctx.fillText(fitText(ctx, displayName, contentRight - rankWidth - 24 - contentX), contentX, 78);

  // レベル
  ctx.font = font(30, "700");
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(`LEVEL ${formatNumber(level)}`, contentX, 128);

  // 進捗バー
  const barX = contentX;
  const barY = 150;
  const barWidth = contentRight - contentX;
  const barHeight = 26;

  const required = Number(requiredLevelXp);
  const current = Number(currentLevelXp);
  const ratio = required > 0 ? Math.min(1, Math.max(0, current / required)) : 0;

  ctx.fillStyle = COLORS.track;
  roundedRect(ctx, barX, barY, barWidth, barHeight, barHeight / 2);
  ctx.fill();

  if (ratio > 0) {
    const fillWidth = Math.max(barHeight, barWidth * ratio);
    const gradient = ctx.createLinearGradient(barX, barY, barX + fillWidth, barY);
    gradient.addColorStop(0, COLORS.accent);
    gradient.addColorStop(1, COLORS.accentSoft);

    ctx.fillStyle = gradient;
    roundedRect(ctx, barX, barY, fillWidth, barHeight, barHeight / 2);
    ctx.fill();
  }

  ctx.font = font(24, "600");
  ctx.fillStyle = COLORS.muted;
  ctx.textAlign = "right";
  ctx.fillText(
    `${formatNumber(currentLevelXp)} / ${formatNumber(requiredLevelXp)} XP`,
    contentRight,
    barY + barHeight + 34
  );

  ctx.textAlign = "left";
  ctx.fillStyle = COLORS.text;
  ctx.font = font(26, "700");
  ctx.fillText(`TOTAL ${formatNumber(totalXp)} XP`, contentX, barY + barHeight + 34);

  ctx.fillStyle = COLORS.muted;
  ctx.font = font(22, "600");
  ctx.fillText(
    `TEXT ${formatNumber(textXp)} / VOICE ${formatNumber(voiceXp)}`,
    contentX,
    barY + barHeight + 70
  );

  return canvas.encode("png");
}
