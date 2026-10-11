// SDK APIs verified on 2026-10-11 against the official voice quickstart:
// https://docs.livekit.io/agents/start/voice-ai-quickstart/
// Named dispatch: https://docs.livekit.io/agents/server/agent-dispatch/
import { type JobContext, ServerOptions, cli, defineAgent, inference, voice } from "@livekit/agents";
import { fileURLToPath } from "node:url";
import { AGENT_INSTRUCTIONS, MAX_SESSION_MS, validDispatchSecret } from "./contract.js";

import { authorizeVoiceJob } from "./authorize.js";

export default defineAgent({
  entry: async (ctx: JobContext) => {
    try { await authorizeVoiceJob(ctx, process.env.LIVEKIT_DISPATCH_SECRET ?? ""); }
    catch { ctx.shutdown("Invalid voice session scope"); return; }
    const session = new voice.AgentSession({
      stt: new inference.STT({ model: "assemblyai/universal-3-6-pro", language: "en" }),
      llm: new inference.LLM({ model: "google/gemma-4-31b-it" }),
      tts: new inference.TTS({ model: "fishaudio/s2.1-pro", voice: "fa4c9eb3dccc4806b382b40d61c6b10a" }),
      turnHandling: { turnDetection: new inference.TurnDetector() },
    });
    const deadline = setTimeout(() => ctx.shutdown("Voice session time limit reached"), MAX_SESSION_MS);
    deadline.unref();
    ctx.addShutdownCallback(async () => { clearTimeout(deadline); await session.close(); });
    await session.start({ agent: voice.Agent.create({ instructions: AGENT_INSTRUCTIONS }), room: ctx.room, record: false });
    session.generateReply({ instructions: "Greet the user briefly. Explain that this session can discuss ideas but cannot read or modify workspace tasks." });
  },
});

if (!validDispatchSecret(process.env.LIVEKIT_DISPATCH_SECRET)) throw new Error("LIVEKIT_DISPATCH_SECRET must be a dedicated server/worker secret of at least 32 characters.");
const agentName = process.env.LIVEKIT_AGENT_NAME?.trim();
if (!agentName) throw new Error("LIVEKIT_AGENT_NAME must match the app's explicitly configured dispatch name.");
cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url), agentName }));
