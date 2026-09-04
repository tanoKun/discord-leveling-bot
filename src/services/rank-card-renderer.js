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

/** 秒数を "12h 30m" のような表記にする */
export function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);

  return hours > 0 ? `${formatNumber(hours)}h ${minutes}m` : `${minutes}m`;
}

function drawTrack(ctx, x, y, width, height, ratio) {
  ctx.fillStyle = COLORS.track;
  roundedRect(ctx, x, y, width, height, height / 2);
  ctx.fill();

  if (ratio <= 0) {
    return;
  }

  const fillWidth = Math.max(height, width * ratio);
  const gradient = ctx.createLinearGradient(x, y, x + fillWidth, y);
  gradient.addColorStop(0, COLORS.accent);
  gradient.addColorStop(1, COLORS.accentSoft);

  ctx.fillStyle = gradient;
  roundedRect(ctx, x, y, fillWidth, height, height / 2);
  ctx.fill();
}

/**
 * 1種類分(テキスト or VC)の行を描画する。
 */
function drawSection(ctx, { label, note, progress, x, y, width }) {
  const { level, currentLevelXp, requiredLevelXp, rank } = progress;

  const required = Number(requiredLevelXp);
  const current = Number(currentLevelXp);
  const ratio = required > 0 ? Math.min(1, Math.max(0, current / required)) : 0;

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  ctx.font = font(22, "700");
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(label, x, y);

  ctx.font = font(30, "700");
  ctx.fillStyle = COLORS.text;
  ctx.fillText(`LEVEL ${formatNumber(level)}`, x + 90, y + 2);

  if (note) {
    ctx.font = font(20, "600");
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(note, x + 240, y);
  }

  ctx.textAlign = "right";
  ctx.font = font(24, "700");
  ctx.fillStyle = COLORS.accentSoft;
  ctx.fillText(rank === null || rank === undefined ? "#-" : `#${formatNumber(rank)}`, x + width, y);

  drawTrack(ctx, x, y + 16, width, 20, ratio);

  ctx.textAlign = "right";
  ctx.font = font(20, "600");
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(
    `${formatNumber(currentLevelXp)} / ${formatNumber(requiredLevelXp)} XP`,
    x + width,
    y + 54
  );
}

/**
 * ランクカードPNGを生成する。
 * テキストとVCのレベルをそれぞれ表示する。
 * 失敗した場合は例外を投げる(呼び出し側でEmbedへフォールバックする)。
 */
export async function renderRankCard({ displayName, avatarUrl, text, voice }) {
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
  const avatarSize = 140;
  const avatarX = 52;
  const avatarY = 56;

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

  const contentX = avatarX + avatarSize + 36;
  const contentRight = CARD_WIDTH - 52;
  const contentWidth = contentRight - contentX;

  // 表示名
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = font(38, "700");
  ctx.fillStyle = COLORS.text;
  ctx.fillText(fitText(ctx, displayName, contentWidth), contentX, 72);

  drawSection(ctx, {
    label: "TEXT",
    note: `${formatNumber(text.xp)} XP`,
    progress: text,
    x: contentX,
    y: 124,
    width: contentWidth
  });

  drawSection(ctx, {
    label: "VOICE",
    note: formatDuration(voice.seconds),
    progress: voice,
    x: contentX,
    y: 214,
    width: contentWidth
  });

  return canvas.encode("png");
}
