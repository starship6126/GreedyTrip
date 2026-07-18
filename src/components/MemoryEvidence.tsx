import { Minus, Plus } from "lucide-react";
import type { MemoryEvidence as Evidence } from "@/lib/types";

export function MemoryEvidence({ evidence }: { evidence: Evidence[] }) {
  if (!evidence.length) return <p className="empty-evidence">No matching memory evidence yet.</p>;
  return (
    <div className="evidence-list">
      {evidence.slice(0, 4).map((item) => (
        <div className={item.contribution >= 0 ? "evidence-positive" : "evidence-negative"} key={item.memoryId}>
          {item.contribution >= 0 ? <Plus size={13} /> : <Minus size={13} />}
          <span>{item.text}</span>
          <strong>{item.contribution >= 0 ? "+" : ""}{item.contribution.toFixed(2)}</strong>
        </div>
      ))}
    </div>
  );
}
