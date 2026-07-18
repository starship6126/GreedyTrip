"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { Compass, Pause, Play, RefreshCcw, Route, ShieldCheck, Sparkles } from "lucide-react";
import { AgentStatus } from "@/components/AgentStatus";
import { DebugPanel } from "@/components/DebugPanel";
import { DecisionCounters } from "@/components/DecisionCounters";
import { DecisionShift } from "@/components/DecisionShift";
import { GreedyLoop, type GreedyLoopStep } from "@/components/GreedyLoop";
import { INTERVIEW_QUESTIONS, InterviewCard } from "@/components/InterviewCard";
import { LocationSimulator } from "@/components/LocationSimulator";
import { MapPhotoDrawer } from "@/components/MapPhotoDrawer";
import { RecommendationCard } from "@/components/RecommendationCard";
import { PresentationMode } from "@/components/PresentationMode";
import { Transcript } from "@/components/Transcript";
import { VoiceControls } from "@/components/VoiceControls";
import { useVoiceAgent } from "@/hooks/useVoiceAgent";
import { useWakeLock } from "@/hooks/useWakeLock";
import { DEMO_LOCATIONS, haversineMeters } from "@/lib/geo";
import type {
  Candidate,
  DecisionSnapshot,
  GeoPoint,
  IntegrationEvent,
  GreedyDecision,
  MemoryItem,
  MossSessionMetrics,
  Recommendation,
  RefreshTrigger,
  TranscriptEntry,
  TurnInterpretation,
  UserProfile,
} from "@/lib/types";

type Phase = "idle" | "bootstrapping" | "interviewing" | "ready" | "recommending" | "navigating" | "paused" | "error";

type Health = {
  credentials: { moss: boolean; brightdata: boolean; gemini: boolean; googleMapsEmbed: boolean };
  readiness: { moss: string; brightdata: string; gemini: string };
  cache: { available: boolean; allDemoLocationsReady?: boolean };
};

type State = {
  phase: Phase;
  userId: string;
  tripId: string;
  profile: UserProfile;
  interviewStep: number;
  candidates: Candidate[];
  candidateSource: string;
  candidateDurationMs?: number;
  currentLocation: GeoPoint;
  previousLocation?: GeoPoint;
  movementMeters: number;
  recommendation?: Recommendation;
  ranked: Recommendation[];
  frontierCount: number;
  decision?: GreedyDecision;
  decisionSnapshot?: DecisionSnapshot;
  decisionShift?: { before: DecisionSnapshot; after: DecisionSnapshot; memory: MemoryItem; mossStatus: string };
  currentCandidateAccepted: boolean;
  visitedIds: string[];
  recentCategoryHistory: string[];
  memoryVersion: number;
  loopStep: GreedyLoopStep;
  presentationStage: number;
  excludedIds: string[];
  unavailableIds: string[];
  transcript: TranscriptEntry[];
  integrationEvents: IntegrationEvent[];
  agentLine: string;
  latestUser?: string;
  drawerOpen: boolean;
  lastRefreshTrigger: RefreshTrigger;
  interventionReason: string;
  interpreterSource: string;
  mossStatus: string;
  mossQueryDurationMs: number | null;
  mossSession: MossSessionMetrics;
  keywords: string[];
  busy: boolean;
  error?: string;
  health?: Health;
};

const initialProfile: UserProfile = {
  ambience: "balanced",
  maxWalkMinutes: 10,
  interests: [],
  priority: "balanced",
  interviewComplete: false,
};

const makeInitialState = (): State => ({
  phase: "idle",
  userId: "",
  tripId: "",
  profile: initialProfile,
  interviewStep: 0,
  candidates: [],
  candidateSource: "Fixture",
  currentLocation: DEMO_LOCATIONS[0],
  movementMeters: 0,
  ranked: [],
  frontierCount: 0,
  currentCandidateAccepted: false,
  visitedIds: [],
  recentCategoryHistory: [],
  memoryVersion: 0,
  loopStep: "idle",
  presentationStage: 1,
  excludedIds: [],
  unavailableIds: [],
  transcript: [],
  integrationEvents: [],
  agentLine: "One great next move. Nothing more.",
  drawerOpen: false,
  lastRefreshTrigger: "START",
  interventionReason: "Waiting to start",
  interpreterSource: "Local Interpreter",
  mossStatus: "Fallback",
  mossQueryDurationMs: null,
  mossSession: { indexName: "greedytrip-demo-memory", cloudSyncStatus: "idle" },
  keywords: ["art gallery", "local restaurant", "technology museum", "independent bookstore"],
  busy: false,
});

type Action =
  | { type: "PATCH"; patch: Partial<State> }
  | { type: "TRANSCRIPT"; entry: TranscriptEntry }
  | { type: "EVENTS"; events: IntegrationEvent[] }
  | { type: "RESET"; state?: State };

function reducer(state: State, action: Action): State {
  if (action.type === "PATCH") return { ...state, ...action.patch };
  if (action.type === "TRANSCRIPT") return { ...state, transcript: [...state.transcript, action.entry] };
  if (action.type === "EVENTS") return { ...state, integrationEvents: [...state.integrationEvents, ...action.events] };
  return action.state ?? makeInitialState();
}

async function jsonRequest<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, body === undefined ? undefined : {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const value = (await response.json()) as T & { error?: string; detail?: string };
  if (!response.ok) throw new Error(value.detail ?? value.error ?? `Request failed (${response.status})`);
  return value;
}

function transcript(role: "agent" | "user", text: string): TranscriptEntry {
  return { id: crypto.randomUUID(), role, text, timestamp: new Date().toISOString() };
}

export default function Home() {
  const [state, dispatch] = useReducer(reducer, undefined, makeInitialState);
  const stateRef = useRef(state);
  const candidatePromiseRef = useRef<Promise<Candidate[]> | null>(null);
  const utteranceHandlerRef = useRef<(value: string) => Promise<void>>(async () => undefined);
  const voice = useVoiceAgent((value) => utteranceHandlerRef.current(value));
  const wakeLock = useWakeLock();

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => {
    void jsonRequest<Health>("/api/health").then((health) => dispatch({ type: "PATCH", patch: { health } })).catch(() => undefined);
    try {
      const saved = localStorage.getItem("greedytrip-profile");
      if (saved) dispatch({ type: "PATCH", patch: { profile: { ...initialProfile, ...JSON.parse(saved) as UserProfile } } });
    } catch {
      // Corrupt client state should never block the demo.
    }
  }, []);

  const appendAgent = useCallback((text: string) => {
    dispatch({ type: "TRANSCRIPT", entry: transcript("agent", text) });
    dispatch({ type: "PATCH", patch: { agentLine: text } });
  }, []);

  const loadCandidates = useCallback(async (location: GeoPoint, trigger: RefreshTrigger, forceRefresh = false) => {
    dispatch({ type: "PATCH", patch: { loopStep: "observe" } });
    const result = await jsonRequest<{
      candidates: Candidate[];
      source: string;
      durationMs: number;
      keywords: string[];
      integrationEvents: IntegrationEvent[];
      error?: string;
    }>("/api/candidates", { location, trigger, forceRefresh });
    dispatch({ type: "PATCH", patch: {
      candidates: result.candidates,
      candidateSource: result.source,
      candidateDurationMs: result.durationMs,
      keywords: result.keywords,
      error: result.error,
    } });
    dispatch({ type: "EVENTS", events: result.integrationEvents });
    try { localStorage.setItem("greedytrip-candidate-source", JSON.stringify({ source: result.source, at: new Date().toISOString() })); } catch {}
    return result.candidates;
  }, []);

  const requestRecommendation = useCallback(async ({
    trigger,
    profile,
    candidates,
    location,
    previousLocation,
    excludedIds,
    unavailableIds,
    currentCandidateId,
    speechPrefix,
    memoryVersion,
    currentCandidateAccepted,
    visitedIds,
    recentCategoryHistory,
  }: {
    trigger: RefreshTrigger;
    profile: UserProfile;
    candidates: Candidate[];
    location: GeoPoint;
    previousLocation?: GeoPoint;
    excludedIds: string[];
    unavailableIds: string[];
    currentCandidateId?: string;
    speechPrefix?: string;
    memoryVersion: number;
    currentCandidateAccepted: boolean;
    visitedIds: string[];
    recentCategoryHistory: string[];
  }) => {
    dispatch({ type: "PATCH", patch: { phase: "recommending", busy: true, lastRefreshTrigger: trigger, loopStep: trigger === "START" ? "rank" : "recompute" } });
    voice.setThinking(true);
    try {
      const result = await jsonRequest<{
        recommendation: Recommendation;
        rankedTopFive: Recommendation[];
        mossStatus: string;
        mossQueryDurationMs: number | null;
        mossSession?: MossSessionMetrics;
        intervention: { speak: boolean; reason: string };
        decision: GreedyDecision;
        decisionSnapshot: DecisionSnapshot;
        frontierCount: number;
        integrationEvents: IntegrationEvent[];
      }>("/api/recommend", {
        userId: stateRef.current.userId,
        tripId: stateRef.current.tripId,
        profile,
        candidates,
        location,
        previousLocation,
        currentTime: new Date().toISOString(),
        excludedCandidateIds: excludedIds,
        unavailableCandidateIds: unavailableIds,
        currentCandidateId,
        currentCandidateAccepted,
        visitedCandidateIds: visitedIds,
        recentCategoryHistory,
        memoryVersion,
        trigger,
      });
      const nextStage = trigger === "START"
        ? 2
        : trigger === "REJECTED"
          ? 3
          : trigger === "MOVED_300M"
            ? (result.intervention.speak ? 5 : 4)
            : trigger === "CURRENT_UNAVAILABLE"
              ? 5
              : stateRef.current.presentationStage;
      dispatch({ type: "PATCH", patch: {
        phase: "ready",
        busy: false,
        recommendation: result.recommendation,
        ranked: result.rankedTopFive,
        agentLine: result.intervention.speak ? result.recommendation.conciseReason : stateRef.current.agentLine,
        mossStatus: result.mossSession?.retrievalStatus ?? result.mossStatus,
        mossQueryDurationMs: result.mossSession?.retrievalDurationMs ?? result.mossQueryDurationMs,
        mossSession: {
          ...stateRef.current.mossSession,
          ...result.mossSession,
          indexName: result.mossSession?.indexName ?? stateRef.current.mossSession.indexName ?? "greedytrip-demo-memory",
          retrievalStatus: result.mossSession?.retrievalStatus ?? (result.mossStatus === "Live" ? "live" : "fallback"),
          queryCount: result.mossSession?.queryCount ?? candidates.length,
          retrievalDurationMs: result.mossSession?.retrievalDurationMs ?? result.mossQueryDurationMs,
        },
        interventionReason: result.intervention.reason,
        decision: result.decision,
        decisionSnapshot: result.decisionSnapshot,
        frontierCount: result.frontierCount,
        currentCandidateAccepted: result.recommendation.candidate.id === currentCandidateId ? currentCandidateAccepted : false,
        loopStep: "commit",
        presentationStage: nextStage,
        error: undefined,
      } });
      dispatch({ type: "EVENTS", events: result.integrationEvents });
      if (result.intervention.speak) {
        dispatch({ type: "TRANSCRIPT", entry: transcript("agent", result.recommendation.conciseReason) });
        voice.speak(speechPrefix ? `${speechPrefix} ${result.recommendation.conciseReason}` : result.recommendation.conciseReason, true);
      }
      else voice.setThinking(false);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "I couldn’t recalculate just now.";
      dispatch({ type: "PATCH", patch: { phase: stateRef.current.recommendation ? "ready" : "error", busy: false, error: message } });
      voice.setThinking(false);
      return undefined;
    }
  }, [voice]);

  const startTrip = useCallback(() => {
    const userId = localStorage.getItem("greedytrip-user-id") ?? `traveler-${crypto.randomUUID()}`;
    localStorage.setItem("greedytrip-user-id", userId);
    const fresh: State = {
      ...makeInitialState(),
      userId,
      tripId: crypto.randomUUID(),
      phase: "interviewing",
      profile: { ...stateRef.current.profile, interviewComplete: false },
      health: stateRef.current.health,
      agentLine: INTERVIEW_QUESTIONS[0].question,
      loopStep: "observe",
      transcript: [transcript("agent", INTERVIEW_QUESTIONS[0].question)],
    };
    dispatch({ type: "RESET", state: fresh });
    stateRef.current = fresh;
    candidatePromiseRef.current = loadCandidates(fresh.currentLocation, "START").catch(() => []);
    void wakeLock.request();
    voice.activate();
    voice.speak(INTERVIEW_QUESTIONS[0].question);
  }, [loadCandidates, voice, wakeLock]);

  const handleUtterance = useCallback(async (utterance: string) => {
    const current = stateRef.current;
    if (current.phase === "idle" || current.busy) return;
    dispatch({ type: "TRANSCRIPT", entry: transcript("user", utterance) });
    dispatch({ type: "PATCH", patch: { latestUser: utterance, busy: true, error: undefined } });
    voice.setThinking(true);
    try {
      const isInterview = current.phase === "interviewing";
      const result = await jsonRequest<{
        interpretation: TurnInterpretation;
        acknowledgement: string;
        interpreterSource: string;
        mossStatus: { mode: string; docCount: number; detail: string };
        mossSession?: MossSessionMetrics;
        memoriesAdded: MemoryItem[];
        integrationEvents: IntegrationEvent[];
      }>("/api/agent/turn", {
        userId: current.userId,
        tripId: current.tripId,
        tripPhase: isInterview ? "interviewing" : current.phase === "navigating" ? "navigating" : current.phase === "paused" ? "paused" : "ready",
        utterance,
        interviewStep: isInterview ? current.interviewStep : undefined,
        currentCandidate: current.recommendation?.candidate,
      });
      dispatch({ type: "EVENTS", events: result.integrationEvents });
      const nextMemoryVersion = current.memoryVersion + result.memoriesAdded.length;
      const mossUpdateEvent = result.integrationEvents.find((event) => event.system === "moss" && event.action === "add semantic memory");
      dispatch({ type: "PATCH", patch: {
        interpreterSource: result.interpreterSource,
        mossStatus: result.mossSession?.retrievalStatus ?? result.mossStatus.mode,
        mossSession: {
          ...current.mossSession,
          ...result.mossSession,
          indexName: result.mossSession?.indexName ?? current.mossSession.indexName ?? "greedytrip-demo-memory",
          docCount: result.mossSession?.docCount ?? result.mossStatus.docCount,
          localIndexStatus: result.mossSession?.localIndexStatus ?? (result.mossStatus.mode === "Live" ? "updated" : "failed"),
          localAddDurationMs: result.mossSession?.localAddDurationMs ?? mossUpdateEvent?.durationMs,
        },
        memoryVersion: nextMemoryVersion,
        loopStep: result.memoriesAdded.length ? "learn" : current.loopStep,
      } });

      if (isInterview) {
        const nextProfile: UserProfile = { ...current.profile, ...result.interpretation.profilePatch };
        if (current.interviewStep < 3) {
          const nextStep = current.interviewStep + 1;
          const line = `${result.acknowledgement} ${INTERVIEW_QUESTIONS[nextStep].question}`;
          dispatch({ type: "PATCH", patch: { profile: nextProfile, interviewStep: nextStep, busy: false, agentLine: INTERVIEW_QUESTIONS[nextStep].question, memoryVersion: nextMemoryVersion, loopStep: "learn" } });
          dispatch({ type: "TRANSCRIPT", entry: transcript("agent", line) });
          voice.speak(line, true);
          return;
        }

        nextProfile.interviewComplete = true;
        localStorage.setItem("greedytrip-profile", JSON.stringify(nextProfile));
        dispatch({ type: "PATCH", patch: { profile: nextProfile, busy: true } });
        const summary = "I won’t plan your whole day. I’ll choose one strong next move and recalculate whenever your situation changes.";
        dispatch({ type: "TRANSCRIPT", entry: transcript("agent", summary) });
        const candidates = current.candidates.length
          ? current.candidates
          : await (candidatePromiseRef.current ?? loadCandidates(current.currentLocation, "START"));
        await requestRecommendation({
          trigger: "START",
          profile: nextProfile,
          candidates,
          location: current.currentLocation,
          excludedIds: [],
          unavailableIds: [],
          speechPrefix: summary,
          memoryVersion: nextMemoryVersion,
          currentCandidateAccepted: false,
          visitedIds: [],
          recentCategoryHistory: [],
        });
        return;
      }

      const interpretation = result.interpretation;
      const hasPreferenceUpdate = result.memoriesAdded.length > 0 || Object.keys(interpretation.profilePatch).length > 0;
      if (interpretation.intent === "other" && current.recommendation && hasPreferenceUpdate) {
        const nextProfile = { ...current.profile, ...interpretation.profilePatch };
        localStorage.setItem("greedytrip-profile", JSON.stringify(nextProfile));
        dispatch({ type: "PATCH", patch: { profile: nextProfile, busy: true } });
        const recomputed = await requestRecommendation({
          trigger: "PREFERENCE_UPDATED",
          profile: nextProfile,
          candidates: current.candidates,
          location: current.currentLocation,
          excludedIds: current.excludedIds,
          unavailableIds: current.unavailableIds,
          currentCandidateId: current.recommendation.candidate.id,
          speechPrefix: result.acknowledgement,
          memoryVersion: nextMemoryVersion,
          currentCandidateAccepted: current.currentCandidateAccepted,
          visitedIds: current.visitedIds,
          recentCategoryHistory: current.recentCategoryHistory,
        });
        if (!recomputed?.intervention.speak) {
          appendAgent(result.acknowledgement);
          voice.speak(result.acknowledgement, true);
        }
        return;
      }
      if (["show_map", "show_photos"].includes(interpretation.intent)) {
        dispatch({ type: "PATCH", patch: { drawerOpen: true, busy: false, agentLine: result.acknowledgement, presentationStage: 6 } });
        dispatch({ type: "TRANSCRIPT", entry: transcript("agent", result.acknowledgement) });
        voice.speak(result.acknowledgement, true);
        return;
      }
      if (interpretation.intent === "accept") {
        const category = current.recommendation?.candidate.tags.includes("art") ? "art" : current.recommendation?.candidate.tags.includes("food") ? "food" : current.recommendation?.candidate.category.toLowerCase();
        dispatch({ type: "PATCH", patch: { phase: "navigating", busy: false, agentLine: result.acknowledgement, currentCandidateAccepted: true, recentCategoryHistory: category ? [...current.recentCategoryHistory, category].slice(-6) : current.recentCategoryHistory } });
        dispatch({ type: "TRANSCRIPT", entry: transcript("agent", result.acknowledgement) });
        voice.speak(result.acknowledgement, true);
        return;
      }
      if (interpretation.intent === "reject" && current.recommendation) {
        const hasTouristyMemory = result.memoriesAdded.some((memory) => memory.topic === "touristy");
        const excludedIds = [...new Set([...current.excludedIds, current.recommendation.candidate.id])];
        const rejectedCategory = current.recommendation.candidate.tags.includes("art") ? "art" : current.recommendation.candidate.tags.includes("food") ? "food" : current.recommendation.candidate.category.toLowerCase();
        const recentCategoryHistory = [...current.recentCategoryHistory, rejectedCategory].slice(-6);
        dispatch({ type: "PATCH", patch: { excludedIds, busy: true, recentCategoryHistory, currentCandidateAccepted: false } });
        dispatch({ type: "TRANSCRIPT", entry: transcript("agent", result.acknowledgement) });
        const recomputed = await requestRecommendation({
          trigger: "REJECTED",
          profile: { ...current.profile, ...interpretation.profilePatch },
          candidates: current.candidates,
          location: current.currentLocation,
          excludedIds,
          unavailableIds: current.unavailableIds,
          currentCandidateId: current.recommendation.candidate.id,
          speechPrefix: hasTouristyMemory ? "Understood. I’ll deprioritize heavily visited places." : result.acknowledgement,
          memoryVersion: nextMemoryVersion,
          currentCandidateAccepted: false,
          visitedIds: current.visitedIds,
          recentCategoryHistory,
        });
        if (current.decisionSnapshot && recomputed?.decisionSnapshot && result.memoriesAdded[0]) {
          dispatch({ type: "PATCH", patch: { decisionShift: { before: current.decisionSnapshot, after: recomputed.decisionSnapshot, memory: result.memoriesAdded[0], mossStatus: result.mossStatus.mode }, presentationStage: 3 } });
        }
        return;
      }
      if (interpretation.intent === "report_closed" && current.recommendation) {
        const unavailableIds = [...new Set([...current.unavailableIds, current.recommendation.candidate.id])];
        dispatch({ type: "PATCH", patch: { unavailableIds, busy: true } });
        await requestRecommendation({
          trigger: "CURRENT_UNAVAILABLE",
          profile: current.profile,
          candidates: current.candidates,
          location: current.currentLocation,
          excludedIds: current.excludedIds,
          unavailableIds,
          currentCandidateId: current.recommendation.candidate.id,
          speechPrefix: result.acknowledgement,
          memoryVersion: nextMemoryVersion,
          currentCandidateAccepted: false,
          visitedIds: current.visitedIds,
          recentCategoryHistory: current.recentCategoryHistory,
        });
        return;
      }
      if (interpretation.intent === "explain" && current.recommendation) {
        const line = `${current.recommendation.conciseReason} The numerical breakdown is visible in Judge view.`;
        appendAgent(line);
        dispatch({ type: "PATCH", patch: { busy: false } });
        voice.speak(line, true);
        return;
      }
      if (interpretation.intent === "repeat") {
        dispatch({ type: "PATCH", patch: { busy: false } });
        voice.speak(current.agentLine, true);
        return;
      }
      if (interpretation.intent === "pause") {
        dispatch({ type: "PATCH", patch: { phase: "paused", busy: false, agentLine: result.acknowledgement } });
        await wakeLock.release();
        voice.pause();
        return;
      }
      if (interpretation.intent === "resume") {
        dispatch({ type: "PATCH", patch: { phase: "ready", busy: false, agentLine: result.acknowledgement } });
        void wakeLock.request();
        voice.resume();
        voice.speak(result.acknowledgement, true);
        return;
      }
      appendAgent(result.acknowledgement);
      dispatch({ type: "PATCH", patch: { busy: false } });
      voice.speak(result.acknowledgement, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "That turn didn’t go through. Use a button or try text again.";
      dispatch({ type: "PATCH", patch: { busy: false, error: message } });
      voice.setThinking(false);
    }
  }, [appendAgent, loadCandidates, requestRecommendation, voice, wakeLock]);
  useEffect(() => {
    utteranceHandlerRef.current = handleUtterance;
  }, [handleUtterance]);

  const moveTo = useCallback((location: GeoPoint) => {
    const current = stateRef.current;
    const distance = haversineMeters(current.currentLocation, location);
    dispatch({ type: "PATCH", patch: { previousLocation: current.currentLocation, currentLocation: location, movementMeters: distance } });
    if (current.phase === "idle" || distance < 300 || !current.profile.interviewComplete) return;
    dispatch({ type: "PATCH", patch: { lastRefreshTrigger: "MOVED_300M" } });
    void (async () => {
      const refreshedCandidates = await loadCandidates(location, "MOVED_300M").catch(() => current.candidates);
      await requestRecommendation({
        trigger: "MOVED_300M",
        profile: current.profile,
        candidates: refreshedCandidates,
        location,
        previousLocation: current.currentLocation,
        excludedIds: current.excludedIds,
        unavailableIds: current.unavailableIds,
        currentCandidateId: current.recommendation?.candidate.id,
        memoryVersion: current.memoryVersion,
        currentCandidateAccepted: current.currentCandidateAccepted,
        visitedIds: current.visitedIds,
        recentCategoryHistory: current.recentCategoryHistory,
      });
    })();
  }, [loadCandidates, requestRecommendation]);

  const useRealLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      dispatch({ type: "PATCH", patch: { error: "Geolocation is unavailable; the simulator still works." } });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => moveTo({ lat: position.coords.latitude, lng: position.coords.longitude, label: "Current browser location" }),
      () => dispatch({ type: "PATCH", patch: { error: "Location permission was denied; the simulator is still active." } }),
      { timeout: 8_000, maximumAge: 60_000 },
    );
  }, [moveTo]);

  const resetDemo = useCallback(() => {
    localStorage.removeItem("greedytrip-user-id");
    localStorage.removeItem("greedytrip-profile");
    localStorage.removeItem("greedytrip-candidate-source");
    candidatePromiseRef.current = null;
    voice.pause();
    void wakeLock.release();
    dispatch({ type: "RESET" });
  }, [voice, wakeLock]);

  const simulatedEvent = useCallback((action: string) => {
    dispatch({ type: "EVENTS", events: [{
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      system: "agent",
      action,
      status: "Simulated demo event",
      detail: "Presentation Mode control used; this action is explicitly simulated.",
    }] });
  }, []);

  const presentationAction = useCallback((label: string, action: () => void) => {
    action();
    window.setTimeout(() => simulatedEvent(label), 0);
  }, [simulatedEvent]);

  const healthBadges = [
    {
      name: "Bright Data",
      mode: state.phase === "idle"
        ? (state.health?.cache.allDemoLocationsReady ? "Cached" : state.health?.credentials.brightdata ? "Ready" : "Fixture")
        : state.candidateSource,
    },
    { name: "Moss", mode: state.phase === "idle" ? (state.health?.readiness.moss === "Live-ready" ? "Ready" : "Fallback") : state.mossStatus },
    {
      name: "Gemini",
      mode: state.interpreterSource === "Gemini Live"
        ? "Live"
        : state.health?.credentials.gemini ? "Hybrid" : "Local",
    },
  ];

  return (
    <main className="app-shell">
      <header className="site-header">
        <div className="brand-lockup"><div className="brand-mark"><Compass size={20} /></div><div><strong>GreedyTrip</strong><span>Greedy Search &times; Travel</span></div></div>
        <div className="header-actions">
          <div className="integration-badges">{healthBadges.map((badge) => <span key={badge.name}><i className={`mode-${badge.mode.toLowerCase()}`} />{badge.name} · {badge.mode}</span>)}</div>
          {state.phase !== "idle" && <button type="button" className="icon-text-button" onClick={() => state.phase === "paused" ? void handleUtterance("resume") : void handleUtterance("pause")}>
            {state.phase === "paused" ? <Play size={15} /> : <Pause size={15} />}{state.phase === "paused" ? "Resume" : "Pause"}
          </button>}
          <button type="button" className="icon-text-button" onClick={resetDemo}><RefreshCcw size={15} /> Reset</button>
        </div>
      </header>

      <div className="page-grid">
        <div className="main-column">
          <AgentStatus status={voice.status} agentLine={state.agentLine} userLine={state.latestUser} />
          <GreedyLoop active={state.loopStep} />
          {state.error && <div className="error-banner" role="status">{state.error}</div>}

          {state.phase === "idle" ? (
            <section className="start-card">
              <div className="start-icon"><Route size={26} /></div>
              <span className="eyebrow"><Sparkles size={14} /> {"// GREEDY SEARCH × TRIP"}</span>
              <h2>No itinerary.<br />One best next move.</h2>
              <p>Continuously re-optimized as the world and your preferences change. GreedyTrip is an online travel decision agent: it observes, chooses one move, learns, and recomputes.</p>
              <code className="argmax-formula">next = argmax utility(place | now, memory)</code>
              <DecisionCounters frontier={0} selected={0} />
              <button type="button" className="start-button" onClick={startTrip}>Start trip <Play size={17} fill="currentColor" /></button>
              <div className="trust-row"><span><ShieldCheck size={15} /> Works without credentials</span><span>Voice + text + buttons</span><span>Synthetic data is labeled</span></div>
            </section>
          ) : state.phase === "interviewing" ? (
            <InterviewCard step={state.interviewStep} busy={state.busy} onAnswer={(value) => void handleUtterance(value)} />
          ) : state.recommendation ? (
            <RecommendationCard
              recommendation={state.recommendation}
              source={state.candidateSource}
              frontierCount={state.frontierCount || state.candidates.length}
              navigating={state.phase === "navigating"}
              onAccept={() => void handleUtterance("Yes, let’s go")}
              onAnother={() => void handleUtterance("Another one")}
              onExplain={() => void handleUtterance("Why this?")}
              onVisuals={() => dispatch({ type: "PATCH", patch: { drawerOpen: true, presentationStage: 6 } })}
            />
          ) : (
            <section className="primary-card loading-card"><div className="loading-pulse" /><h2>Calculating your strongest next move…</h2><p>Hard constraints first, semantic preferences second.</p></section>
          )}

          {state.phase !== "idle" && <VoiceControls status={voice.status} supported={voice.supported} active={voice.active} interim={voice.interimTranscript} disabled={state.busy} onToggle={voice.toggle} onSubmit={(value) => void handleUtterance(value)} />}
          <LocationSimulator current={state.currentLocation} movementMeters={state.movementMeters} onMove={moveTo} onRealLocation={useRealLocation} />
          <div className="capability-row">
            <span className={voice.supported ? "capability-on" : "capability-off"}>Microphone {voice.supported ? (voice.active ? "Active" : "Ready") : "Unavailable"}</span>
            <span className={wakeLock.supported ? "capability-on" : "capability-off"}>Screen {wakeLock.supported ? (wakeLock.active ? "Awake" : "Wake-ready") : "Unsupported"}</span>
            <span className="capability-on">{voice.supported ? "Voice Live" : "Text Fallback"}</span>
            <small>Page-active browser experience; not locked-screen background audio.</small>
          </div>
          <Transcript entries={state.transcript} />
        </div>

        <aside className="side-column">
          <PresentationMode
            stage={state.presentationStage}
            onReset={() => presentationAction("Reset Demo", resetDemo)}
            onStart={() => presentationAction("Start Interview", startTrip)}
            onTouristy={() => presentationAction("Submit touristy feedback", () => void handleUtterance("That feels too touristy"))}
            onMove={(index) => presentationAction(`Move to ${DEMO_LOCATIONS[index].label}`, () => moveTo(DEMO_LOCATIONS[index]))}
            onUnavailable={() => presentationAction("Mark Current Place Unavailable", () => void handleUtterance("It is closed"))}
            onVisuals={() => presentationAction("Open Map & Photos", () => dispatch({ type: "PATCH", patch: { drawerOpen: true, presentationStage: 6 } }))}
            onReplay={() => presentationAction("Replay Latest Agent Line", () => voice.speak(stateRef.current.agentLine, true))}
            silenceReason={state.decision && !state.decision.shouldInterrupt ? state.decision.silenceReason : undefined}
            touristyDisabled={state.phase === "idle" || state.phase === "interviewing" || !state.recommendation || state.busy}
            movementDisabled={state.phase === "idle" || state.phase === "interviewing" || !state.profile.interviewComplete || state.busy}
            unavailableDisabled={state.phase === "idle" || state.phase === "interviewing" || !state.recommendation || state.busy}
          />
          {state.decisionShift && <DecisionShift before={state.decisionShift.before} after={state.decisionShift.after} memory={state.decisionShift.memory} mossStatus={state.decisionShift.mossStatus} />}
          <DebugPanel
            source={state.candidateSource}
            durationMs={state.candidateDurationMs}
            candidateCount={state.candidates.length}
            keywords={state.keywords}
            mossStatus={state.mossStatus}
            mossQueryDurationMs={state.mossQueryDurationMs}
            mossSession={state.mossSession}
            interpreterSource={state.interpreterSource}
            trigger={state.lastRefreshTrigger}
            interventionReason={state.interventionReason}
            recommendation={state.recommendation}
            ranked={state.ranked}
            events={state.integrationEvents}
            decision={state.decision}
          />
          <div className="principle-card"><span>01</span><h3>One move only</h3><p>No day plan. No five-way choice. One provisional decision under the current state.</p></div>
          <div className="principle-card"><span>02</span><h3>Frontier + heuristic + argmax</h3><p>Bright Data builds the frontier. Moss retrieves preference evidence. GreedyTrip applies the heuristic and chooses the next node.</p></div>
        </aside>
      </div>

      <MapPhotoDrawer candidate={state.recommendation?.candidate} open={state.drawerOpen} onClose={() => dispatch({ type: "PATCH", patch: { drawerOpen: false } })} />
    </main>
  );
}
