import { Activity, Braces, DatabaseZap, Gauge, Search, Sparkles } from "lucide-react";
import { MemoryEvidence } from "@/components/MemoryEvidence";
import { ScoreBreakdown } from "@/components/ScoreBreakdown";
import { UtilityBreakdown } from "@/components/UtilityBreakdown";
import { GREEDY_CONFIG } from "@/lib/greedy/types";
import type { GreedyDecision, IntegrationEvent, MossSessionMetrics, Recommendation, RefreshTrigger } from "@/lib/types";

const MOSS_INDEX_NAME = "greedytrip-demo-memory";

function measured(value: number | null | undefined, suffix = ""): string {
  return value === null || value === undefined ? "—" : `${value}${suffix}`;
}

export function DebugPanel({
  source,
  durationMs,
  candidateCount,
  keywords,
  mossStatus,
  mossQueryDurationMs,
  mossSession,
  interpreterSource,
  trigger,
  interventionReason,
  recommendation,
  ranked,
  events,
  decision,
}: {
  source: string;
  durationMs?: number;
  candidateCount: number;
  keywords: string[];
  mossStatus: string;
  mossQueryDurationMs: number | null;
  mossSession?: MossSessionMetrics;
  interpreterSource: string;
  trigger: RefreshTrigger;
  interventionReason: string;
  recommendation?: Recommendation;
  ranked: Recommendation[];
  events: IntegrationEvent[];
  decision?: GreedyDecision;
}) {
  const retrievalStatus = mossSession?.retrievalStatus ?? (mossStatus.toLowerCase() === "live" ? "live" : "fallback");
  const retrievalDurationMs = mossSession?.retrievalDurationMs ?? mossQueryDurationMs;
  return (
    <details className="debug-panel">
      <summary><span><Braces size={16} /> Judge view</span><span className="debug-summary">Sponsor proof + scoring</span></summary>
      <div className="debug-content">
        <div className="debug-grid">
          <div className="debug-stat"><DatabaseZap size={16} /><span>Bright Data</span><strong>{source}</strong><small>{candidateCount} candidates{durationMs !== undefined ? ` | ${durationMs} ms` : ""}</small></div>
          <div className="debug-stat"><Sparkles size={16} /><span>Moss retrieval</span><strong>{retrievalStatus}</strong><small>{retrievalDurationMs === null ? "Fallback latency not labeled as Moss" : `${retrievalDurationMs} ms measured query`}</small></div>
          <div className="debug-stat"><Activity size={16} /><span>Interpreter</span><strong>{interpreterSource}</strong><small>Language only | never scoring</small></div>
          <div className="debug-stat"><Gauge size={16} /><span>Refresh trigger</span><strong>{trigger}</strong><small>{interventionReason}</small></div>
        </div>
        <div className="debug-section decision-math">
          <h4><DatabaseZap size={15} /> Moss session</h4>
          <div><span>Index</span><strong>{mossSession?.indexName ?? MOSS_INDEX_NAME}</strong></div>
          <div><span>Documents in local session</span><strong>{measured(mossSession?.docCount)}</strong></div>
          <div><span>Local index</span><strong>{mossSession?.localIndexStatus ?? "—"}</strong></div>
          <div><span>Local memory update</span><strong>{measured(mossSession?.localAddDurationMs, " ms")}</strong></div>
          <div><span>Retrieval</span><strong>{retrievalStatus}</strong></div>
          <div><span>Candidate memory queries</span><strong>{measured(mossSession?.queryCount)}</strong></div>
          <div><span>Retrieval latency</span><strong>{measured(retrievalDurationMs, " ms")}</strong></div>
          <div><span>Cloud checkpoint</span><strong>{mossSession?.cloudSyncStatus ?? "idle"}</strong></div>
          {mossSession?.lastMemoryText && <p className="decision-silent"><strong>Retrieved evidence:</strong> {mossSession.lastMemoryText}<br />Similarity {measured(mossSession.lastSimilarity)} · Polarity {measured(mossSession.lastPolarity)} · Strength {measured(mossSession.lastStrength)} · Memory Fit Δ {measured(mossSession.memoryFitDelta)}</p>}
        </div>
        <div className="debug-section"><h4><Search size={15} /> Discovery keywords</h4><div className="keyword-list">{keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}</div></div>
        {recommendation && <>
          <div className="debug-section"><h4>Memory evidence for #1</h4><MemoryEvidence evidence={recommendation.evidence} /></div>
          <div className="debug-section"><h4>Utility | {recommendation.score.toFixed(1)} / 100</h4>{recommendation.utility ? <UtilityBreakdown utility={recommendation.utility} /> : <ScoreBreakdown breakdown={recommendation.breakdown} />}</div>
        </>}
        {decision && <div className="debug-section decision-math">
          <h4>Switch decision</h4>
          <div><span>Raw gain</span><strong>{decision.rawGain === undefined ? "-" : `${decision.rawGain >= 0 ? "+" : ""}${decision.rawGain.toFixed(1)}`}</strong></div>
          <div><span>Switching friction</span><strong>-{decision.switchingFriction.toFixed(1)}</strong></div>
          <div><span>Net gain</span><strong>{decision.netGain === undefined ? "-" : `${decision.netGain >= 0 ? "+" : ""}${decision.netGain.toFixed(1)}`}</strong></div>
          <div><span>Threshold</span><strong>{GREEDY_CONFIG.interventionThreshold}</strong></div>
          <p className={decision.shouldInterrupt ? "decision-interrupt" : "decision-silent"}>
            {decision.shouldInterrupt
              ? "Decision: Interrupt"
              : `Decision: Silent - ${ranked.find((item) => item.candidate.id === decision.challengerUtility?.candidateId)?.candidate.name ?? "The strongest challenger"} changed the ranking, but ${decision.netGain?.toFixed(1) ?? "0.0"} net points did not cross the threshold. ${decision.silenceReason ?? decision.interventionReason}`}
          </p>
        </div>}
        <div className="debug-section">
          <h4>Top five after hard filters</h4>
          <div className="ranking-table">{ranked.length ? ranked.map((item, index) => <div key={item.candidate.id}><span>0{index + 1}</span><strong>{item.candidate.name}</strong><em>{item.score.toFixed(1)}</em></div>) : <p>Complete the interview to rank candidates.</p>}</div>
        </div>
        <div className="debug-section"><h4>Recent integration events</h4><div className="event-list">{events.slice(-6).reverse().map((event) => <div key={event.id}><span>{event.system}</span><strong>{event.status}</strong><p>{event.detail}</p></div>)}</div></div>
        <p className="debug-rule"><strong>Bright Data builds the frontier. Moss retrieves preference evidence. GreedyTrip applies the heuristic and chooses the next node.</strong><br />Hard constraints stay structured; the utility function and argmax selection remain deterministic.</p>
      </div>
    </details>
  );
}
