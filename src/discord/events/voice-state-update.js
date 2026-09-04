import { Events } from "discord.js";

import { logger } from "../../logger.js";

export const name = Events.VoiceStateUpdate;

export async function execute(oldState, newState) {
  const tracker = newState.client.voiceTracker;

  if (!tracker) {
    return;
  }

  try {
    await tracker.handleVoiceStateUpdate(oldState, newState);
  } catch (error) {
    logger.error("failed to handle voiceStateUpdate", error);
  }
}
