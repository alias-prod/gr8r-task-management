import { parseVoiceJob, type VoiceJob } from "./contract.js";

// Structural context keeps the app's offline proof tests independent of worker SDK installation.
export type VoiceJobContext = {
  job: { metadata: string; room?: { name: string } };
  room: { name?: string };
  connect(): Promise<void>;
  waitForParticipant(identity: string): Promise<{ identity: string }>;
};

export async function authorizeVoiceJob(ctx: VoiceJobContext, secret: string, nowMs: () => number = Date.now): Promise<VoiceJob> {
  const raw = ctx.job.metadata;
  // Validate app-origin proof before joining RTC or creating any model/session.
  const proof = parseVoiceJob(raw, ctx.job.room?.name ?? "", secret, undefined, nowMs());
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const remainingMs = proof.expiresAt * 1000 - nowMs();
    if (remainingMs <= 0) throw new Error("Voice dispatch proof expired.");
    const expiry = new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("Voice dispatch proof expired.")), remainingMs); });
    const connectedParticipant = (async () => { await ctx.connect(); return await ctx.waitForParticipant(proof.participantIdentity); })();
    const participant = await Promise.race([connectedParticipant, expiry]);
    return parseVoiceJob(raw, ctx.room.name ?? "", secret, participant.identity, nowMs());
  } finally { if (timeout !== undefined) clearTimeout(timeout); }
}
