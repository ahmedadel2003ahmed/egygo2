import pkg from "agora-token";
const { RtcTokenBuilder, RtcRole } = pkg;

/**
 * Build Agora RTC token for video/audio call
 * @param {String} channelName - Channel name
 * @param {Number} uid - User ID (integer)
 * @param {Number} expirySeconds - Token expiry time in seconds
 * @returns {String} Agora RTC token
 */
export const buildRtcToken = (channelName, uid, expirySeconds = 3600) => {
  const AGORA_APP_ID = process.env.AGORA_APP_ID || "";
  const AGORA_APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE || "";

  if (!AGORA_APP_ID || !AGORA_APP_CERTIFICATE) {
    throw new Error(
      "Agora App ID and Certificate must be configured in environment variables"
    );
  }

  const role = RtcRole.PUBLISHER; // Allow both publishing and subscribing

  // Calculate privilege expiry timestamp
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const privilegeExpiredTs = currentTimestamp + expirySeconds;

  // Build token
  const token = RtcTokenBuilder.buildTokenWithUid(
    AGORA_APP_ID,
    AGORA_APP_CERTIFICATE,
    channelName,
    uid,
    role,
    privilegeExpiredTs
  );

  return token;
};

/**
 * Get Agora App ID (safe to expose to clients)
 */
export const getAgoraAppId = () => {
  const appId = process.env.AGORA_APP_ID || "";
  console.log("getAgoraAppId called:", { appId, hasValue: !!appId });
  return appId;
};
