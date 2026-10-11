import { createHmac, randomUUID } from "node:crypto";
import { AccessToken, RoomAgentDispatch, RoomConfiguration, TrackSource } from "livekit-server-sdk";

import { signVoiceJob, validDispatchSecret } from "../../../voice-agent/src/contract";

export const VOICE_TOKEN_TTL_SECONDS = 120;
export type VoiceConfig = { url: string; key: string; secret: string; agentName: string; dispatchSecret: string };

export function voiceConfig(env: Partial<NodeJS.ProcessEnv> = process.env): VoiceConfig | null {
  const url = env.LIVEKIT_URL?.trim();
  const key = env.LIVEKIT_API_KEY?.trim();
  const secret = env.LIVEKIT_API_SECRET?.trim();
  const agentName = env.LIVEKIT_AGENT_NAME?.trim();
  const dispatchSecret = env.LIVEKIT_DISPATCH_SECRET;
  if (!url || !key || !secret || !agentName || !validDispatchSecret(dispatchSecret)) return null;
  try { const parsed = new URL(url); if (parsed.protocol !== "wss:" || parsed.username || parsed.password) return null; } catch { return null; }
  return { url, key, secret, agentName, dispatchSecret };
}

export function validVoiceOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !!origin && origin === new URL(request.url).origin && request.headers.get("sec-fetch-site") !== "cross-site";
}

function opaque(config: VoiceConfig, value: string) {
  return createHmac("sha256", config.secret).update(value).digest("hex").slice(0, 32);
}

// Verified against https://docs.livekit.io/frontends/authentication/tokens/
// and https://docs.livekit.io/agents/server/agent-dispatch/ on 2026-10-11.
export async function createVoiceConnection(config: VoiceConfig, userId: string, workspaceId: string, organizationId: string | null) {
  const room = `alias-task-${opaque(config, `workspace:${workspaceId}`)}-${randomUUID()}`;
  const identity = `user-${opaque(config, `user:${userId}`)}`;
  const accessToken = new AccessToken(config.key, config.secret, { identity, ttl: VOICE_TOKEN_TTL_SECONDS });
  accessToken.addGrant({ room, roomJoin: true, canPublish: true, canPublishSources: [TrackSource.MICROPHONE], canSubscribe: true, canPublishData: false, canUpdateOwnMetadata: false });
  accessToken.roomConfig = new RoomConfiguration({
    maxParticipants: 2, emptyTimeout: 30, departureTimeout: 15,
    agents: [new RoomAgentDispatch({ agentName: config.agentName, metadata: signVoiceJob({ workspaceId, organizationId, participantIdentity: identity, room }, config.dispatchSecret) })],
  });
  return { serverUrl: config.url, participantToken: await accessToken.toJwt(), roomName: room, expiresIn: VOICE_TOKEN_TTL_SECONDS, capability: "conversation-only" as const };
}
