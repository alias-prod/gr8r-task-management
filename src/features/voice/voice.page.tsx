"use client";

import { useCallback, useEffect, useState } from "react";
import { LiveKitRoom, RoomAudioRenderer, StartAudio, useLocalParticipant, useVoiceAssistant } from "@livekit/components-react";
import { Mic, MicOff, PhoneOff, ShieldCheck, Volume2 } from "lucide-react";
import { useWorkspaceData } from "@/store/workspace-store";
import styles from "./voice.module.css";

type Connection = { serverUrl: string; participantToken: string; roomName: string; expiresIn: number };
type Readiness = "loading" | "ready" | "unconfigured" | "error";

export default function VoicePage() {
  const { ws } = useWorkspaceData();
  const [readiness, setReadiness] = useState<Readiness>("loading");
  const [connection, setConnection] = useState<Connection | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/voice/status", { signal: controller.signal, cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("Could not check voice readiness.");
      const data = await response.json();
      setReadiness(data.configured ? "ready" : "unconfigured");
    }).catch((cause) => { if (cause.name !== "AbortError") setReadiness("error"); });
    return () => controller.abort();
  }, []);
  async function start() {
    if (pending || connection) return;
    setError(""); setNotice(""); setPending(true);
    try {
      const response = await fetch("/api/voice/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId: ws.url }), cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not start voice.");
      setConnected(false); setConnection(data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start voice. Please try again."); }
    finally { setPending(false); }
  }
  const end = useCallback((message = "Voice session ended. Your microphone is off.") => { setConnection(null); setConnected(false); setNotice(message); }, []);
  return <section className={styles.page}>
    <header className={styles.header}><div><p className={styles.eyebrow}>WORKSPACE VOICE</p><h1>Talk with ALIAS</h1><p className="lead">A focused conversation in {ws.name}.</p></div><span className={styles.scope}><ShieldCheck size={15} /> Workspace scoped</span></header>
    <div className={styles.panel}>
      <div className={styles.icon}><Volume2 size={25} aria-hidden="true" /></div>
      <h2>{connection ? "Your voice session" : "Make room for a conversation"}</h2>
      <p className={styles.description}>Ask questions, think through a plan, or explain an idea out loud. The assistant cannot access or change workspace tasks yet.</p>
      {connection ? <LiveKitRoom key={connection.roomName} serverUrl={connection.serverUrl} token={connection.participantToken} connect audio video={false} onConnected={() => setConnected(true)} onDisconnected={() => end()} onError={() => { setError("Voice could not connect. Check microphone permission and try again."); end(); }} onMediaDeviceFailure={() => { setError("Microphone access failed. Allow microphone access in your browser and retry."); end(); }}>
        <SessionControls connected={connected} end={end} /><StartAudio className="btn btn-secondary" label="Enable speaker audio" /><RoomAudioRenderer />
      </LiveKitRoom> : <>
        <p className={styles.status} role="status">{readiness === "loading" ? "Checking voice readiness…" : readiness === "unconfigured" ? "Voice is waiting for LiveKit configuration and an agent deployment." : readiness === "error" ? "Voice readiness could not be checked. Reload to retry." : pending ? "Preparing your private voice room…" : "Ready when you are. The microphone starts only after you choose Start."}</p>
        <button className="btn btn-primary btn-lg" disabled={readiness !== "ready" || pending} onClick={start}><Mic size={16} /> {pending ? "Connecting…" : "Start voice session"}</button>
      </>}
      {error ? <p className="err" role="alert">{error}</p> : null}
      {notice ? <p className="hint" role="status">{notice}</p> : null}
    </div>
    <div className={styles.notes}><h2>Private by default</h2><ul><li>Only signed-in workspace members can start a session.</li><li>Audio is processed by LiveKit and the configured AI providers. ALIAS TASK does not record sessions or retain transcripts.</li><li>Each call uses a separate room and ends after ten minutes. You can mute or end it at any time.</li></ul></div>
  </section>;
}

function SessionControls({ connected, end }: { connected: boolean; end: (message?: string) => void }) {
  const { state, agent } = useVoiceAssistant();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const [waiting, setWaiting] = useState(false);
  const [mediaError, setMediaError] = useState("");
  useEffect(() => {
    if (!connected || agent) return;
    const timeout = setTimeout(() => setWaiting(true), 15_000);
    return () => clearTimeout(timeout);
  }, [connected, agent]);
  useEffect(() => {
    if (!connected) return;
    const timeout = setTimeout(() => end("The ten-minute session limit was reached. Your microphone is off."), 10 * 60_000);
    return () => clearTimeout(timeout);
  }, [connected, end]);
  const label = !connected ? "Connecting to LiveKit…" : !agent ? waiting ? "No agent has joined. The named agent may not be deployed or available." : "Waiting for your assistant…" : state === "listening" ? "Listening" : state === "thinking" ? "Thinking" : state === "speaking" ? "Speaking" : "Assistant connected";
  return <div className={styles.session}>
    <p className={styles.status} role="status" aria-live="polite">{label}</p>
    <div className={styles.controls}><button className="btn btn-secondary" disabled={!connected} onClick={async () => { try { await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled); setMediaError(""); } catch { setMediaError("Could not change microphone state. End the session to stop audio."); } }}>{isMicrophoneEnabled ? <MicOff size={16} /> : <Mic size={16} />}{isMicrophoneEnabled ? "Mute" : "Unmute"}</button><button className="btn btn-secondary" onClick={() => end()}><PhoneOff size={16} /> End session</button></div>
    {mediaError ? <p className="err" role="alert">{mediaError}</p> : null}
  </div>;
}
