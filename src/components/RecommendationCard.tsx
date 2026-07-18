import { ArrowUpRight, Check, CircleHelp, Clock3, ImageIcon, Map, RotateCcw, Star } from "lucide-react";
import type { Recommendation } from "@/lib/types";
import { DecisionCounters } from "@/components/DecisionCounters";

export function RecommendationCard({
  recommendation,
  source,
  frontierCount,
  navigating,
  onAccept,
  onAnother,
  onExplain,
  onVisuals,
}: {
  recommendation: Recommendation;
  source: string;
  frontierCount: number;
  navigating: boolean;
  onAccept: () => void;
  onAnother: () => void;
  onExplain: () => void;
  onVisuals: () => void;
}) {
  const { candidate } = recommendation;
  return (
    <section className="primary-card recommendation-card">
      <div className="recommend-visual">
        {candidate.photoUrls[0] ? (
          // Bright Data controls remote photo hosts, so a standard image is the reliable option.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={candidate.photoUrls[0]} alt={`Photo of ${candidate.name}`} />
        ) : (
          <div className="place-placeholder"><span>{candidate.category}</span><ImageIcon size={36} strokeWidth={1.2} /></div>
        )}
        <span className={`source-label source-${source.toLowerCase()}`}>{source === "Fixture" ? "Synthetic demo fixture" : `${source} place data`}</span>
      </div>
      <div className="recommend-body">
        <div className="commit-label">Committed to the current highest-value move.</div>
        <DecisionCounters frontier={frontierCount} selected={1} />
        <div className="recommend-meta">
          <span><Clock3 size={15} /> {recommendation.walkingMinutes} min walk</span>
          <span>{candidate.category}</span>
          {candidate.rating !== undefined && <span><Star size={14} fill="currentColor" /> {candidate.rating}{candidate.reviewCount !== undefined ? ` · ${candidate.reviewCount.toLocaleString()}` : ""}</span>}
        </div>
        <h2>{candidate.name}</h2>
        {recommendation.explanation ? <div className="three-reasons">
          <div><span>Why this</span><p>{recommendation.explanation.whyThis}</p></div>
          <div><span>Why now</span><p>{recommendation.explanation.whyNow}</p></div>
          <div><span>What changed</span><p>{recommendation.explanation.whatChanged}</p></div>
        </div> : <p className="recommend-reason">{recommendation.conciseReason}</p>}
        <div className="fact-row">
          <span className={candidate.isOpenNow === true ? "known-open" : "unknown-fact"}>{candidate.isOpenNow === true ? "Reported open in source data" : "Current hours unknown"}</span>
          <span>Popularity labels are heuristics</span>
        </div>
        <div className="primary-actions">
          <button type="button" className="accept-button" onClick={onAccept}><Check size={18} /> {navigating ? "Accepted" : "Let’s go"}</button>
          <button type="button" className="secondary-button" onClick={onAnother}><RotateCcw size={17} /> Another</button>
        </div>
        <div className="quiet-actions">
          <button type="button" onClick={onExplain}><CircleHelp size={15} /> Why this</button>
          <button type="button" onClick={onVisuals}><Map size={15} /> Map & photos <ArrowUpRight size={14} /></button>
        </div>
      </div>
    </section>
  );
}
