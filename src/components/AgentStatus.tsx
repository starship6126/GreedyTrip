import { AudioLines, BrainCircuit, Mic, Pause, Sparkles, Volume2 } from "lucide-react";
import type { VoiceState } from "@/hooks/useVoiceAgent";

const labels: Record<VoiceState, string> = {
  idle: "Ready",
  listening: "Listening",
  thinking: "Recalculating",
  speaking: "Speaking",
  paused: "Paused",
  error: "Text fallback ready",
};

export function AgentStatus({ status, agentLine, userLine }: { status: VoiceState; agentLine: string; userLine?: string }) {
  const Icon = status === "listening" ? Mic : status === "thinking" ? BrainCircuit : status === "speaking" ? Volume2 : status === "paused" ? Pause : Sparkles;
  return (
    <section className="agent-stage" aria-live="polite">
      <div className={`voice-orb is-${status}`} aria-hidden="true">
        <div className="orb-core"><AudioLines size={30} strokeWidth={1.7} /></div>
        <span className="orb-ring ring-one" />
        <span className="orb-ring ring-two" />
      </div>
      <div className="agent-copy">
        <div className="status-kicker"><Icon size={14} /> {labels[status]}</div>
        <h1>{agentLine}</h1>
        <p className="heard-line">{userLine ? <><span>You</span> “{userLine}”</> : "I’ll ask four quick questions, then choose one strong next move."}</p>
      </div>
    </section>
  );
}
