export default function (data, session) {
  data.sub_type = session.subtype;

  if (session.userId) {
    data.user_id = parseInt(session.userId);
  }

  if (session.guildId) {
    data.guild_id = parseInt(session.guildId);
  }

  if (session.channelId) {
    data.channel_id = parseInt(session.channelId);
  }

  if (session.targetId) {
    data.target_id = parseInt(session.targetId);
  }

  if (session.operatorId) {
    data.operator_id = parseInt(session.operatorId);
  }

  if (session.messageId) {
    data.message_id = parseInt(session.messageId);
  }
}