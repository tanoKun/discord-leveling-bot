/**
 * XPに関する調整値はこのファイルへ集約する。
 * ProBotの挙動に寄せる場合もここだけを変更すればよい。
 */
export const LEVEL_POLICY = Object.freeze({
  id: "probot-like-v1",

  textXpMin: 8,
  textXpMax: 8,

  textCooldownMinSeconds: 30,
  textCooldownMaxSeconds: 70,

  // VC滞在をDBへ書き込む単位(この秒数たまるごとに確定させる)
  voiceTickSeconds: 300,

  // VCのXPはチャットとは別の式で求める。
  // 「VCだけで Level 1 / Level 10 に到達するのに必要な時間」を目安として指定し、
  // そこから滞在秒数 -> XP の変換式を導出する。
  voiceHoursForLevel1: 10,
  voiceHoursForLevel10: 150
});
