export type GeoPoint = {
  lat: number;
  lng: number;
  label: string;
};

export type UserProfile = {
  ambience: "quiet" | "lively" | "balanced";
  maxWalkMinutes: 5 | 10 | 20;
  interests: Array<"art" | "food" | "tech" | "hidden">;
  priority: "budget" | "uniqueness" | "comfort" | "balanced";
  interviewComplete: boolean;
};

export type Candidate = {
  id: string;
  placeId?: string;
  name: string;
  category: string;
  sourceKeyword: string;
  address?: string;
  lat: number;
  lng: number;
  rating?: number;
  reviewCount?: number;
  priceLevel?: number;
  website?: string;
  googleMapsUrl?: string;
  photoUrls: string[];
  rawOpeningHours?: unknown;
  isOpenNow: true | false | null;
  closesAt?: string;
  tags: string[];
  fetchedAt: string;
  dataSource: "brightdata-live" | "brightdata-cache" | "fixture";
};

export type MemoryTopic =
  | "ambience"
  | "walking"
  | "interest"
  | "budget"
  | "touristy"
  | "crowding"
  | "availability"
  | "comfort"
  | "other";

export type MemoryItem = {
  id: string;
  text: string;
  polarity: -1 | 1;
  strength: 1 | 2 | 3;
  topic: MemoryTopic;
  kind: "interview" | "acceptance" | "rejection";
  createdAt: string;
};

export type MemoryEvidence = {
  memoryId: string;
  text: string;
  similarity: number;
  polarity: -1 | 1;
  strength: 1 | 2 | 3;
  contribution: number;
};

export type MossSessionMetrics = {
  indexName?: string;
  docCount?: number;
  localIndexStatus?: "ready" | "updated" | "failed";
  localAddDurationMs?: number | null;
  retrievalStatus?: "live" | "fallback";
  queryCount?: number;
  retrievalDurationMs?: number | null;
  cloudSyncStatus?: "idle" | "submitted" | "completed" | "failed";
  lastMemoryText?: string;
  lastSimilarity?: number;
  lastPolarity?: -1 | 1;
  lastStrength?: 1 | 2 | 3;
  memoryFitDelta?: number;
};

export type ScoreBreakdown = {
  preferenceMatch: number;
  accessibility: number;
  rarity: number;
  timeRelevance: number;
  quality: number;
  costPenalty: number;
  waitRiskPenalty: number;
  total: number;
};

export type Recommendation = {
  candidate: Candidate;
  score: number;
  breakdown: ScoreBreakdown;
  evidence: MemoryEvidence[];
  walkingMinutes: number;
  conciseReason: string;
  interventionReason: string;
  utility?: CandidateUtility;
  explanation?: GreedyExplanation;
};

export type GreedyExplanation = {
  whyThis: string;
  whyNow: string;
  whatChanged: string;
};

export type DecisionContext = {
  location: GeoPoint;
  timestamp: string;
  remainingTravelMinutes?: number;
  profile: UserProfile;
  memoryVersion: number;
  currentCandidateId?: string;
  currentCandidateAccepted: boolean;
  excludedCandidateIds: string[];
  unavailableCandidateIds: string[];
  visitedCandidateIds: string[];
  recentCategoryHistory: string[];
  strongCategoryPreference?: string;
  trigger: RefreshTrigger;
};

export type CandidateUtility = {
  candidateId: string;
  rank: number;
  total: number;
  memoryFit: number;
  accessibility: number;
  rightNowOpportunity: number;
  serendipity: number;
  localCharacter: number;
  quality: number;
  travelFriction: number;
  costPenalty: number;
  crowdRiskPenalty: number;
  repetitionPenalty: number;
  switchingFriction: number;
  evidence: MemoryEvidence[];
  explanationFactors: string[];
};

export type GreedyDecision = {
  selectedCandidateId: string;
  selectedUtility: CandidateUtility;
  currentCandidateUtility?: CandidateUtility;
  challengerUtility?: CandidateUtility;
  rawGain?: number;
  switchingFriction: number;
  netGain?: number;
  shouldInterrupt: boolean;
  interventionReason: string;
  silenceReason?: string;
  trigger: RefreshTrigger;
};

export type SnapshotRankedCandidate = {
  candidateId: string;
  name: string;
  category: string;
  rank: number;
  score: number;
};

export type DecisionSnapshot = {
  id: string;
  timestamp: string;
  trigger: RefreshTrigger;
  contextSummary: string;
  memoryVersion: number;
  selectedCandidateId: string;
  selectedScore: number;
  rankedCandidates: SnapshotRankedCandidate[];
  shouldInterrupt: boolean;
  interventionReason: string;
  silenceReason?: string;
};

export type CandidateDecisionDelta = {
  candidateId: string;
  beforeRank?: number;
  afterRank?: number;
  beforeScore?: number;
  afterScore?: number;
  scoreDelta: number;
  primaryCauses: string[];
};

export type IntegrationEvent = {
  id: string;
  timestamp: string;
  system: "brightdata" | "moss" | "openai" | "agent";
  action: string;
  status: string;
  durationMs?: number;
  detail: string;
};

export type RefreshTrigger =
  | "START"
  | "MOVED_300M"
  | "REJECTED"
  | "CURRENT_UNAVAILABLE"
  | "MEAL_WINDOW"
  | "CLOSING_WINDOW"
  | "POOL_LOW"
  | "MANUAL";

export type TurnIntent =
  | "interview_answer"
  | "accept"
  | "reject"
  | "show_map"
  | "show_photos"
  | "explain"
  | "repeat"
  | "report_closed"
  | "report_bad"
  | "pause"
  | "resume"
  | "other";

export type ProfilePatch = Partial<Omit<UserProfile, "interviewComplete">>;

export type TurnInterpretation = {
  intent: TurnIntent;
  profilePatch: ProfilePatch;
  memories: Array<Omit<MemoryItem, "id" | "createdAt">>;
  conciseAcknowledgement: string;
  feedbackReason?: string;
};

export type TranscriptEntry = {
  id: string;
  role: "agent" | "user";
  text: string;
  timestamp: string;
};

export type IntegrationMode = "Live" | "Cached" | "Fixture" | "Fallback" | "Ready";
