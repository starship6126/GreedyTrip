import type { ScoreBreakdown as Breakdown } from "@/lib/types";

const labels: Array<[keyof Breakdown, string, number]> = [
  ["preferenceMatch", "Preference", 30],
  ["accessibility", "Access", 20],
  ["rarity", "Rarity heuristic", 15],
  ["timeRelevance", "Time relevance", 15],
  ["quality", "Quality", 10],
  ["costPenalty", "Cost penalty", 5],
  ["waitRiskPenalty", "Visit-risk heuristic", 10],
];

export function ScoreBreakdown({ breakdown }: { breakdown: Breakdown }) {
  return (
    <div className="score-bars">
      {labels.map(([key, label, max]) => (
        <div className="score-row" key={key}>
          <div><span>{label}</span><strong>{breakdown[key].toFixed(1)}</strong></div>
          <span className="bar-track"><span style={{ width: `${Math.min(100, (breakdown[key] / max) * 100)}%` }} /></span>
        </div>
      ))}
    </div>
  );
}
