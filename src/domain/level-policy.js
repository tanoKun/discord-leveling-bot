/**
 * XPに関する調整値はこのファイルへ集約する。
 * ProBotの挙動に寄せる場合もここだけを変更すればよい。
 */
export const LEVEL_POLICY = Object.freeze({
  id: "probot-like-v1",

  textXpMin: 15,
  textXpMax: 25,

  textCooldownMinSeconds: 55,
  textCooldownMaxSeconds: 75,

  voiceTickSeconds: 300,
  voiceXpPerTick: 5
});
