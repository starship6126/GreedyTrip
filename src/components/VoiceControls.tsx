"use client";

import { FormEvent, useState } from "react";
import { ArrowUp, Mic, MicOff } from "lucide-react";
import type { VoiceState } from "@/hooks/useVoiceAgent";

export function VoiceControls({
  status,
  supported,
  active,
  interim,
  disabled,
  onToggle,
  onSubmit,
}: {
  status: VoiceState;
  supported: boolean;
  active: boolean;
  interim: string;
  disabled?: boolean;
  onToggle: () => void;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!value.trim() || disabled) return;
    onSubmit(value.trim());
    setValue("");
  };
  return (
    <div className="voice-controls">
      {interim && <div className="interim">“{interim}”</div>}
      <form onSubmit={submit} className="text-control">
        <button type="button" onClick={onToggle} className={`mic-button ${active ? "is-active" : ""}`} aria-label={active ? "Pause microphone" : "Start microphone"} disabled={!supported}>
          {supported && active ? <Mic size={19} /> : <MicOff size={19} />}
        </button>
        <input value={value} onChange={(event) => setValue(event.target.value)} placeholder={status === "thinking" ? "Recalculating…" : "Say or type what you want…"} aria-label="Message the GreedyTrip agent" disabled={disabled} />
        <button type="submit" className="send-button" disabled={!value.trim() || disabled} aria-label="Submit message"><ArrowUp size={18} /></button>
      </form>
    </div>
  );
}
