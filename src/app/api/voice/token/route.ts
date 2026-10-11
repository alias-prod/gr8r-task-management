import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { fetchAuthMutation, fetchAuthQuery } from "@/lib/auth-server";
import { createVoiceConnection, validVoiceOrigin, voiceConfig } from "../../../../features/voice/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "Pragma": "no-cache" };

export async function POST(request: Request) {
  if (!validVoiceOrigin(request)) return Response.json({ error: "Request origin is not allowed." }, { status: 403, headers });
  let user;
  try { user = await fetchAuthQuery(api.auth.currentUser, {}); } catch { user = null; }
  if (!user) return Response.json({ error: "Sign in to start a voice session." }, { status: 401, headers });
  if (Number(request.headers.get("content-length") ?? 0) > 4096) return Response.json({ error: "Invalid request." }, { status: 400, headers });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request." }, { status: 400, headers }); }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => key !== "workspaceId") || typeof (body as { workspaceId?: unknown }).workspaceId !== "string" || (!(body as { workspaceId: string }).workspaceId.trim() || (body as { workspaceId: string }).workspaceId.length > 128)) return Response.json({ error: "A workspace ID is required." }, { status: 400, headers });
  const workspaceId = (body as { workspaceId: string }).workspaceId as Id<"workspaces">;
  let access;
  try { access = await fetchAuthQuery(api.workspaces.getAccess, { workspaceId }); } catch { return Response.json({ error: "Workspace access denied." }, { status: 403, headers }); }
  if (!access || access.workspaceId !== workspaceId) return Response.json({ error: "Workspace access denied." }, { status: 403, headers });
  const config = voiceConfig();
  if (!config) return Response.json({ error: "Voice is not configured yet. Ask an administrator to connect LiveKit, configure the app dispatch proof, and deploy the named agent.", code: "VOICE_NOT_CONFIGURED" }, { status: 503, headers });
  try { await fetchAuthMutation(api.workspaces.reserveVoiceSession, { workspaceId }); }
  catch { return Response.json({ error: "Voice session limit reached. Please try again later." }, { status: 429, headers }); }
  try { return Response.json(await createVoiceConnection(config, user.id, workspaceId, access.organizationId), { headers }); }
  catch { return Response.json({ error: "Could not prepare the voice session. Please try again." }, { status: 503, headers }); }
}
