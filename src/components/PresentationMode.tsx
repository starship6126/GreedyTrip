import { Image as ImageIcon, MapPin, Mic2, Play, RotateCcw, Siren, Volume2 } from "lucide-react";

const stages = ["Interview", "Initial commit", "Learn", "Silent recompute", "Intervention", "Visual detail"];

export function PresentationMode({
  stage,
  onReset,
  onStart,
  onTouristy,
  onMove,
  onUnavailable,
  onVisuals,
  onReplay,
  silenceReason,
  touristyDisabled = false,
  movementDisabled = false,
  unavailableDisabled = false,
}: {
  stage: number;
  onReset: () => void;
  onStart: () => void;
  onTouristy: () => void;
  onMove: (index: number) => void;
  onUnavailable: () => void;
  onVisuals: () => void;
  onReplay: () => void;
  silenceReason?: string;
  touristyDisabled?: boolean;
  movementDisabled?: boolean;
  unavailableDisabled?: boolean;
}) {
  return (
    <details className="presentation-mode">
      <summary><span><Mic2 size={15} /> Presentation mode</span><small>Reliable simulated controls</small></summary>
      <div className="presentation-body">
        <div className="stage-track">{stages.map((label, index) => <div key={label} className={stage === index + 1 ? "is-active" : stage > index + 1 ? "is-done" : ""}><span>{index + 1}</span><small>{label}</small></div>)}</div>
        {stage === 4 && silenceReason && <p><strong>Intelligent silence:</strong> {silenceReason}</p>}
        <p>Controls below create clearly labeled <strong>Simulated demo events</strong>. Voice and normal input still work.</p>
        <div className="presentation-controls">
          <button type="button" onClick={onReset}><RotateCcw size={14} /> Reset demo</button>
          <button type="button" onClick={onStart}><Play size={14} /> Start interview</button>
          <button type="button" onClick={onTouristy} disabled={touristyDisabled}><Mic2 size={14} /> Submit “too touristy”</button>
          <button type="button" onClick={() => onMove(0)} disabled={movementDisabled}><MapPin size={14} /> Powell Street</button>
          <button type="button" onClick={() => onMove(1)} disabled={movementDisabled}><MapPin size={14} /> Yerba Buena</button>
          <button type="button" onClick={() => onMove(2)} disabled={movementDisabled}><MapPin size={14} /> Union Square</button>
          <button type="button" onClick={onUnavailable} disabled={unavailableDisabled}><Siren size={14} /> Mark current unavailable</button>
          <button type="button" onClick={onVisuals}><ImageIcon size={14} /> Open map & photos</button>
          <button type="button" onClick={onReplay}><Volume2 size={14} /> Replay latest line</button>
        </div>
      </div>
    </details>
  );
}
