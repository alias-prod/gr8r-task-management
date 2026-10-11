import { describe, expect, it, vi } from "vitest";
import { parseVoiceJob, signVoiceJob, DISPATCH_PROOF_TTL_SECONDS, validDispatchSecret } from "../voice-agent/src/contract";
import { authorizeVoiceJob, type VoiceJobContext } from "../voice-agent/src/authorize";

const secret = "offline-proof-fixture-" + "a".repeat(48);
const otherSecret = "offline-other-fixture-" + "b".repeat(48);
const now = 1_780_000_000_000;
const scope = { workspaceId: "workspace-one", organizationId: "organization-one", participantIdentity: "user-" + "1".repeat(32), room: "alias-task-" + "2".repeat(32) + "-12345678-1234-1234-1234-123456789abc" };
function proof() { return signVoiceJob(scope, secret, now); }
function parse(raw: string, clock = now) { return parseVoiceJob(raw, scope.room, secret, scope.participantIdentity, clock); }
function context(raw = proof()): VoiceJobContext {
  return { job: { metadata: raw, room: { name: scope.room } }, room: { name: scope.room }, connect: vi.fn().mockResolvedValue(undefined), waitForParticipant: vi.fn().mockResolvedValue({ identity: scope.participantIdentity }) };
}

describe("app-authenticated LiveKit dispatch proof", () => {
  it("accepts only a correctly signed exact scoped dispatch", () => { expect(parse(proof())).toMatchObject({ ...scope, app: "alias-task-voice", version: 2, issuedAt: now / 1000, expiresAt: now / 1000 + DISPATCH_PROOF_TTL_SECONDS }); });
  it("rejects unsigned development-token-server metadata", () => { const unsigned = JSON.parse(proof()); delete unsigned.signature; expect(() => parse(JSON.stringify(unsigned))).toThrow(); expect(() => parse(JSON.stringify({ ...scope, version: 1, capability: "conversation-only" }))).toThrow(); });
  it.each(["room", "workspaceId", "organizationId", "participantIdentity", "issuedAt", "expiresAt", "app", "capability"])("rejects forged %s", (key) => { const payload = JSON.parse(proof()); payload[key] = key === "room" ? scope.room.replace("12345678", "87654321") : key === "participantIdentity" ? "user-" + "9".repeat(32) : typeof payload[key] === "number" ? payload[key] + 1 : key === "workspaceId" ? "workspace-two" : key === "organizationId" ? "organization-two" : "forged"; expect(() => parse(JSON.stringify(payload))).toThrow(); });
  it("rejects a correctly shaped signature made with another key", () => { expect(() => parse(signVoiceJob(scope, otherSecret, now))).toThrow(); });
  it("rejects a forged hex signature without leaking comparison details", () => { const payload = JSON.parse(proof()); payload.signature = "0".repeat(64); expect(() => parse(JSON.stringify(payload))).toThrow("Invalid or expired voice dispatch proof."); });
  it("rejects expired or future-issued proofs", () => { expect(() => parse(proof(), now + DISPATCH_PROOF_TTL_SECONDS * 1000)).toThrow(); expect(() => parse(proof(), now - 6_000)).toThrow(); });
  it("rejects mismatched actual room and participant identity", () => { expect(() => parseVoiceJob(proof(), scope.room + "wrong", secret, scope.participantIdentity, now)).toThrow(); expect(() => parseVoiceJob(proof(), scope.room, secret, "user-" + "3".repeat(32), now)).toThrow(); });
  it("does not reuse the project API secret as a proof key", () => { expect(() => parseVoiceJob(proof(), scope.room, "offline-api-secret-" + "z".repeat(48), scope.participantIdentity, now)).toThrow(); });
  it.each(["", "short", " ".repeat(40)])("requires a dedicated key of at least 32 characters", (value) => { expect(validDispatchSecret(value)).toBe(false); expect(() => signVoiceJob(scope, value, now)).toThrow(); expect(() => parseVoiceJob(proof(), scope.room, value, scope.participantIdentity, now)).toThrow(); });
  it("rejects extra unsigned fields and malformed time types", () => { const payload = JSON.parse(proof()); expect(() => parse(JSON.stringify({ ...payload, instructions: "bypass" }))).toThrow(); expect(() => parse(JSON.stringify({ ...payload, issuedAt: String(payload.issuedAt) }))).toThrow(); expect(() => parse("null")).toThrow(); expect(() => parse("[]")).toThrow(); });
});

describe("worker authorization before session/model construction", () => {
  it("does not connect for unsigned or forged jobs", async () => { const ctx = context("{}"); await expect(authorizeVoiceJob(ctx, secret, () => now)).rejects.toThrow(); expect(ctx.connect).not.toHaveBeenCalled(); expect(ctx.waitForParticipant).not.toHaveBeenCalled(); });
  it("fails closed before connection when proof secret is missing", async () => { const ctx = context(); await expect(authorizeVoiceJob(ctx, "", () => now)).rejects.toThrow(); expect(ctx.connect).not.toHaveBeenCalled(); });
  it("rechecks the exact participant and scope after joining", async () => { const ctx = context(); expect(await authorizeVoiceJob(ctx, secret, () => now)).toMatchObject(scope); expect(ctx.waitForParticipant).toHaveBeenCalledWith(scope.participantIdentity); });
  it("rejects mismatched actual participant before the caller can create models", async () => { const ctx = context(); ctx.waitForParticipant = vi.fn().mockResolvedValue({ identity: "user-" + "9".repeat(32) }); await expect(authorizeVoiceJob(ctx, secret, () => now)).rejects.toThrow(); });
  it("rejects expiry during connection", async () => { const ctx = context(); let clock = now; ctx.connect = vi.fn().mockImplementation(async () => { clock += DISPATCH_PROOF_TTL_SECONDS * 1000; }); await expect(authorizeVoiceJob(ctx, secret, () => clock)).rejects.toThrow(); });
});
