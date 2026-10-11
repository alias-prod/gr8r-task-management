import { api } from "../../../../../convex/_generated/api";
import { fetchAuthQuery } from "@/lib/auth-server";
import { voiceConfig } from "../../../../features/voice/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try { if (!await fetchAuthQuery(api.auth.currentUser, {})) return Response.json({ error: "Sign in to view voice readiness." }, { status: 401, headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Sign in to view voice readiness." }, { status: 401, headers: { "Cache-Control": "no-store" } }); }
  return Response.json({ configured: !!voiceConfig(), capability: "conversation-only", recording: false, persistedTranscripts: false }, { headers: { "Cache-Control": "no-store" } });
}
