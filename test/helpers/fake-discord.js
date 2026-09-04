/** VC関連のテスト用ダミーオブジェクト */
export function createGuild({ id = "guild-1", afkChannelId = null } = {}) {
  return { id, afkChannelId };
}

export function createChannel({ id = "vc-1", guild = createGuild() } = {}) {
  const members = new Map();

  return {
    id,
    guild,
    members: {
      values: () => members.values(),
      set: (userId, member) => members.set(userId, member),
      delete: (userId) => members.delete(userId)
    },
    _members: members
  };
}

export function joinChannel(channel, { id, bot = false, deaf = false, mute = false }) {
  const voiceState = {
    id,
    guild: channel.guild,
    channelId: channel.id,
    channel,
    deaf,
    selfDeaf: deaf,
    serverDeaf: false,
    mute,
    selfMute: mute,
    member: { id, user: { id, bot }, voice: null }
  };

  voiceState.member.voice = voiceState;
  channel._members.set(id, voiceState.member);

  return voiceState;
}

export function leaveChannel(channel, voiceState) {
  channel._members.delete(voiceState.id);

  return {
    ...voiceState,
    channelId: null,
    channel: null
  };
}
