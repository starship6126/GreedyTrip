import { ArrowDown, ArrowRight, ArrowUp, DatabaseZap, Minus } from "lucide-react";
import { compareDecisionSnapshots } from "@/lib/greedy/snapshots";
import type { DecisionSnapshot, MemoryItem } from "@/lib/types";

function Ranking({ snapshot, other, after = false }: { snapshot: DecisionSnapshot; other: DecisionSnapshot; after?: boolean }) {
  const deltas = compareDecisionSnapshots(after ? other : snapshot, after ? snapshot : other, "Semantic memory changed utility");
  return (
    <div className="shift-ranking">
      {snapshot.rankedCandidates.slice(0, 3).map((candidate) => {
        const delta = deltas.find((item) => item.candidateId === candidate.candidateId);
        const rankChange = delta?.beforeRank && delta.afterRank ? delta.beforeRank - delta.afterRank : 0;
        return (
          <div key={candidate.candidateId}>
            <span>{candidate.rank}</span><strong>{candidate.name}</strong><em>{candidate.score.toFixed(1)}</em>
            {after && (rankChange > 0 ? <i className="rank-up"><ArrowUp size={11} />{rankChange}</i> : rankChange < 0 ? <i className="rank-down"><ArrowDown size={11} />{Math.abs(rankChange)}</i> : <i><Minus size={11} /></i>)}
            {after && delta && <small>{delta.beforeScore === undefined
              ? "Entered the visible ranking after recompute"
              : `${delta.scoreDelta >= 0 ? "+" : ""}${delta.scoreDelta.toFixed(1)} · ${delta.primaryCauses[0]}`}</small>}
          </div>
        );
      })}
      {after && other.rankedCandidates.filter((before) => !snapshot.rankedCandidates.some((item) => item.candidateId === before.candidateId)).slice(0, 1).map((item) => (
        <div className="rank-excluded" key={item.candidateId}><span>×</span><strong>{item.name}</strong><em>excluded</em><i><ArrowDown size={11} /></i></div>
      ))}
    </div>
  );
}

export function DecisionShift({ before, after, memory, mossStatus }: { before: DecisionSnapshot; after: DecisionSnapshot; memory: MemoryItem; mossStatus: string }) {
  const largestPenalty = compareDecisionSnapshots(before, after)
    .filter((item) => item.beforeScore !== undefined && item.afterScore !== undefined && item.scoreDelta < 0)
    .sort((a, b) => a.scoreDelta - b.scoreDelta)[0];
  const largestPenaltyName = largestPenalty
    ? before.rankedCandidates.find((item) => item.candidateId === largestPenalty.candidateId)?.name
    : undefined;
  return (
    <section className="decision-shift">
      <div className="shift-title"><span>{"// DECISION SHIFT"}</span><strong>One sentence changed the heuristic.</strong></div>
      <div className="shift-grid">
        <div><h4>Before feedback</h4><Ranking snapshot={before} other={after} /></div>
        <ArrowRight className="shift-arrow" size={18} />
        <div className="taught-card"><span>User taught the agent</span><blockquote>“{memory.text}”</blockquote><div><DatabaseZap size={14} /><strong>{mossStatus === "Live" ? "Stored in Moss" : "Moss fallback memory"}</strong></div><small>Topic: {memory.topic} · Polarity: negative · Strength: {memory.strength}</small>{largestPenalty && largestPenaltyName && <small>Largest semantic penalty: {largestPenaltyName} {largestPenalty.scoreDelta.toFixed(1)}</small>}</div>
        <ArrowRight className="shift-arrow" size={18} />
        <div><h4>After feedback</h4><Ranking snapshot={after} other={before} after /></div>
      </div>
    </section>
  );
}
