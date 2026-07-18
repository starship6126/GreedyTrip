import { MessageSquareText } from "lucide-react";
import type { TranscriptEntry } from "@/lib/types";

export function Transcript({ entries }: { entries: TranscriptEntry[] }) {
  return (
    <details className="utility-panel transcript-panel">
      <summary><span><MessageSquareText size={15} /> Trip transcript</span><span>{entries.length} lines</span></summary>
      <div className="transcript-list">
        {entries.length === 0 ? <p>No conversation yet.</p> : entries.slice(-8).map((entry) => (
          <div key={entry.id} className={`transcript-${entry.role}`}><span>{entry.role === "agent" ? "GreedyTrip" : "You"}</span><p>{entry.text}</p></div>
        ))}
      </div>
    </details>
  );
}
