import type { CandidateUtility } from "@/lib/types";

const dimensions: Array<[keyof CandidateUtility, string, number, boolean]> = [
  ["memoryFit", "Memory fit", 30, false],
  ["rightNowOpportunity", "Right-now opportunity", 12, false],
  ["serendipity", "Serendipity", 12, false],
  ["localCharacter", "Local character", 8, false],
  ["accessibility", "Accessibility", 15, false],
  ["quality", "Quality", 8, false],
  ["travelFriction", "Travel friction", 10, true],
  ["costPenalty", "Cost friction", 5, true],
  ["crowdRiskPenalty", "Crowd-risk heuristic", 8, true],
  ["repetitionPenalty", "Repetition penalty", 6, true],
];

export function UtilityBreakdown({ utility }: { utility: CandidateUtility }) {
  return (
    <div className="utility-bars">
      {dimensions.map(([key, label, max, negative]) => {
        const value = utility[key];
        if (typeof value !== "number") return null;
        return (
          <div className={`utility-row ${negative ? "is-negative" : ""}`} key={key}>
            <div><span>{label}</span><strong>{negative && value > 0 ? "−" : ""}{value.toFixed(1)}</strong></div>
            <span className="bar-track"><span style={{ width: `${Math.min(100, (value / max) * 100)}%` }} /></span>
          </div>
        );
      })}
    </div>
  );
}
