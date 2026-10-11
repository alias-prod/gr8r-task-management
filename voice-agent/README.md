# ALIAS TASK voice agent

A separate, named LiveKit Agents worker. It is not a Vercel function and is **not deployed** by building the Next.js app. This scaffold uses LiveKit Inference's STT/LLM/TTS pipeline, not the separate GPT-Live provider adapter being developed for ALIAS elsewhere.

## Required setup

1. Use an ALIAS-owned LiveKit project and an approved inference/spend allocation.
2. Set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_AGENT_NAME`, and `LIVEKIT_DISPATCH_SECRET` in the Next.js **server** environment. Do not prefix secrets with `NEXT_PUBLIC_`.
3. Set the matching URL, dispatch name, and dedicated `LIVEKIT_DISPATCH_SECRET` in the worker's environment. The dispatch secret must be independently generated with at least 32 characters, shared only by this app server and its worker. Do not reuse the project API secret; Cloud may inject different API credentials into a worker. The default intended dispatch name is `alias-task-voice`, but neither app nor worker silently invents a name when it is missing.
4. Install with `npm ci` inside this directory, then `npm run build` and `npm run typecheck`.
5. For local development, copy `.env.example` to `.env.local`, populate it securely, then run `npm run dev`. This connects a worker to the Cloud project and makes voice calls potentially billable. Do not run it without approval/readiness checks.
6. For production, deploy this directory as a long-running Node >=24 worker or a LiveKit Cloud agent. With approved provisioning and a linked LiveKit CLI, `lk agent create` creates/deploys an agent. This is intentionally not done automatically. Set its environment securely, use the same dispatch name, and run `npm run start` after build.

## Scope and privacy

The web endpoint authenticates the current user, checks authoritative workspace membership and reserves a shared rate-limited session before minting a two-minute, microphone-only join token. Room names are opaque workspace-scoped hashes plus a fresh random identifier. Participant identity is derived from the authenticated user, not client input. The token explicitly dispatches the named worker on first connection.

The worker requires a timing-safe HMAC-authenticated app dispatch proof over the exact room, participant identity, workspace/organization scope, issue/expiry time, app/version and capability. Proofs expire after two minutes. It verifies the signature before joining RTC or constructing any inference/model session, then validates the actual joined room and participant again before model creation. Unsigned, forged, expired or mismatched jobs fail closed. The project's public development token server cannot mint this app-specific proof. The worker validates the server-generated job scope and provides **conversation only**. It has no workspace API token or backend tools, and cannot read/change tasks. Adding tools requires a separately authorized, tenant-bound capability and must not trust an arbitrary workspace ID in a prompt. The session is bounded to ten minutes. There is no app recording or transcript persistence; audio still goes to LiveKit and the configured inference providers, whose project-level retention policies must be reviewed separately. LiveKit refreshes connected participants' tokens; short initial token TTL alone does not terminate ongoing calls.

## Verification

`tests/voice.test.ts` in the app checks origin/auth/tenant gates, missing provider configuration, reservation denial, token grants and worker metadata boundaries without making paid model calls. The worker is independently type-checked against its locked SDK version. An end-to-end audio/inference test remains required after approved deployment.

Verified API sources (2026-10-11):
- https://docs.livekit.io/frontends/authentication/tokens/
- https://docs.livekit.io/agents/server/agent-dispatch/
- https://docs.livekit.io/agents/start/voice-ai-quickstart/
- https://docs.livekit.io/reference/components/react/component/livekitroom/
- https://docs.livekit.io/reference/components/react/hook/usevoiceassistant/

## Hosting checkpoint

The verified ALIAS-owned Agent ALIAS project (`p_4nw25ch3o3o`) currently has two deployed agents and a Ship plan limit of two. Hosting this new named worker remains blocked pending an approved hosting/capacity decision. Do not replace either unrelated worker, use HAUS/Scanquote projects, upgrade the plan, or disable the project-wide development token server as part of this app integration. A valid proof can be replayed against its identical signed room/participant during its short validity window; this mechanism authenticates gateway issuance but does not claim distributed exactly-once dispatch.
