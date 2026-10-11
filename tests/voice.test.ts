import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { TokenVerifier } from "livekit-server-sdk";
import { createVoiceConnection, validVoiceOrigin, voiceConfig, VOICE_TOKEN_TTL_SECONDS } from "../src/features/voice/server";
import { AGENT_INSTRUCTIONS, MAX_SESSION_MS, parseVoiceJob } from "../voice-agent/src/contract";

const auth = vi.hoisted(() => ({ fetchAuthQuery: vi.fn(), fetchAuthMutation: vi.fn() }));
vi.mock("@/lib/auth-server", () => auth);
import { POST } from "../src/app/api/voice/token/route";
import { GET } from "../src/app/api/voice/status/route";

const workspaceId = "workspace-one";
const config = { url: "wss://voice.example.livekit.cloud", key: "unit-test-key", secret: "unit-test-secret-that-is-only-for-offline-tests", agentName: "alias-task-voice", dispatchSecret: "offline-dispatch-test-" + "x".repeat(48) };
function request(body: unknown = { workspaceId }, origin = "https://app.example") { return new Request("https://app.example/api/voice/token", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("LIVEKIT_URL", config.url); vi.stubEnv("LIVEKIT_API_KEY", config.key); vi.stubEnv("LIVEKIT_API_SECRET", config.secret); vi.stubEnv("LIVEKIT_AGENT_NAME", config.agentName); vi.stubEnv("LIVEKIT_DISPATCH_SECRET", config.dispatchSecret);
  auth.fetchAuthQuery.mockResolvedValueOnce({ id: "authenticated-user" }).mockResolvedValue({ workspaceId, organizationId: "org-one", role: "member" });
  auth.fetchAuthMutation.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());

describe("voice endpoint boundaries", () => {
  it("rejects wrong origin before auth or reservation", async () => { expect((await POST(request(undefined, "https://evil.example"))).status).toBe(403); expect(auth.fetchAuthQuery).not.toHaveBeenCalled(); expect(auth.fetchAuthMutation).not.toHaveBeenCalled(); });
  it("rejects missing origin and cross-site requests", () => { expect(validVoiceOrigin(new Request("https://app.example/api/voice/token"))).toBe(false); expect(validVoiceOrigin(new Request("https://app.example/api/voice/token", { headers: { origin: "https://app.example", "sec-fetch-site": "cross-site" } }))).toBe(false); });
  it("requires authentication", async () => { auth.fetchAuthQuery.mockReset().mockResolvedValue(null); expect((await POST(request())).status).toBe(401); expect(auth.fetchAuthMutation).not.toHaveBeenCalled(); });
  it("rejects cross-tenant access", async () => { auth.fetchAuthQuery.mockReset().mockResolvedValueOnce({ id: "user" }).mockRejectedValueOnce(new Error("access denied")); expect((await POST(request())).status).toBe(403); expect(auth.fetchAuthMutation).not.toHaveBeenCalled(); });
  it("rejects caller-selected identity or room", async () => { expect((await POST(request({ workspaceId, identity: "victim", room: "other-tenant" }))).status).toBe(400); expect(auth.fetchAuthMutation).not.toHaveBeenCalled(); });
  it("requires complete provider config before reserving", async () => { vi.stubEnv("LIVEKIT_AGENT_NAME", ""); expect((await POST(request())).status).toBe(503); expect(auth.fetchAuthMutation).not.toHaveBeenCalled(); });
  it.each(["", "too-short", " ".repeat(40)])("requires a dedicated valid dispatch proof secret before reservation: %s", async (secret) => { vi.stubEnv("LIVEKIT_DISPATCH_SECRET", secret); const response = await POST(request()); expect(response.status).toBe(503); expect(auth.fetchAuthMutation).not.toHaveBeenCalled(); expect(await response.json()).not.toHaveProperty("participantToken"); });
  it("returns unconfigured status without exposing credentials", async () => { vi.stubEnv("LIVEKIT_API_SECRET", ""); const response = await GET(); expect(response.status).toBe(200); expect(await response.json()).toEqual({ configured: false, capability: "conversation-only", recording: false, persistedTranscripts: false }); });
  it("does not issue tokens after rate reservation denial", async () => { auth.fetchAuthMutation.mockRejectedValue(new Error("rate limit")); const response = await POST(request()); expect(response.status).toBe(429); expect(await response.json()).not.toHaveProperty("participantToken"); });
  it("issues a local join token only after authorization and reservation", async () => { const response = await POST(request()); expect(response.status).toBe(200); expect(auth.fetchAuthMutation).toHaveBeenCalledOnce(); expect(response.headers.get("cache-control")).toBe("no-store"); const data = await response.json(); expect(data.serverUrl).toBe(config.url); const claims = await new TokenVerifier(config.key, config.secret).verify(data.participantToken); expect(claims.sub).not.toBe("authenticated-user"); expect(claims.sub).toMatch(/^user-[a-f0-9]{32}$/); });
});

describe("voice token grants", () => {
  it("uses unique scoped rooms, microphone only and explicit agent dispatch", async () => {
    const connection = await createVoiceConnection(config, "real-user", workspaceId, "org-one");
    const claims = await new TokenVerifier(config.key, config.secret).verify(connection.participantToken);
    expect(claims.video).toMatchObject({ room: connection.roomName, roomJoin: true, canPublishData: false, canUpdateOwnMetadata: false, canSubscribe: true, canPublishSources: ["microphone"] });
    expect(claims.video?.roomAdmin).not.toBe(true); expect(claims.video?.roomRecord).not.toBe(true);
    expect(claims.exp! - claims.nbf!).toBeLessThanOrEqual(VOICE_TOKEN_TTL_SECONDS);
    expect(claims.roomConfig?.agents[0]?.agentName).toBe(config.agentName);
    const metadata = claims.roomConfig?.agents[0]?.metadata;
    expect(metadata).toBeTruthy(); expect(parseVoiceJob(metadata!, connection.roomName, config.dispatchSecret, claims.sub).workspaceId).toBe(workspaceId);
    const second = await createVoiceConnection(config, "real-user", workspaceId, "org-one"); expect(second.roomName).not.toBe(connection.roomName);
  });
  it("fails closed for incomplete or insecure provider URLs", () => { expect(voiceConfig({ LIVEKIT_URL: "http://voice.example", LIVEKIT_API_KEY: "k", LIVEKIT_API_SECRET: "s", LIVEKIT_AGENT_NAME: "n" })).toBeNull(); expect(voiceConfig({})).toBeNull(); });
});

describe("conversation-only worker contract", () => {
  it("requires exact room scope and rejects arbitrary tenant metadata", () => { expect(() => parseVoiceJob("{}", "foreign-room", config.dispatchSecret)).toThrow(); expect(() => parseVoiceJob("not json", "foreign-room", config.dispatchSecret)).toThrow(); });
  it("bounds conversations and explicitly refuses unsupported task actions", () => { expect(MAX_SESSION_MS).toBe(600_000); expect(AGENT_INSTRUCTIONS).toContain("no access to workspace records"); expect(AGENT_INSTRUCTIONS).toContain("Never imply that you performed a workspace action"); expect(AGENT_INSTRUCTIONS).toContain("Never ask for passwords"); });
});
